import tempfile
import unittest
from pathlib import Path

from app import database
from app.main import (
    OrderItemPayload,
    OrderReviewPayload,
    SuggestedItemPayload,
    add_suggested_item,
    analyze_order,
    create_manual_order,
    get_order,
    remove_suggested_item,
)


class RecommendationFlowTests(unittest.TestCase):
    def setUp(self):
        self.original_path = database.DB_PATH
        self.temp_directory = tempfile.TemporaryDirectory()
        database.DB_PATH = Path(self.temp_directory.name) / "recommendations.db"
        database.init_db()

    def tearDown(self):
        database.DB_PATH = self.original_path
        self.temp_directory.cleanup()

    def test_add_and_remove_recommendation_updates_total_and_plan(self):
        order = create_manual_order(
            OrderReviewPayload(
                order_number="TEST-REC",
                client="Cliente de prueba",
                currency="USD",
                items=[
                    OrderItemPayload(
                        description="Guantes de nitrilo · caja",
                        quantity=1,
                        unit_price=14.5,
                        amount=14.5,
                    )
                ],
            )
        )
        analyze_order(order["id"])
        before = get_order(order["id"])
        recommendation = before["plan"]["result"]["product_recommendations"][0]

        added = add_suggested_item(
            order["id"],
            SuggestedItemPayload(
                source_item_id=recommendation["source_item_id"],
                quantity=recommendation["quantity"],
            ),
        )
        suggested_item = next(item for item in added["items"] if item["is_suggested"])
        self.assertEqual(
            added["total_amount"],
            before["total_amount"] + recommendation["amount"],
        )
        self.assertGreater(
            added["plan"]["result"]["average_utilization"],
            before["plan"]["result"]["average_utilization"],
        )

        removed = remove_suggested_item(order["id"], suggested_item["id"])
        self.assertEqual(removed["total_amount"], before["total_amount"])
        self.assertFalse(any(item["is_suggested"] for item in removed["items"]))


if __name__ == "__main__":
    unittest.main()
