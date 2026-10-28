import unittest

from app.packing import pack_order


class PackingTests(unittest.TestCase):
    def setUp(self):
        self.boxes = [
            {
                "id": 1,
                "code": "TEST-M",
                "name": "Caja de prueba",
                "length_cm": 40,
                "width_cm": 30,
                "height_cm": 20,
                "empty_weight_kg": 0.5,
                "max_weight_kg": 10,
            }
        ]

    def test_packs_units_without_exceeding_weight(self):
        items = [
            {
                "order_item_id": 1,
                "sku": "A-1",
                "name": "Unidad",
                "quantity": 4,
                "length_cm": 20,
                "width_cm": 15,
                "height_cm": 10,
                "weight_kg": 2,
                "rotation_allowed": 1,
                "fragile": 0,
            }
        ]
        result = pack_order(items, self.boxes)
        self.assertEqual(result["status"], "complete")
        self.assertEqual(result["box_count"], 1)
        self.assertLessEqual(result["boxes"][0]["gross_weight_kg"], 10)
        self.assertEqual(result["boxes"][0]["utilization"], 50.0)

    def test_reports_item_that_does_not_fit(self):
        items = [
            {
                "order_item_id": 2,
                "sku": "BIG",
                "name": "Sobredimensionado",
                "quantity": 1,
                "length_cm": 80,
                "width_cm": 60,
                "height_cm": 50,
                "weight_kg": 2,
                "rotation_allowed": 1,
                "fragile": 0,
            }
        ]
        result = pack_order(items, self.boxes)
        self.assertEqual(result["status"], "partial")
        self.assertEqual(len(result["unplaced"]), 1)


if __name__ == "__main__":
    unittest.main()

