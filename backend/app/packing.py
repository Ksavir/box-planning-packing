from __future__ import annotations

from dataclasses import dataclass, field
from itertools import permutations
from typing import Any


EPSILON = 1e-7


@dataclass(frozen=True)
class Unit:
    uid: str
    sku: str
    name: str
    length: float
    width: float
    height: float
    weight: float
    rotation_allowed: bool = True
    fragile: bool = False

    @property
    def volume(self) -> float:
        return self.length * self.width * self.height

    def orientations(self) -> list[tuple[float, float, float]]:
        if not self.rotation_allowed:
            return [(self.length, self.width, self.height)]
        return sorted(set(permutations((self.length, self.width, self.height), 3)))


@dataclass(frozen=True)
class BoxSpec:
    id: int
    code: str
    name: str
    length: float
    width: float
    height: float
    empty_weight: float
    max_weight: float

    @property
    def volume(self) -> float:
        return self.length * self.width * self.height


@dataclass
class FreeSpace:
    x: float
    y: float
    z: float
    length: float
    width: float
    height: float

    @property
    def volume(self) -> float:
        return self.length * self.width * self.height


@dataclass
class Placement:
    unit: Unit
    x: float
    y: float
    z: float
    length: float
    width: float
    height: float


@dataclass
class PackedBox:
    spec: BoxSpec
    placements: list[Placement] = field(default_factory=list)
    free_spaces: list[FreeSpace] = field(default_factory=list)
    product_weight: float = 0

    def __post_init__(self) -> None:
        if not self.free_spaces:
            self.free_spaces = [
                FreeSpace(0, 0, 0, self.spec.length, self.spec.width, self.spec.height)
            ]

    @property
    def used_volume(self) -> float:
        return sum(p.unit.volume for p in self.placements)

    @property
    def utilization(self) -> float:
        return self.used_volume / self.spec.volume if self.spec.volume else 0

    @property
    def gross_weight(self) -> float:
        return self.product_weight + self.spec.empty_weight


def _fits(orientation: tuple[float, float, float], space: FreeSpace) -> bool:
    return all(
        item <= available + EPSILON
        for item, available in zip(
            orientation, (space.length, space.width, space.height), strict=True
        )
    )


def place_unit(box: PackedBox, unit: Unit) -> bool:
    if box.gross_weight + unit.weight > box.spec.max_weight + EPSILON:
        return False

    candidates: list[tuple[float, int, tuple[float, float, float]]] = []
    for space_index, space in enumerate(box.free_spaces):
        for orientation in unit.orientations():
            if _fits(orientation, space):
                leftover = space.volume - orientation[0] * orientation[1] * orientation[2]
                height_bias = space.z + orientation[2]
                candidates.append((leftover + height_bias * 0.001, space_index, orientation))

    if not candidates:
        return False

    _, space_index, orientation = min(candidates, key=lambda candidate: candidate[0])
    space = box.free_spaces.pop(space_index)
    length, width, height = orientation
    box.placements.append(
        Placement(unit, space.x, space.y, space.z, length, width, height)
    )
    box.product_weight += unit.weight

    # Partición guillotina: los tres espacios nuevos no se solapan.
    new_spaces = [
        FreeSpace(
            space.x + length,
            space.y,
            space.z,
            space.length - length,
            space.width,
            space.height,
        ),
        FreeSpace(
            space.x,
            space.y + width,
            space.z,
            length,
            space.width - width,
            space.height,
        ),
        FreeSpace(
            space.x,
            space.y,
            space.z + height,
            length,
            width,
            space.height - height,
        ),
    ]
    box.free_spaces.extend(
        candidate
        for candidate in new_spaces
        if candidate.length > EPSILON
        and candidate.width > EPSILON
        and candidate.height > EPSILON
    )
    box.free_spaces.sort(key=lambda free: (free.z, free.volume))
    return True


def simulate_box(spec: BoxSpec, units: list[Unit]) -> PackedBox:
    box = PackedBox(spec)
    ordered = sorted(
        units,
        key=lambda unit: (unit.fragile, unit.volume, max(unit.length, unit.width, unit.height)),
        reverse=True,
    )
    for unit in ordered:
        place_unit(box, unit)
    return box


def _box_to_dict(box: PackedBox, sequence: int) -> dict[str, Any]:
    sku_summary: dict[str, dict[str, Any]] = {}
    for placement in box.placements:
        summary = sku_summary.setdefault(
            placement.unit.sku,
            {"sku": placement.unit.sku, "name": placement.unit.name, "quantity": 0},
        )
        summary["quantity"] += 1
    return {
        "sequence": sequence,
        "box_type_id": box.spec.id,
        "box_code": box.spec.code,
        "box_name": box.spec.name,
        "dimensions_cm": [box.spec.length, box.spec.width, box.spec.height],
        "utilization": round(box.utilization * 100, 1),
        "product_weight_kg": round(box.product_weight, 2),
        "gross_weight_kg": round(box.gross_weight, 2),
        "max_weight_kg": box.spec.max_weight,
        "remaining_volume_l": round((box.spec.volume - box.used_volume) / 1000, 2),
        "items": list(sku_summary.values()),
        "placements": [
            {
                "uid": placement.unit.uid,
                "sku": placement.unit.sku,
                "name": placement.unit.name,
                "position": [placement.x, placement.y, placement.z],
                "dimensions": [placement.length, placement.width, placement.height],
            }
            for placement in box.placements
        ],
    }


def pack_order(
    item_rows: list[dict[str, Any]], box_rows: list[dict[str, Any]]
) -> dict[str, Any]:
    units: list[Unit] = []
    for item in item_rows:
        for index in range(int(item["quantity"])):
            units.append(
                Unit(
                    uid=f"{item['sku']}-{index + 1}-{item.get('order_item_id', 0)}",
                    sku=item["sku"],
                    name=item["name"],
                    length=float(item["length_cm"]),
                    width=float(item["width_cm"]),
                    height=float(item["height_cm"]),
                    weight=float(item["weight_kg"]),
                    rotation_allowed=bool(item.get("rotation_allowed", True)),
                    fragile=bool(item.get("fragile", False)),
                )
            )

    specs = [
        BoxSpec(
            id=int(row["id"]),
            code=row["code"],
            name=row["name"],
            length=float(row["length_cm"]),
            width=float(row["width_cm"]),
            height=float(row["height_cm"]),
            empty_weight=float(row["empty_weight_kg"]),
            max_weight=float(row["max_weight_kg"]),
        )
        for row in box_rows
    ]
    specs.sort(key=lambda box: box.volume)

    remaining = list(units)
    packed_boxes: list[PackedBox] = []
    while remaining:
        candidates: list[PackedBox] = []
        for spec in specs:
            candidate = simulate_box(spec, remaining)
            if candidate.placements:
                candidates.append(candidate)
        if not candidates:
            break

        # Prioriza colocar más unidades; después, mayor volumen y mejor utilización.
        chosen = max(
            candidates,
            key=lambda box: (
                len(box.placements),
                box.used_volume,
                box.utilization,
                -box.spec.volume,
            ),
        )
        packed_ids = {placement.unit.uid for placement in chosen.placements}
        remaining = [unit for unit in remaining if unit.uid not in packed_ids]
        packed_boxes.append(chosen)

    serialized = [
        _box_to_dict(box, index + 1) for index, box in enumerate(packed_boxes)
    ]
    total_box_volume = sum(box.spec.volume for box in packed_boxes)
    total_item_volume = sum(box.used_volume for box in packed_boxes)
    utilization = total_item_volume / total_box_volume if total_box_volume else 0
    total_weight = sum(box.gross_weight for box in packed_boxes)

    suggestions: list[dict[str, str]] = []
    low_fill = [box for box in serialized if box["utilization"] < 70]
    if low_fill:
        labels = ", ".join(f"#{box['sequence']}" for box in low_fill[:3])
        if len(serialized) > 1:
            suggestions.append(
                {
                    "type": "space",
                    "title": "Revisa la consolidación",
                    "detail": f"Las cajas {labels} están por debajo del 70%. Evalúa redistribuir sus unidades.",
                }
            )
        else:
            remaining_liters = low_fill[0]["remaining_volume_l"]
            suggestions.append(
                {
                    "type": "space",
                    "title": "Espacio disponible",
                    "detail": f"Quedan {remaining_liters} L libres. No existe una caja activa menor que acomode todas las unidades.",
                }
            )
    if utilization >= 0.85:
        suggestions.append(
            {
                "type": "success",
                "title": "Distribución eficiente",
                "detail": "La ocupación total supera el objetivo operativo de 85%.",
            }
        )
    heavy = [box for box in serialized if box["gross_weight_kg"] / box["max_weight_kg"] > 0.85]
    if heavy:
        suggestions.append(
            {
                "type": "weight",
                "title": "Margen de peso reducido",
                "detail": "Una o más cajas usan más del 85% de su capacidad de peso.",
            }
        )
    if remaining:
        suggestions.append(
            {
                "type": "warning",
                "title": "Unidades sin asignar",
                "detail": f"{len(remaining)} unidades no caben en las cajas activas.",
            }
        )
    if not suggestions:
        suggestions.append(
            {
                "type": "info",
                "title": "Plan equilibrado",
                "detail": "No se detectaron cambios evidentes que reduzcan el número de cajas.",
            }
        )

    return {
        "status": "complete" if not remaining else "partial",
        "box_count": len(serialized),
        "unit_count": len(units),
        "average_utilization": round(utilization * 100, 1),
        "total_weight_kg": round(total_weight, 2),
        "unplaced": [
            {"sku": unit.sku, "name": unit.name, "uid": unit.uid} for unit in remaining
        ],
        "boxes": serialized,
        "suggestions": suggestions,
        "method": "FFD 3D con partición guillotina y restricción de peso",
    }
