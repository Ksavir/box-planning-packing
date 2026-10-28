import sqlite3
import unittest

from app.main import _find_product_by_description, _internal_product_code


class ProductMatchingTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.execute(
            "CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, active INTEGER)"
        )
        self.db.execute(
            "INSERT INTO products (name, active) VALUES (?, 1)",
            ("Magigoo Supergrip 50 ml",),
        )
        self.db.executemany(
            "INSERT INTO products (name, active) VALUES (?, 1)",
            [("50 ml",), ("Glide kit",), ("Glide roller",), ("glide bottle 250ml (6x20cm)",)],
        )

    def tearDown(self):
        self.db.close()

    def test_matches_product_by_description_without_sku(self):
        product = _find_product_by_description(self.db, "MAGIGOO SUPERGRIP 50 ML")
        self.assertIsNotNone(product)
        self.assertEqual(product["name"], "Magigoo Supergrip 50 ml")

    def test_tolerates_small_description_variations(self):
        product = _find_product_by_description(self.db, "Magigoo Supergrip 50ml")
        self.assertIsNotNone(product)

    def test_internal_code_is_stable_and_not_user_supplied(self):
        self.assertEqual(
            _internal_product_code("Magigoo Supergrip 50 ml"),
            _internal_product_code("MAGIGOO SUPERGRIP 50 ML"),
        )

    def test_maps_purchase_order_descriptions_to_reference_products(self):
        cases = {
            "MAGIGOO SUPERGRIP GLIDE KIT": "Glide kit",
            "MAGIGOO Glide Roller": "Glide roller",
            "MAGIGOO Glide 250ml bottle - PC": "glide bottle 250ml (6x20cm)",
            "Magigoo Original": "50 ml",
        }
        for description, expected in cases.items():
            with self.subTest(description=description):
                product = _find_product_by_description(self.db, description)
                self.assertIsNotNone(product)
                self.assertEqual(product["name"], expected)


if __name__ == "__main__":
    unittest.main()
