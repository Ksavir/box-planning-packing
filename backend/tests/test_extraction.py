import unittest

from app.extraction import _extract_hava, _extract_rev1


class PurchaseOrderExtractionTests(unittest.TestCase):
    def test_extracts_rev1_order_and_line_amounts(self):
        text = """Date : 10/23/2026
Terms : Pre-Payment
Required
Rev1 Technologies
Purchase Order
# PO-5042
Vendor Address
Thought3D Ltd
# Item & Description Qty Rate Amount
1 MAGIGOO SUPERGRIP GLIDE KIT
Product description
10.00
1
65.00 650.00
Sub Total 650.00
Total $650.00
Notes
Request signature on delivery"""
        result = _extract_rev1(text, "PO-5042.pdf")

        self.assertEqual(result["order_number"], "PO-5042")
        self.assertEqual(result["order_date"], "2026-10-23")
        self.assertEqual(result["terms"], "Pre-Payment Required")
        self.assertEqual(result["items"][0]["quantity"], 10)
        self.assertEqual(result["items"][0]["amount"], 650)

    def test_extracts_hava_sku_requested_date_and_currency(self):
        text = """Adresse d'expédition :
Tremblaye
Thought3D Ltd
Bon de commande #
P04486
Date de la commande :
21/09/2026 15:52:01
[MPA2019] Magigoo Pro PA
TVA 20%
02/10/2026 12:00:00
25,00
Unités
10,0000
0,00
250,00
€
Montant HT
250,00 €
TVA 20%
0,00 €
Total
250,00 €
Hava 3D"""
        result = _extract_hava(text, "PO-4486.pdf")

        self.assertEqual(result["order_number"], "P04486")
        self.assertEqual(result["currency"], "EUR")
        self.assertEqual(result["requested_date"], "2026-10-02")
        self.assertEqual(result["items"][0]["sku_raw"], "MPA2019")
        self.assertEqual(result["items"][0]["unit_price"], 10)


if __name__ == "__main__":
    unittest.main()

