import io
import unittest

from openpyxl import Workbook

from app.extraction import parse_reference_workbook


class ReferenceWorkbookTests(unittest.TestCase):
    def test_reads_products_and_boxes_from_operational_layout(self):
        workbook = Workbook()
        products = workbook.active
        products.title = "boxes bottles volumes"
        products["A3"] = "50 ml"
        products["B3"] = 0.085
        boxes = workbook.create_sheet("box types-what fits")
        boxes["A3"] = '12"'
        boxes["B3"] = "300 x 200 x 100"
        boxes["C3"] = 110
        stream = io.BytesIO()
        workbook.save(stream)

        result = parse_reference_workbook(stream.getvalue())

        self.assertIsNotNone(result)
        self.assertEqual(result["products"][0]["name"], "50 ml")
        self.assertEqual(result["products"][0]["weight_kg"], 0.085)
        self.assertEqual(result["boxes"][0]["length_cm"], 30)
        self.assertEqual(result["boxes"][0]["empty_weight_kg"], 0.11)


if __name__ == "__main__":
    unittest.main()
