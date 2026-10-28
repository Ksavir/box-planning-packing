import asyncio
import io
import json
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException
from pypdf import PdfReader

from app import database
from app.extraction import extract_email
from app.main import (
    EmailOrderPayload, OrderItemPayload, OrderReviewPayload, SuggestedItemPayload,
    app, add_suggested_item, analyze_order, create_email_order, create_manual_order,
    delete_all_orders, download_analysis_report, export_order_pdf, get_order, list_analysis_reports,
    review_order, save_analysis_report,
)
from app.packing import fill_existing_plan, pack_order

EMAIL = """Hi Alex,
Could you please provide the pricing and lead time for the following items?
    Magigoo Pro PP – 15 pcs
    Magigoo Pro PA – 15 pcs
    Magigoo Original 120ml – 15 pcs
Thank you for your help!
Best regards,
Qing"""


def product(quantity=1):
    return dict(order_item_id=1, sku="P", name="Unit", quantity=quantity,
                length_cm=6, width_cm=6, height_cm=6, weight_kg=1,
                rotation_allowed=False)


def box(id=1, length=6, width=6, height=6, max_weight=20):
    return dict(id=id, code=f"B{id}", name="Box", length_cm=length,
                width_cm=width, height_cm=height, empty_weight_kg=.2,
                max_weight_kg=max_weight)


class OptimizationTests(unittest.TestCase):
    def test_minimizes_total_empty_volume_even_with_more_boxes(self):
        result = pack_order([product(2)], [box(), box(2, 13, 7, 7)])
        self.assertEqual(result["box_count"], 2)
        self.assertEqual(sum(b["remaining_volume_l"] for b in result["boxes"]), 0)
        self.assertTrue(all(b["box_code"] == "B1" for b in result["boxes"]))

    def test_smallest_box_that_fits_whole_order_is_used(self):
        result = pack_order([product(2)], [box(1, 13, 6, 6), box(2, 20, 10, 10)])
        self.assertEqual(result["box_count"], 1)
        self.assertEqual(result["boxes"][0]["box_code"], "B1")

    def test_filler_cannot_enlarge_box_or_exceed_weight(self):
        rows = [product()]
        base = pack_order(rows, [box(1, 12, 6, 6, max_weight=2.1), box(2, 20, 10, 10)])
        result = fill_existing_plan(base, rows, [product(3)])
        self.assertEqual(len(result["unplaced"]), 3)
        self.assertEqual(result["boxes"][0]["placements"], base["boxes"][0]["placements"])
        self.assertEqual(result["boxes"][0]["box_code"], "B1")

    def test_no_overlap_bounds_and_weight_in_mixed_order(self):
        rows = [product(7), dict(product(5), sku="Q", order_item_id=2,
                                length_cm=3, width_cm=4, height_cm=5, rotation_allowed=True)]
        result = pack_order(rows, [box(1, 14, 13, 12, max_weight=8), box(2, 20, 20, 20)])
        self.assertEqual(result["status"], "complete")
        seen = set()
        for b in result["boxes"]:
            self.assertLessEqual(b["gross_weight_kg"], b["max_weight_kg"])
            for index, p in enumerate(b["placements"]):
                self.assertNotIn(p["uid"], seen)
                seen.add(p["uid"])
                for origin, size, limit in zip(p["position"], p["dimensions"], b["dimensions_cm"]):
                    self.assertGreaterEqual(origin, 0)
                    self.assertLessEqual(origin + size, limit + 1e-7)
                for q in b["placements"][index+1:]:
                    self.assertTrue(any(
                        p["position"][axis] + p["dimensions"][axis] <= q["position"][axis] + 1e-7 or
                        q["position"][axis] + q["dimensions"][axis] <= p["position"][axis] + 1e-7
                        for axis in range(3)))
        self.assertEqual(len(seen), 12)


class BackendFeatureTests(unittest.TestCase):
    def setUp(self):
        self.original_path = database.DB_PATH
        self.temp_directory = tempfile.TemporaryDirectory()
        database.DB_PATH = Path(self.temp_directory.name) / "features.db"
        database.init_db()

    def tearDown(self):
        database.DB_PATH = self.original_path
        self.temp_directory.cleanup()

    def make_order(self):
        return create_manual_order(OrderReviewPayload(
            order_number="FEATURE-TEST", client="Cliente <QA> & revisión",
            notes="Prueba de exportación", items=[OrderItemPayload(
                description="Guantes de nitrilo · caja", quantity=1)]))

    def test_http_contract_email_analysis_and_pdf(self):
        async def request(method, path, payload=None):
            body = json.dumps(payload).encode() if payload is not None else b""
            messages = []
            scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
                     "method": method, "scheme": "http", "path": path,
                     "raw_path": path.encode(), "query_string": b"",
                     "headers": [(b"content-type", b"application/json")],
                     "client": ("127.0.0.1", 12345), "server": ("testserver", 80)}
            async def receive():
                return {"type": "http.request", "body": body, "more_body": False}
            async def send(message):
                messages.append(message)
            await app(scope, receive, send)
            status = next(m["status"] for m in messages if m["type"] == "http.response.start")
            content = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
            return status, content

        async def scenario():
            status, content = await request("POST", "/api/orders/email", {
                "text": "Guantes de nitrilo · caja - 2 pcs", "client": "HTTP QA"})
            self.assertEqual(status, 201)
            order_id = json.loads(content)["id"]
            status, content = await request("POST", f"/api/orders/{order_id}/analyze", {})
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(content)["status"], "complete")
            status, content = await request("POST", f"/api/orders/{order_id}/reports", {})
            self.assertEqual(status, 201)
            status, pdf = await request("GET", json.loads(content)["download_url"])
            self.assertEqual(status, 200)
            self.assertTrue(pdf.startswith(b"%PDF-"))
            status, _ = await request("POST", "/api/orders/email", {"text": "No items"})
            self.assertEqual(status, 422)
            status, content = await request("DELETE", "/api/orders")
            self.assertEqual(status, 200)
            self.assertEqual(json.loads(content)["deleted_orders"], 4)
            status, content = await request("GET", "/api/orders")
            self.assertEqual(json.loads(content), [])
        asyncio.run(scenario())

    def test_delete_all_orders_cascades_and_does_not_reseed_after_restart(self):
        order = self.make_order()
        analyze_order(order["id"])
        save_analysis_report(order["id"])
        with database.connect() as db:
            expected = db.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
            products = db.execute("SELECT COUNT(*) FROM products").fetchone()[0]
            boxes = db.execute("SELECT COUNT(*) FROM box_types").fetchone()[0]
        self.assertEqual(delete_all_orders(), {"deleted_orders": expected})
        database.init_db()  # Simulate the next application startup.
        with database.connect() as db:
            for table in ["orders", "order_items", "packing_plans", "analysis_reports"]:
                self.assertEqual(db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM products").fetchone()[0], products)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM box_types").fetchone()[0], boxes)
        self.assertEqual(delete_all_orders(), {"deleted_orders": 0})

    def test_qing_email_creates_reviewable_order_and_preserves_body(self):
        order = create_email_order(EmailOrderPayload(text=EMAIL))
        self.assertEqual(order["client"], "Qing")
        self.assertEqual(order["source_type"], "email")
        self.assertEqual(order["status"], "needs_review")
        self.assertEqual(order["notes"], EMAIL)
        self.assertEqual([i["description"] for i in order["items"]],
                         ["Magigoo Pro PP", "Magigoo Pro PA", "Magigoo Original 120ml"])
        self.assertEqual([i["quantity"] for i in order["items"]], [15]*3)
        self.assertTrue(all(i["unit_price"] == 0 for i in order["items"]))
        self.assertIsNone(order["plan"])
        other = create_email_order(EmailOrderPayload(text=EMAIL))
        self.assertNotEqual(order["order_number"], other["order_number"])

    def test_email_formats_ignore_sizes_signature_and_quoted_history(self):
        parsed = extract_email("15 x Magigoo PP\nMagigoo 120ml: 7 unidades\nMagigoo PA x 3\nSaludos,\nQing\n> Magigoo PP - 90 pcs")
        self.assertEqual([i["quantity"] for i in parsed["items"]], [15, 7, 3])
        self.assertEqual(parsed["client"], "Qing")
        for text in ["Hello Alex", "Magigoo 120ml", "Magigoo PP - 0 pcs"]:
            with self.assertRaises(HTTPException) as context:
                create_email_order(EmailOrderPayload(text=text))
            self.assertEqual(context.exception.status_code, 422)

    def test_pdf_is_persisted_reused_and_downloadable_after_review(self):
        order = self.make_order()
        with self.assertRaises(HTTPException):
            save_analysis_report(order["id"])
        analyze_order(order["id"])
        report = save_analysis_report(order["id"])
        self.assertEqual(save_analysis_report(order["id"])["id"], report["id"])
        response = export_order_pdf(order["id"])
        self.assertEqual(response.media_type, "application/pdf")
        text = "\n".join(page.extract_text() for page in PdfReader(io.BytesIO(response.body)).pages)
        for value in ["FEATURE-TEST", "Guantes", "Cliente <QA> & revisión"]:
            self.assertIn(value, text)
        for alternatives in [("Pending", "Pendiente"), ("Position", "Posición"), ("Recommendations", "Recomendaciones")]:
            self.assertTrue(any(value in text for value in alternatives))
        review_order(order["id"], OrderReviewPayload(
            order_number=order["order_number"], client="Editado",
            items=[OrderItemPayload(description="Guantes de nitrilo · caja", quantity=2)]))
        self.assertIsNone(get_order(order["id"])["plan"])
        self.assertEqual(download_analysis_report(order["id"], report["id"]).body, response.body)
        self.assertEqual(len(list_analysis_reports(order["id"])), 1)
        with self.assertRaises(HTTPException):
            export_order_pdf(order["id"])
        with self.assertRaises(HTTPException) as context:
            download_analysis_report(order["id"] + 1, report["id"])
        self.assertEqual(context.exception.status_code, 404)

    def test_unpriced_filler_keeps_original_box_and_rejects_excess_atomically(self):
        order = self.make_order()
        result = analyze_order(order["id"])
        rec = result["product_recommendations"][0]
        self.assertTrue(rec["requires_pricing"])
        with self.assertRaises(HTTPException):
            add_suggested_item(order["id"], SuggestedItemPayload(source_item_id=rec["source_item_id"], quantity=100))
        self.assertEqual(len(get_order(order["id"])["items"]), 1)
        updated = add_suggested_item(order["id"], SuggestedItemPayload(source_item_id=rec["source_item_id"], quantity=rec["quantity"]))
        actual = updated["plan"]["result"]
        self.assertEqual(actual["average_utilization"], rec["projected_utilization"])
        self.assertEqual([b["box_code"] for b in actual["boxes"]], [b["box_code"] for b in result["boxes"]])
        self.assertEqual(actual["boxes"][0]["placements"][:1], result["boxes"][0]["placements"])
