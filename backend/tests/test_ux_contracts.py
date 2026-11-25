"""Regression boundaries for Phase 1: document behavior without changing domain code."""
import asyncio
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from openpyxl import load_workbook
from pypdf import PdfReader
from app import database
from app.main import (OrderReviewPayload, OrderItemPayload, create_manual_order, review_order,
                      analyze_order, get_order, dashboard, export_order, export_order_pdf)
from app.packing import BoxSpec, PackedBox, Unit, place_unit, _serialize_plan


class UXContractTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.path_patch = patch.object(database, 'DB_PATH', Path(self.folder.name)/'contracts.db')
        self.path_patch.start()
        database.init_db()

    def tearDown(self):
        self.path_patch.stop()
        self.folder.cleanup()

    def test_plan_utilization_is_volume_weighted(self):
        small = PackedBox(BoxSpec(1, 'S', 'Small', 10, 10, 10, .1, 10))
        large = PackedBox(BoxSpec(2, 'L', 'Large', 20, 10, 10, .1, 10))
        for box in [small, large]:
            self.assertTrue(place_unit(box, Unit(str(box.spec.id), 'P', 'Unit', 10, 10, 5, 1)))
        plan = _serialize_plan([small, large], [], 2)
        self.assertEqual([b['utilization'] for b in plan['boxes']], [50, 25])
        self.assertEqual(plan['average_utilization'], 33.3)
        self.assertNotEqual(plan['average_utilization'], 37.5)

    def test_dashboard_remains_an_arithmetic_mean_of_latest_order_plans(self):
        with database.connect() as db:
            ids = [r['id'] for r in db.execute('SELECT id FROM orders ORDER BY id LIMIT 2')]
            for order_id, percentage in zip(ids, [50, 25]):
                db.execute('INSERT INTO packing_plans (order_id, box_count, average_utilization, total_weight_kg, result_json, created_at) VALUES (?,1,?,1,?,?)', (order_id, percentage, json.dumps({}), database.now_iso()))
        self.assertEqual(dashboard()['kpis']['average_utilization'], 37.5)

    def test_review_preserves_supplied_money_and_separate_terms_notes(self):
        payload = OrderReviewPayload(order_number='QA-CONTRACT', client='Synthetic', subtotal=91,
            tax_amount=4, total_amount=95, terms='Net 30', notes='Keep separate',
            items=[OrderItemPayload(description='Guantes de nitrilo · caja', quantity=2,
                                   unit_price=10, discount_percent=10, amount=7)])
        order = create_manual_order(payload)
        analyze_order(order['id'])
        reviewed = review_order(order['id'], payload)
        self.assertIsNone(reviewed['plan'])
        self.assertEqual(reviewed['status'], 'ready')
        self.assertEqual((reviewed['subtotal'],reviewed['tax_amount'],reviewed['total_amount']), (91,4,95))
        self.assertEqual((reviewed['terms'],reviewed['notes']), ('Net 30','Keep separate'))
        self.assertEqual(reviewed['items'][0]['amount'], 7)
        self.assertEqual(reviewed['items'][0]['discount_percent'], 10)
        self.assertIsNotNone(reviewed['items'][0]['product_id'])

    def test_excel_pdf_and_api_share_plan_summary_and_supplied_total(self):
        order = create_manual_order(OrderReviewPayload(order_number='QA-EXPORT', client='Synthetic export',
            total_amount=99, items=[OrderItemPayload(description='Guantes de nitrilo · caja', quantity=2, unit_price=10)]))
        result = analyze_order(order['id'])
        async def read_stream():
            return b''.join([chunk async for chunk in export_order(order['id']).body_iterator])
        workbook = load_workbook(io.BytesIO(asyncio.run(read_stream())), data_only=True)
        summary = dict(workbook['Summary'].iter_rows(min_row=2, max_col=2, values_only=True))
        self.assertEqual(summary['Total'], 99)
        self.assertEqual(summary['Boxes'], result['box_count'])
        self.assertEqual(summary['Units'], result['unit_count'])
        self.assertAlmostEqual(summary['Total utilization'], result['average_utilization']/100)
        self.assertEqual(summary['Total gross weight (kg)'], result['total_weight_kg'])
        pdf = PdfReader(io.BytesIO(export_order_pdf(order['id']).body))
        text = '\n'.join(page.extract_text() or '' for page in pdf.pages)
        self.assertIn('QA-EXPORT', text)
        self.assertIn('99.00', text)
        self.assertIn(f"{result['average_utilization']}%", text)
        self.assertEqual(get_order(order['id'])['plan']['result']['boxes'], result['boxes'])


class SupportingWorkflowTests(unittest.TestCase):
    setUp = UXContractTests.setUp
    tearDown = UXContractTests.tearDown
    # Separate new endpoint checks from the Phase 1 regression contract.
    def make_order(self):
        order = create_manual_order(OrderReviewPayload(order_number='QA-PREVIEW', client='Synthetic',
            items=[OrderItemPayload(description='Guantes de nitrilo · caja', quantity=1, unit_price=14.5)]))
        analyze_order(order['id'])
        return get_order(order['id'])

    def test_preview_is_read_only_and_matches_apply_with_partial_undo(self):
        from app.main import SuggestedItemPayload, preview_recommendation, add_suggested_item, remove_suggested_item
        order = self.make_order()
        payload = SuggestedItemPayload(source_item_id=order['items'][0]['id'], quantity=1, expected_plan_id=order['plan']['id'])
        preview = preview_recommendation(order['id'], payload)
        self.assertEqual(get_order(order['id']), order)
        self.assertEqual(preview['projected_order_total'], preview['current_order_total'] + preview['amount'])
        applied = add_suggested_item(order['id'], payload)
        for key in ['boxes', 'average_utilization', 'unit_count', 'total_weight_kg']:
            self.assertEqual(applied['plan']['result'][key], preview['result'][key])
        payload.expected_plan_id = applied['plan']['id']
        preview2 = preview_recommendation(order['id'], payload)
        self.assertEqual(get_order(order['id']), applied)
        applied2 = add_suggested_item(order['id'], payload)
        self.assertEqual(applied2['plan']['result']['boxes'], preview2['result']['boxes'])
        line = next(i for i in applied2['items'] if i['is_suggested'])
        self.assertEqual(line['quantity'], 2)
        undone = remove_suggested_item(order['id'], line['id'], 1)
        self.assertEqual(next(i for i in undone['items'] if i['is_suggested'])['quantity'], 1)
        self.assertEqual(undone['total_amount'], applied['total_amount'])
        self.assertEqual(undone['plan']['result']['boxes'], applied['plan']['result']['boxes'])

    def test_stale_and_impossible_previews_do_not_mutate_order(self):
        from app.main import SuggestedItemPayload, preview_recommendation, add_suggested_item
        from fastapi import HTTPException
        order = self.make_order()
        stale = SuggestedItemPayload(source_item_id=order['items'][0]['id'], quantity=1, expected_plan_id=999999)
        for action in [preview_recommendation, add_suggested_item]:
            with self.assertRaises(HTTPException) as error:
                action(order['id'], stale)
            self.assertEqual(error.exception.status_code, 409)
        impossible = SuggestedItemPayload(source_item_id=order['items'][0]['id'], quantity=100, expected_plan_id=order['plan']['id'])
        with self.assertRaises(HTTPException):
            preview_recommendation(order['id'], impossible)
        self.assertEqual(get_order(order['id']), order)

    def test_original_pdf_retained_and_cascades_on_delete(self):
        from fastapi import UploadFile, HTTPException
        from app.main import upload_order, view_source_pdf, delete_all_orders
        from app.extraction import _base_result
        extracted = _base_result('synthetic.pdf', 'Synthetic QA document')
        extracted['order_number'] = 'QA-SOURCE'
        extracted['items'] = []
        content = b'%PDF-1.4 synthetic test fixture'
        with patch('app.main.extract_pdf', return_value=extracted):
            order = asyncio.run(upload_order(UploadFile(filename='synthetic.pdf', file=io.BytesIO(content))))
        self.assertTrue(order['source_available'])
        response = view_source_pdf(order['id'])
        self.assertEqual(response.body, content)
        self.assertEqual(response.media_type, 'application/pdf')
        self.assertEqual(response.headers['cache-control'], 'no-store')
        delete_all_orders()
        with self.assertRaises(HTTPException) as error:
            view_source_pdf(order['id'])
        self.assertEqual(error.exception.status_code, 404)
        with database.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM source_documents').fetchone()[0], 0)


    def test_preview_exposes_legacy_total_discrepancy_without_rewriting_it(self):
        from app.main import SuggestedItemPayload, preview_recommendation
        order = self.make_order()
        with database.connect() as db:
            db.execute('UPDATE order_items SET amount = 0 WHERE order_id = ?', (order['id'],))
            db.execute('UPDATE orders SET subtotal = 0, total_amount = 0 WHERE id = ?', (order['id'],))
        before = get_order(order['id'])
        preview = preview_recommendation(order['id'], SuggestedItemPayload(source_item_id=order['items'][0]['id'], quantity=1))
        self.assertEqual(preview['current_order_total'], 14.5)  # Existing UI display fallback.
        self.assertEqual(preview['projected_order_total'], 14.5)  # Existing sum(amount) rule.
        self.assertNotEqual(preview['projected_order_total'], preview['current_order_total'] + preview['amount'])
        self.assertEqual(get_order(order['id']), before)
