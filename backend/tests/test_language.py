import unittest

from app.language import english_plan_copy


class SavedPlanLanguageTests(unittest.TestCase):
    def test_translates_legacy_system_copy_and_preserves_order_content(self):
        result = {
            "method": "FFD 3D con partición guillotina y restricción de peso",
            "boxes": [{"box_name": "Caja del cliente", "items": [{"name": "Producto original"}]}],
            "suggestions": [
                {"title": "Espacio disponible", "detail": "Quedan 9.79 L libres. La búsqueda seleccionó el menor volumen total encontrado para la orden."},
                {"title": "Consolidación disponible", "detail": "Revisa las cajas #1: están por debajo del 70% de ocupación."},
            ],
        }
        english_plan_copy(result)
        self.assertEqual(result["method"], "3D FFD with guillotine partitioning and weight constraints")
        self.assertEqual(result["suggestions"][0]["title"], "Available space")
        self.assertIn("9.79 L available", result["suggestions"][0]["detail"])
        self.assertEqual(result["suggestions"][1]["detail"], "Review boxes #1: they are below 70% utilization.")
        self.assertEqual(result["boxes"][0]["box_name"], "Caja del cliente")
        self.assertEqual(result["boxes"][0]["items"][0]["name"], "Producto original")
        self.assertEqual(english_plan_copy(result), result)
