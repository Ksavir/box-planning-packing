import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import database
from app.main import OrderItemPayload, OrderReviewPayload, analyze_order, create_manual_order


class ReferenceSeedTests(unittest.TestCase):
    def test_fresh_render_database_can_calculate_magigoo_orders(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(database, 'DB_PATH', Path(folder)/'demo.db'), patch.dict(os.environ, {'PACKFLOW_SEED_REFERENCE_CATALOG':'true'}):
            database.init_db()
            order=create_manual_order(OrderReviewPayload(order_number='PO-REF', client='Test', items=[
                OrderItemPayload(description='MAGIGOO SUPERGRIP GLIDE KIT', quantity=10),
                OrderItemPayload(description='MAGIGOO Glide Roller', quantity=2),
                OrderItemPayload(description='MAGIGOO Glide 250ml bottle - Supergrip', quantity=2),
                OrderItemPayload(description='MAGIGOO Glide 250ml bottle - PC', quantity=2),
                OrderItemPayload(description='Magigoo Supergrip 50ml', quantity=5),
            ]))
            result=analyze_order(order['id'])
            self.assertEqual(result['status'], 'complete')
            self.assertEqual(result['unit_count'], 21)
            self.assertFalse(result['unplaced'])

    def test_repeated_startup_preserves_user_measurements_and_disabled_records(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(database, 'DB_PATH', Path(folder)/'demo.db'), patch.dict(os.environ, {'PACKFLOW_SEED_REFERENCE_CATALOG':'true'}):
            database.init_db()
            with database.connect() as db:
                product_count=db.execute('SELECT COUNT(*) FROM products').fetchone()[0]
                box_count=db.execute('SELECT COUNT(*) FROM box_types').fetchone()[0]
                db.execute("UPDATE products SET weight_kg=0.99, active=0 WHERE name='Glide kit'")
                db.execute("UPDATE box_types SET max_weight_kg=12 WHERE code='GLIDE-KITS-X4'")
            database.init_db()
            with database.connect() as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM products').fetchone()[0], product_count)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM box_types').fetchone()[0], box_count)
                row=db.execute("SELECT weight_kg, active FROM products WHERE name='Glide kit'").fetchone()
                self.assertEqual(tuple(row), (0.99, 0))
                self.assertEqual(db.execute("SELECT max_weight_kg FROM box_types WHERE code='GLIDE-KITS-X4'").fetchone()[0], 12)
