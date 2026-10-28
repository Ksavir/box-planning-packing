from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict, dataclass, field
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


def place_unit(box: PackedBox, unit: Unit, split_axis: int = 0) -> bool:
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

    # Three disjoint slabs, trying each axis order in the multi-start search.
    origin = [space.x, space.y, space.z]
    available = [space.length, space.width, space.height]
    size = [length, width, height]
    new_spaces = []
    for axis in [(split_axis + i) % 3 for i in range(3)]:
        slab_origin = origin.copy()
        slab_origin[axis] += size[axis]
        slab_size = available.copy()
        slab_size[axis] -= size[axis]
        new_spaces.append(FreeSpace(*slab_origin, *slab_size))
        available[axis] = size[axis]
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
    strategies = [
        lambda u: (u.volume, max(u.length, u.width, u.height), u.weight),
        lambda u: (max(u.length, u.width, u.height), u.volume, u.weight),
        lambda u: (u.weight, u.volume, max(u.length, u.width, u.height)),
    ]
    best = PackedBox(spec)
    for key in strategies:
        ordered = sorted(units, key=key, reverse=True)
        for axis in range(3):
            trial = PackedBox(spec)
            for unit in ordered:
                place_unit(trial, unit, axis)
            if (trial.used_volume, len(trial.placements)) > (best.used_volume, len(best.placements)):
                best = trial
            if len(best.placements) == len(units):
                return best
    return best


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
        "empty_weight_kg": box.spec.empty_weight,
        "remaining_volume_l": round((box.spec.volume - box.used_volume) / 1000, 2),
        "items": list(sku_summary.values()),
        "free_spaces": [asdict(space) for space in box.free_spaces],
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

    # Bounded beam search over complete plans. For a fixed order, minimizing
    # total box volume minimizes unused space; box count is a tie breaker.
    # Keep the best state for each remaining subset to avoid equivalent paths.
    states = [(list(units), [])]
    best_complete = None
    best_partial = (list(units), [])
    cache = {}
    beam_width = 16
    while states:
        next_states = {}
        for remaining, packed in states:
            for spec in specs:
                subset = tuple(u.uid for u in remaining)
                cache_key = (spec.id, subset)
                candidate = cache.get(cache_key)
                if candidate is None:
                    candidate = simulate_box(spec, remaining)
                    cache[cache_key] = candidate
                if not candidate.placements:
                    continue
                packed_ids = {p.unit.uid for p in candidate.placements}
                rest = [u for u in remaining if u.uid not in packed_ids]
                plan = packed + [candidate]
                cost = (sum(b.spec.volume for b in plan), len(plan))
                partial_score = (sum(u.volume for u in rest), *cost)
                old_score = (sum(u.volume for u in best_partial[0]),
                             sum(b.spec.volume for b in best_partial[1]), len(best_partial[1]))
                if partial_score < old_score:
                    best_partial = (rest, plan)
                if not rest:
                    if best_complete is None or cost < best_complete[0]:
                        best_complete = (cost, plan)
                    continue
                # Admissible lower bound: remaining product volume.
                if best_complete and cost[0] + sum(u.volume for u in rest) > best_complete[0][0] + EPSILON:
                    continue
                key = tuple(u.uid for u in rest)
                previous = next_states.get(key)
                if previous is None or cost < previous[0]:
                    next_states[key] = (cost, rest, plan)
        ranked = sorted(next_states.values(), key=lambda state: (
            state[0][0] + sum(u.volume for u in state[1]),
            len(state[1]), state[0][1],
        ))
        states = [(rest, plan) for _, rest, plan in ranked[:beam_width]]
        # Cache is only useful for this frontier and otherwise grows with the order.
        cache.clear()
    if best_complete:
        remaining, packed_boxes = [], best_complete[1]
    else:
        remaining, packed_boxes = best_partial
    return _serialize_plan(packed_boxes, remaining, len(units))


def _serialize_plan(packed_boxes: list[PackedBox], remaining: list[Unit], unit_count: int) -> dict[str, Any]:
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
                    "title": "Review box consolidation",
                    "detail": f"Boxes {labels} are below 70% utilization. Consider redistributing their contents.",
                }
            )
        else:
            remaining_liters = low_fill[0]["remaining_volume_l"]
            suggestions.append(
                {
                    "type": "space",
                    "title": "Available space",
                    "detail": f"There are {remaining_liters} L available. The search selected the lowest total box volume found for this order.",
                }
            )
    if utilization >= 0.85:
        suggestions.append(
            {
                "type": "success",
                "title": "Efficient layout",
                "detail": "Total utilization meets or exceeds the 85% operational target.",
            }
        )
    heavy = [box for box in serialized if box["gross_weight_kg"] / box["max_weight_kg"] > 0.85]
    if heavy:
        suggestions.append(
            {
                "type": "weight",
                "title": "Limited weight capacity remaining",
                "detail": "One or more boxes use over 85% of their weight capacity.",
            }
        )
    if remaining:
        suggestions.append(
            {
                "type": "warning",
                "title": "Unassigned units",
                "detail": f"{len(remaining)} units do not fit in the active boxes.",
            }
        )
    if not suggestions:
        suggestions.append(
            {
                "type": "info",
                "title": "Balanced plan",
                "detail": "There are no utilization or weight warnings for the selected plan.",
            }
        )

    return {
        "status": "complete" if not remaining else "partial",
        "box_count": len(serialized),
        "unit_count": unit_count,
        "average_utilization": round(utilization * 100, 1),
        "total_weight_kg": round(total_weight, 2),
        "unplaced": [
            {"sku": unit.sku, "name": unit.name, "uid": unit.uid} for unit in remaining
        ],
        "boxes": serialized,
        "suggestions": suggestions,
        "method": "Bounded 3D plan search across multiple orientations and partitions; lowest total volume found",
    }


def fill_existing_plan(base_result: dict[str, Any], item_rows: list[dict[str, Any]],
                       additions: list[dict[str, Any]]) -> dict[str, Any]:
    """Add units only into actual free spaces, preserving all original placements."""
    products = {str(row["sku"]): row for row in item_rows}
    packed = []
    for box in base_result["boxes"]:
        spec = BoxSpec(box["box_type_id"], box["box_code"], box["box_name"],
                       *box["dimensions_cm"],
                       box["empty_weight_kg"], box["max_weight_kg"])
        restored = PackedBox(spec)
        restored.free_spaces = [FreeSpace(**space) for space in box["free_spaces"]]
        for placement in box["placements"]:
            row = products[placement["sku"]]
            unit = Unit(placement["uid"], str(row["sku"]), row["name"],
                        row["length_cm"], row["width_cm"], row["height_cm"],
                        row["weight_kg"], bool(row.get("rotation_allowed", True)), bool(row.get("fragile", False)))
            restored.placements.append(Placement(unit, *placement["position"], *placement["dimensions"]))
            restored.product_weight += unit.weight
        packed.append(restored)
    unplaced = []
    for row in additions:
        for index in range(int(row["quantity"])):
            unit = Unit(f"extra-{row['order_item_id']}-{index}", str(row["sku"]), row["name"],
                        row["length_cm"], row["width_cm"], row["height_cm"], row["weight_kg"],
                        bool(row.get("rotation_allowed", True)), bool(row.get("fragile", False)))
            choices = []
            for box_index, box in enumerate(packed):
                for axis in range(3):
                    trial = deepcopy(box)
                    if place_unit(trial, unit, axis):
                        choices.append((max((s.volume for s in trial.free_spaces), default=0),
                                        -box_index, trial))
            if choices:
                _, negative_index, trial = max(choices, key=lambda c: (c[0], c[1]))
                packed[-negative_index] = trial
            else:
                unplaced.append(unit)
    return _serialize_plan(packed, unplaced, base_result["unit_count"] + sum(int(r["quantity"]) for r in additions))
