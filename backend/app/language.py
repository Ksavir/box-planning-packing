"""Translate generated copy in saved plans while preserving customer content."""
import re
from typing import Any

_TEXT = {
    "Revisa la consolidación": "Review box consolidation",
    "Consolidación disponible": "Consolidation available",
    "Espacio disponible": "Available space",
    "Distribución eficiente": "Efficient layout",
    "Margen de peso reducido": "Limited weight capacity remaining",
    "Unidades sin asignar": "Unassigned units",
    "Plan equilibrado": "Balanced plan",
    "La ocupación total supera el objetivo operativo de 85%.": "Total utilization meets or exceeds the 85% operational target.",
    "Una o más cajas usan más del 85% de su capacidad de peso.": "One or more boxes use over 85% of their weight capacity.",
    "No se detectaron cambios evidentes que reduzcan el número de cajas.": "No obvious changes were found that would reduce the box count.",
    "No hay advertencias de ocupación o peso para el plan seleccionado.": "There are no utilization or weight warnings for the selected plan.",
    "FFD 3D con partición guillotina y restricción de peso": "3D FFD with guillotine partitioning and weight constraints",
    "Búsqueda acotada de planes 3D, múltiples orientaciones y particiones; mínimo volumen total encontrado": "Bounded 3D plan search across multiple orientations and partitions; lowest total volume found",
}
_PATTERNS = [
    (r"Las cajas (.+) están por debajo del 70%\. Evalúa redistribuir sus unidades\.", r"Boxes \1 are below 70% utilization. Consider redistributing their contents."),
    (r"Revisa las cajas (.+): están por debajo del 70% de ocupación\.", r"Review boxes \1: they are below 70% utilization."),
    (r"Quedan ([\d.]+) L libres\. La búsqueda seleccionó el menor volumen total encontrado para la orden\.", r"There are \1 L available. The search selected the lowest total box volume found for this order."),
    (r"(\d+) unidades no caben en las cajas activas\.", r"\1 units do not fit in the active boxes."),
]


def english_plan_copy(result: dict[str, Any]) -> dict[str, Any]:
    """Convert known legacy system copy when reading a saved plan."""
    def translate(value: str) -> str:
        if value in _TEXT:
            return _TEXT[value]
        for pattern, replacement in _PATTERNS:
            if re.fullmatch(pattern, value):
                return re.sub(pattern, replacement, value)
        return value

    result["method"] = translate(result.get("method", ""))
    for suggestion in result.get("suggestions", []):
        for field in ("title", "detail"):
            suggestion[field] = translate(suggestion.get(field, ""))
    return result
