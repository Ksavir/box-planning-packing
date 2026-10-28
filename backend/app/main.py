from __future__ import annotations

import json
import hashlib
import re
import sqlite3
import unicodedata
from difflib import SequenceMatcher
from io import BytesIO
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from pydantic import BaseModel, Field

from .database import connect, init_db, latest_plan, now_iso, rows_to_dicts
from .extraction import extract_email, extract_pdf, parse_catalog_excel, parse_reference_workbook
from .packing import fill_existing_plan, pack_order
from .reports import render_analysis_pdf


class ProductPayload(BaseModel):
    name: str
    length_cm: float = Field(gt=0)
    width_cm: float = Field(gt=0)
    height_cm: float = Field(gt=0)
    weight_kg: float = Field(gt=0)
    rotation_allowed: bool = True
    fragile: bool = False


class BoxPayload(BaseModel):
    code: str
    name: str
    length_cm: float = Field(gt=0)
    width_cm: float = Field(gt=0)
    height_cm: float = Field(gt=0)
    empty_weight_kg: float = Field(ge=0)
    max_weight_kg: float = Field(gt=0)


class OrderItemPayload(BaseModel):
    sku_raw: str = ""
    description: str
    quantity: int = Field(gt=0)
    unit_price: float = Field(default=0, ge=0)
    line_number: int | None = None
    requested_date: str | None = None
    tax_label: str = ""
    discount_percent: float = Field(default=0, ge=0, le=100)
    amount: float = Field(default=0, ge=0)
    is_suggested: bool = False


class SuggestedItemPayload(BaseModel):
    source_item_id: int
    quantity: int = Field(gt=0, le=100)


class EmailOrderPayload(BaseModel):
    text: str = Field(min_length=1, max_length=100_000)
    order_number: str | None = Field(default=None, min_length=1, max_length=200)
    client: str = ""
    subject: str = ""


class OrderReviewPayload(BaseModel):
    order_number: str = Field(min_length=1)
    client: str = Field(min_length=1)
    vendor: str = ""
    order_date: str | None = None
    requested_date: str | None = None
    currency: str = "USD"
    delivery_address: str = ""
    billing_address: str = ""
    terms: str = ""
    notes: str = ""
    subtotal: float = Field(default=0, ge=0)
    tax_amount: float = Field(default=0, ge=0)
    total_amount: float = Field(default=0, ge=0)
    items: list[OrderItemPayload]


def _line_amount(item: OrderItemPayload) -> float:
    if item.amount:
        return item.amount
    return round(
        item.quantity * item.unit_price * (1 - item.discount_percent / 100), 2
    )


def _normalize_product_name(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    normalized = re.sub(r"[^a-z0-9]+", " ", ascii_value.lower()).strip()
    return re.sub(r"(\d)\s+ml\b", r"\1ml", normalized)


def _internal_product_code(name: str) -> str:
    normalized = _normalize_product_name(name)
    digest = hashlib.sha1(normalized.encode()).hexdigest()[:10].upper()
    return f"PRODUCT-{digest}"


def _find_product_by_description(
    db: sqlite3.Connection, description: str
) -> sqlite3.Row | None:
    target = _normalize_product_name(description)
    if not target:
        return None
    products = db.execute(
        "SELECT id, name FROM products WHERE active = 1 ORDER BY id"
    ).fetchall()
    exact = next(
        (product for product in products if _normalize_product_name(product["name"]) == target),
        None,
    )
    if exact:
        return exact

    product_names = {
        _normalize_product_name(product["name"]): product for product in products
    }
    rules = (
        ("glide roller", "glide roller"),
        ("glide kit", "glide kit"),
        ("glide 250ml", "glide bottle 250ml"),
        ("glide 250 ml", "glide bottle 250ml"),
        ("250ml bottle", "glide bottle 250ml"),
        ("250 ml bottle", "glide bottle 250ml"),
        ("120ml", "120ml"),
        ("120 ml", "120 ml"),
        ("50ml", "50ml"),
        ("50 ml", "50 ml"),
        ("10ml", "10ml"),
        ("10 ml", "10 ml"),
    )
    for phrase, catalog_name in rules:
        if phrase in target:
            catalog_product = next(
                (
                    product
                    for normalized_name, product in product_names.items()
                    if (normalized_name == catalog_name or
                        (catalog_name.startswith("glide") and catalog_name in normalized_name))
                ),
                None,
            )
            if catalog_product:
                return catalog_product
    if "magigoo" in target and not re.search(r"\d+ml\b", target) and "50ml" in product_names:
        return product_names["50ml"]
    variants = {"pp", "pa", "pc", "abs", "flex", "ht", "original", "pva"}
    target_variants = set(target.split()) & variants
    scored = [
        (SequenceMatcher(None, target, _normalize_product_name(product["name"])).ratio(), product)
        for product in products
        if (set(_normalize_product_name(product["name"]).split()) & variants) == target_variants
    ]
    best_score, best_product = max(scored, default=(0.0, None), key=lambda entry: entry[0])
    return best_product if best_score >= 0.88 else None


def _relink_order_items(db: sqlite3.Connection, order_id: int) -> None:
    for item in db.execute(
        "SELECT id, description FROM order_items WHERE order_id = ?", (order_id,)
    ).fetchall():
        product = _find_product_by_description(db, item["description"])
        db.execute(
            "UPDATE order_items SET product_id = ? WHERE id = ?",
            (product["id"] if product else None, item["id"]),
        )


def _insert_order_item(
    db: sqlite3.Connection, order_id: int, item: OrderItemPayload, position: int
) -> None:
    product = _find_product_by_description(db, item.description)
    db.execute(
        """
        INSERT INTO order_items
            (order_id, product_id, sku_raw, description, quantity, unit_price,
             line_number, requested_date, tax_label, discount_percent, amount,
             is_suggested)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            order_id,
            product["id"] if product else None,
            "",
            item.description or (product["name"] if product else "Producto sin identificar"),
            item.quantity,
            item.unit_price,
            item.line_number or position,
            item.requested_date,
            item.tax_label,
            item.discount_percent,
            _line_amount(item),
            int(item.is_suggested),
        ),
    )


def _packing_rows(db: sqlite3.Connection, order_id: int) -> list[dict[str, Any]]:
    return rows_to_dicts(
        db.execute(
            """
            SELECT
                oi.id AS order_item_id, oi.quantity, oi.unit_price, oi.description,
                oi.is_suggested, p.id AS product_id, CAST(p.id AS TEXT) AS sku, p.name,
                p.length_cm, p.width_cm, p.height_cm, p.weight_kg,
                p.rotation_allowed, p.fragile
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.order_id = ? AND p.active = 1
            """,
            (order_id,),
        ).fetchall()
    )


def _fill_recommendations(
    db: sqlite3.Connection,
    order_id: int,
    items: list[dict[str, Any]],
    boxes: list[dict[str, Any]],
    base_result: dict[str, Any],
) -> list[dict[str, Any]]:
    if not base_result["boxes"] or base_result["status"] != "complete":
        return []
    # Each recommendation is an alternative, evaluated in the fixed boxes.
    # Prices are optional: physical feasibility does not depend on pricing.
    recommendations = []
    seen = set()
    for source in items:
        if source["is_suggested"] or source["product_id"] in seen:
            continue
        seen.add(source["product_id"])
        addition = dict(source, quantity=100)
        trial = fill_existing_plan(base_result, items, [addition])
        quantity = 100 - len(trial["unplaced"])
        if not quantity:
            continue
        recommendations.append({
            "type": "product",
            "source_item_id": source["order_item_id"],
            "product_id": source["product_id"],
            "description": source["description"],
            "quantity": quantity,
            "unit_price": source["unit_price"],
            "amount": round(quantity * source["unit_price"], 2),
            "projected_utilization": trial["average_utilization"],
            "box_count": base_result["box_count"],
            "remaining_volume_l": sum(b["remaining_volume_l"] for b in trial["boxes"]),
            "requires_pricing": source["unit_price"] == 0,
            "alternative": True,
        })
    recommendations.sort(key=lambda r: (-r["projected_utilization"], r["amount"], r["source_item_id"]))
    return recommendations[:4]


def _refresh_order_totals(db: sqlite3.Connection, order_id: int) -> None:
    row = db.execute(
        "SELECT COALESCE(SUM(amount), 0) AS subtotal FROM order_items WHERE order_id = ?",
        (order_id,),
    ).fetchone()
    tax_amount = db.execute(
        "SELECT tax_amount FROM orders WHERE id = ?", (order_id,)
    ).fetchone()["tax_amount"]
    subtotal = round(float(row["subtotal"]), 2)
    db.execute(
        "UPDATE orders SET subtotal = ?, total_amount = ?, updated_at = ? WHERE id = ?",
        (subtotal, round(subtotal + tax_amount, 2), now_iso(), order_id),
    )


def _run_plan(db: sqlite3.Connection, order_id: int) -> dict[str, Any]:
    _relink_order_items(db, order_id)
    total_items = db.execute(
        "SELECT COUNT(*) FROM order_items WHERE order_id = ?", (order_id,)
    ).fetchone()[0]
    items = _packing_rows(db, order_id)
    if total_items == 0:
        raise HTTPException(422, "The order has no line items.")
    if len(items) != total_items:
        missing = [
            row["description"]
            for row in db.execute(
                "SELECT description FROM order_items WHERE order_id = ? AND product_id IS NULL",
                (order_id,),
            ).fetchall()
        ]
        sample = ", ".join(missing[:4])
        suffix = "…" if len(missing) > 4 else ""
        raise HTTPException(
            422,
            f"Not found in the catalog: {sample}{suffix}. Import the reference data or update the description.",
        )
    boxes = rows_to_dicts(
        db.execute("SELECT * FROM box_types WHERE active = 1 ORDER BY length_cm * width_cm * height_cm").fetchall()
    )
    if not boxes:
        raise HTTPException(422, "There are no active box types.")
    primary_items = [item for item in items if not item["is_suggested"]]
    additions = [item for item in items if item["is_suggested"]]
    result = pack_order(primary_items, boxes)
    if additions:
        if result["status"] != "complete":
            raise HTTPException(422, "The original order does not fit. Review the additional products.")
        result = fill_existing_plan(result, items, additions)
        if result["status"] != "complete":
            raise HTTPException(422, "The additional products do not fit in the original order’s boxes.")
    result["product_recommendations"] = _fill_recommendations(
        db, order_id, items, boxes, result
    )
    db.execute(
        """
        INSERT INTO packing_plans
            (order_id, box_count, average_utilization, total_weight_kg,
             result_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            order_id,
            result["box_count"],
            result["average_utilization"],
            result["total_weight_kg"],
            json.dumps(result, ensure_ascii=False),
            now_iso(),
        ),
    )
    db.execute(
        "UPDATE orders SET status = ?, updated_at = ? WHERE id = ?",
        ("packed" if result["status"] == "complete" else "attention", now_iso(), order_id),
    )
    return result


def _ensure_demo_plans() -> None:
    with connect() as db:
        for row in db.execute(
            "SELECT id FROM orders WHERE source_filename = 'orden-demo.pdf'"
        ).fetchall():
            exists = db.execute(
                "SELECT 1 FROM packing_plans WHERE order_id = ? LIMIT 1", (row["id"],)
            ).fetchone()
            if not exists:
                _run_plan(db, row["id"])


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    _ensure_demo_plans()
    yield


app = FastAPI(
    title="PackFlow API",
    version="0.1.0",
    description="Purchase order extraction and 3D packing planning.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "database": "sqlite"}


def _order_summary_rows(db: sqlite3.Connection) -> list[dict[str, Any]]:
    return rows_to_dicts(
        db.execute(
            """
            SELECT
                o.*,
                COUNT(DISTINCT oi.id) AS line_count,
                COALESCE(SUM(oi.quantity), 0) AS unit_count,
                pp.box_count,
                pp.average_utilization,
                pp.total_weight_kg
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN packing_plans pp ON pp.id = (
                SELECT id FROM packing_plans
                WHERE order_id = o.id ORDER BY id DESC LIMIT 1
            )
            GROUP BY o.id
            ORDER BY o.order_date DESC, o.id DESC
            """
        ).fetchall()
    )


@app.get("/api/dashboard")
def dashboard() -> dict[str, Any]:
    with connect() as db:
        orders = _order_summary_rows(db)
        completed = [order for order in orders if order["average_utilization"] is not None]
        return {
            "kpis": {
                "orders": len(orders),
                "ready": sum(order["status"] == "packed" for order in orders),
                "boxes": sum(order["box_count"] or 0 for order in orders),
                "average_utilization": round(
                    sum(order["average_utilization"] for order in completed) / len(completed), 1
                ) if completed else 0,
                "total_weight_kg": round(sum(order["total_weight_kg"] or 0 for order in orders), 1),
            },
            "orders": orders,
            "utilization_series": [
                {
                    "label": order["order_number"],
                    "value": order["average_utilization"] or 0,
                }
                for order in reversed(orders[:8])
            ],
        }


@app.get("/api/orders")
def list_orders() -> list[dict[str, Any]]:
    with connect() as db:
        return _order_summary_rows(db)


@app.delete("/api/orders")
def delete_all_orders() -> dict[str, int]:
    with connect() as db:
        # Foreign key cascades remove items, packing plans and saved PDFs atomically.
        count = db.execute("SELECT COUNT(*) FROM orders").fetchone()[0]
        db.execute("DELETE FROM orders")
        db.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('demo_orders_seeded', '1')")
    return {"deleted_orders": count}


@app.get("/api/orders/{order_id}")
def get_order(order_id: int) -> dict[str, Any]:
    with connect() as db:
        row = db.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Order not found.")
        order = dict(row)
        order["items"] = rows_to_dicts(
            db.execute(
                """
                SELECT
                    oi.*, p.sku, p.name AS product_name, p.weight_kg,
                    p.length_cm, p.width_cm, p.height_cm
                FROM order_items oi
                LEFT JOIN products p ON p.id = oi.product_id
                WHERE oi.order_id = ? ORDER BY oi.id
                """,
                (order_id,),
            ).fetchall()
        )
        order["plan"] = latest_plan(db, order_id)
        return order


@app.post("/api/orders/upload", status_code=201)
async def upload_order(file: UploadFile = File(...)) -> dict[str, Any]:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Upload a valid PDF file.")
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(413, "The PDF exceeds the 15 MB limit.")
    try:
        extracted = extract_pdf(content, file.filename)
    except Exception as exc:
        raise HTTPException(422, "The PDF could not be read. Check that it is not damaged or password-protected.") from exc
    with connect() as db:
        number = extracted["order_number"]
        existing = db.execute(
            """
            SELECT id, source_filename, status FROM orders
            WHERE order_number = ?
            """,
            (number,),
        ).fetchone()
        can_reprocess = bool(
            existing
            and existing["source_filename"] == file.filename
            and existing["status"] in {"needs_review", "ready"}
        )
        values = (
            extracted["client"], extracted["vendor"], extracted["order_date"],
            extracted["requested_date"], extracted["currency"], file.filename,
            extracted["delivery_address"], extracted["billing_address"],
            extracted["terms"], extracted["notes"], extracted["subtotal"],
            extracted["tax_amount"], extracted["total_amount"],
            extracted["confidence"], now_iso(),
        )
        if can_reprocess:
            order_id = existing["id"]
            db.execute(
                """
                UPDATE orders SET
                    client = ?, vendor = ?, order_date = ?, requested_date = ?,
                    currency = ?, source_filename = ?, source_type = 'pdf',
                    delivery_address = ?, billing_address = ?, terms = ?, notes = ?,
                    subtotal = ?, tax_amount = ?, total_amount = ?,
                    status = 'needs_review', confidence = ?, updated_at = ?
                WHERE id = ?
                """,
                (*values, order_id),
            )
            db.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
        else:
            base = number
            suffix = 1
            while db.execute("SELECT 1 FROM orders WHERE order_number = ?", (number,)).fetchone():
                suffix += 1
                number = f"{base}-{suffix}"
            timestamp = now_iso()
            cursor = db.execute(
                """
                INSERT INTO orders
                    (order_number, client, vendor, order_date, requested_date, currency,
                     source_filename, source_type, delivery_address, billing_address,
                     terms, notes, subtotal, tax_amount, total_amount,
                     status, confidence, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'pdf', ?, ?, ?, ?, ?, ?, ?,
                        'needs_review', ?, ?, ?)
                """,
                (number, *values[:-1], timestamp, values[-1]),
            )
            order_id = cursor.lastrowid
        for item in extracted["items"]:
            payload = OrderItemPayload(**item)
            _insert_order_item(db, order_id, payload, payload.line_number or 1)
    return get_order(order_id)


@app.post("/api/orders/email", status_code=201)
def create_email_order(payload: EmailOrderPayload) -> dict[str, Any]:
    extracted = extract_email(payload.text)
    if payload.order_number is not None and not payload.order_number.strip():
        raise HTTPException(422, "The order number cannot be empty.")
    if not extracted["items"]:
        raise HTTPException(422, "No lines with a product and quantity were found. For example, use: Magigoo Pro PP - 15 pcs.")
    # Use the existing order validation/insertion path; all unknown fields remain editable.
    review = OrderReviewPayload(
        order_number=payload.order_number or f"EMAIL-{uuid4().hex[:12].upper()}",
        client=payload.client.strip() or extracted["client"],
        notes=payload.text,
        items=[OrderItemPayload(**item) for item in extracted["items"]],
    )
    with connect() as db:
        order_id = _create_order(db, review, source_type="email", source_filename=payload.subject or None, confidence=extracted["confidence"])
    order = get_order(order_id)
    order["extraction_warnings"] = extracted["warnings"]
    return order


@app.post("/api/orders/manual", status_code=201)
def create_manual_order(payload: OrderReviewPayload) -> dict[str, Any]:
    with connect() as db:
        order_id = _create_order(db, payload)
    return get_order(order_id)


def _create_order(db: sqlite3.Connection, payload: OrderReviewPayload, *, source_type: str = "manual",
                  source_filename: str | None = None, confidence: float = 1) -> int:
    if db.execute(
        "SELECT 1 FROM orders WHERE order_number = ?", (payload.order_number.strip(),)
    ).fetchone():
        raise HTTPException(409, "An order with this number already exists.")
    subtotal = payload.subtotal or round(
        sum(_line_amount(item) for item in payload.items), 2
    )
    total = payload.total_amount or round(subtotal + payload.tax_amount, 2)
    timestamp = now_iso()
    cursor = db.execute(
        """
        INSERT INTO orders
            (order_number, client, vendor, order_date, requested_date, currency,
             source_filename, source_type, delivery_address, billing_address,
             terms, notes, subtotal, tax_amount, total_amount,
             status, confidence, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                'needs_review', ?, ?, ?)
        """,
        (
            payload.order_number.strip(),
            payload.client.strip(),
            payload.vendor.strip(),
            payload.order_date,
            payload.requested_date,
            payload.currency.upper(),
            source_filename,
            source_type,
            payload.delivery_address,
            payload.billing_address,
            payload.terms,
            payload.notes,
            subtotal,
            payload.tax_amount,
            total,
            confidence,
            timestamp,
            timestamp,
        ),
    )
    order_id = cursor.lastrowid
    for position, item in enumerate(payload.items, start=1):
        _insert_order_item(db, order_id, item, position)
    return order_id


@app.patch("/api/orders/{order_id}")
def review_order(order_id: int, payload: OrderReviewPayload) -> dict[str, Any]:
    with connect() as db:
        if not db.execute("SELECT 1 FROM orders WHERE id = ?", (order_id,)).fetchone():
            raise HTTPException(404, "Order not found.")
        try:
            db.execute(
                """
                UPDATE orders
                SET order_number = ?, client = ?, vendor = ?, order_date = ?,
                    requested_date = ?, currency = ?, delivery_address = ?,
                    billing_address = ?, terms = ?, notes = ?, subtotal = ?,
                    tax_amount = ?, total_amount = ?, status = 'ready',
                    confidence = 1, updated_at = ?
                WHERE id = ?
                """,
                (
                    payload.order_number.strip(),
                    payload.client.strip(),
                    payload.vendor.strip(),
                    payload.order_date,
                    payload.requested_date,
                    payload.currency.upper(),
                    payload.delivery_address,
                    payload.billing_address,
                    payload.terms,
                    payload.notes,
                    payload.subtotal
                    or round(sum(_line_amount(item) for item in payload.items), 2),
                    payload.tax_amount,
                    payload.total_amount
                    or round(
                        (payload.subtotal or sum(_line_amount(item) for item in payload.items))
                        + payload.tax_amount,
                        2,
                    ),
                    now_iso(),
                    order_id,
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(409, "An order with this number already exists.") from exc
        db.execute("DELETE FROM packing_plans WHERE order_id = ?", (order_id,))
        db.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
        for position, item in enumerate(payload.items, start=1):
            _insert_order_item(db, order_id, item, position)
    return get_order(order_id)


@app.post("/api/orders/{order_id}/analyze")
def analyze_order(order_id: int) -> dict[str, Any]:
    with connect() as db:
        if not db.execute("SELECT 1 FROM orders WHERE id = ?", (order_id,)).fetchone():
            raise HTTPException(404, "Order not found.")
        return _run_plan(db, order_id)


@app.post("/api/orders/{order_id}/suggested-items", status_code=201)
def add_suggested_item(order_id: int, payload: SuggestedItemPayload) -> dict[str, Any]:
    with connect() as db:
        source = db.execute(
            """
            SELECT oi.*, p.name AS product_name
            FROM order_items oi
            JOIN products p ON p.id = oi.product_id
            WHERE oi.id = ? AND oi.order_id = ? AND oi.is_suggested = 0
            """,
            (payload.source_item_id, order_id),
        ).fetchone()
        if not source:
            raise HTTPException(404, "This recommendation is no longer available.")
        amount = round(payload.quantity * source["unit_price"], 2)
        existing = db.execute(
            """
            SELECT id, quantity FROM order_items
            WHERE order_id = ? AND is_suggested = 1 AND product_id = ?
              AND description = ? AND unit_price = ?
            """,
            (order_id, source["product_id"], source["description"], source["unit_price"]),
        ).fetchone()
        if existing:
            quantity = existing["quantity"] + payload.quantity
            db.execute(
                "UPDATE order_items SET quantity = ?, amount = ? WHERE id = ?",
                (quantity, round(quantity * source["unit_price"], 2), existing["id"]),
            )
        else:
            line_number = db.execute(
                "SELECT COALESCE(MAX(line_number), 0) + 1 FROM order_items WHERE order_id = ?",
                (order_id,),
            ).fetchone()[0]
            db.execute(
                """
                INSERT INTO order_items
                    (order_id, product_id, sku_raw, description, quantity, unit_price,
                     line_number, requested_date, tax_label, discount_percent, amount,
                     is_suggested)
                VALUES (?, ?, '', ?, ?, ?, ?, ?, '', 0, ?, 1)
                """,
                (
                    order_id, source["product_id"], source["description"], payload.quantity,
                    source["unit_price"], line_number, source["requested_date"], amount,
                ),
            )
        _refresh_order_totals(db, order_id)
        _run_plan(db, order_id)
    return get_order(order_id)


@app.delete("/api/orders/{order_id}/suggested-items/{item_id}")
def remove_suggested_item(order_id: int, item_id: int) -> dict[str, Any]:
    with connect() as db:
        item = db.execute(
            "SELECT id FROM order_items WHERE id = ? AND order_id = ? AND is_suggested = 1",
            (item_id, order_id),
        ).fetchone()
        if not item:
            raise HTTPException(404, "The added product does not exist or belongs to the original order.")
        db.execute("DELETE FROM order_items WHERE id = ?", (item_id,))
        _refresh_order_totals(db, order_id)
        _run_plan(db, order_id)
    return get_order(order_id)


def _save_analysis_report(order_id: int) -> dict[str, Any]:
    order = get_order(order_id)
    if not order.get("plan") or order["plan"]["result"]["status"] != "complete":
        raise HTTPException(422, "Calculate a complete packing plan before saving the final analysis.")
    plan_id = order["plan"]["id"]
    safe_number = re.sub(r"[^A-Za-z0-9_-]", "", order["order_number"]) or str(order_id)
    filename = f"plan-{safe_number}.pdf"
    with connect() as db:
        row = db.execute("SELECT id, filename, created_at FROM analysis_reports WHERE plan_id = ?", (plan_id,)).fetchone()
        if row is None:
            content = render_analysis_pdf(order)
            db.execute("INSERT OR IGNORE INTO analysis_reports (order_id, plan_id, filename, pdf_content, created_at) VALUES (?, ?, ?, ?, ?)",
                       (order_id, plan_id, filename, content, now_iso()))
            row = db.execute("SELECT id, filename, created_at FROM analysis_reports WHERE plan_id = ?", (plan_id,)).fetchone()
    return {**dict(row), "order_id": order_id, "plan_id": plan_id,
            "download_url": f"/api/orders/{order_id}/reports/{row['id']}/pdf"}


@app.post("/api/orders/{order_id}/reports", status_code=201)
def save_analysis_report(order_id: int) -> dict[str, Any]:
    return _save_analysis_report(order_id)


@app.get("/api/orders/{order_id}/reports")
def list_analysis_reports(order_id: int) -> list[dict[str, Any]]:
    get_order(order_id)
    with connect() as db:
        rows = db.execute("SELECT id, plan_id, filename, created_at FROM analysis_reports WHERE order_id = ? ORDER BY id DESC", (order_id,)).fetchall()
    return [{**dict(row), "download_url": f"/api/orders/{order_id}/reports/{row['id']}/pdf"} for row in rows]


@app.get("/api/orders/{order_id}/reports/{report_id}/pdf")
def download_analysis_report(order_id: int, report_id: int) -> Response:
    with connect() as db:
        row = db.execute("SELECT filename, pdf_content FROM analysis_reports WHERE id = ? AND order_id = ?", (report_id, order_id)).fetchone()
    if row is None:
        raise HTTPException(404, "Report not found.")
    return Response(content=row["pdf_content"], media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{row["filename"]}"'})


@app.get("/api/orders/{order_id}/export.pdf")
def export_order_pdf(order_id: int) -> Response:
    report = _save_analysis_report(order_id)
    return download_analysis_report(order_id, report["id"])


@app.get("/api/orders/{order_id}/export")
def export_order(order_id: int) -> StreamingResponse:
    order = get_order(order_id)
    if not order.get("plan"):
        raise HTTPException(422, "Calculate a packing plan before exporting it.")
    result = order["plan"]["result"]
    workbook = Workbook()
    summary = workbook.active
    summary.title = "Summary"
    navy = "0A1725"
    cyan = "19D3F3"
    pale = "DCE8ED"
    summary.append(["PACKFLOW", "Packing plan"])
    summary.append(["Order", order["order_number"]])
    summary.append(["Customer", order["client"]])
    summary.append(["Supplier", order["vendor"]])
    summary.append(["Date", order["order_date"]])
    summary.append(["Requested date", order["requested_date"]])
    summary.append(["Currency", order["currency"]])
    summary.append(["Terms", order["terms"]])
    summary.append(["Delivery address", order["delivery_address"]])
    summary.append(["Total", order["total_amount"]])
    summary.append(["Boxes", result["box_count"]])
    summary.append(["Units", result["unit_count"]])
    summary.append(["Total utilization", result["average_utilization"] / 100])
    summary.append(["Total gross weight (kg)", result["total_weight_kg"]])
    summary.append(["Method", result["method"]])
    summary["A1"].font = Font(bold=True, color=navy, size=18)
    summary["B1"].font = Font(bold=True, color=navy, size=14)
    summary["B12"].number_format = "0.0%"
    summary.column_dimensions["A"].width = 24
    summary.column_dimensions["B"].width = 54

    boxes_sheet = workbook.create_sheet("Boxes")
    boxes_sheet.append([
        "Box", "Type", "Length (cm)", "Width (cm)", "Height (cm)",
        "Utilization", "Gross weight (kg)", "Max. weight (kg)", "Available space (L)",
    ])
    for cell in boxes_sheet[1]:
        cell.fill = PatternFill("solid", fgColor=navy)
        cell.font = Font(bold=True, color=pale)
        cell.alignment = Alignment(horizontal="center")
    for box in result["boxes"]:
        length, width, height = box["dimensions_cm"]
        boxes_sheet.append([
            box["sequence"], box["box_code"], length, width, height,
            box["utilization"] / 100, box["gross_weight_kg"],
            box["max_weight_kg"], box["remaining_volume_l"],
        ])
    for cell in boxes_sheet["F"][1:]:
        cell.number_format = "0.0%"
    boxes_sheet.freeze_panes = "A2"
    boxes_sheet.auto_filter.ref = boxes_sheet.dimensions
    for column in boxes_sheet.columns:
        letter = column[0].column_letter
        boxes_sheet.column_dimensions[letter].width = max(13, min(24, max(len(str(cell.value or "")) for cell in column) + 2))

    contents = workbook.create_sheet("Contents")
    contents.append([
        "Box", "Product", "Quantity", "Unit price",
        "Discount", "Tax", "Requested date", "Amount",
    ])
    for cell in contents[1]:
        cell.fill = PatternFill("solid", fgColor=navy)
        cell.font = Font(bold=True, color=pale)
    item_details = {str(item["product_id"]): item for item in order["items"] if item["product_id"]}
    for box in result["boxes"]:
        for item in box["items"]:
            detail = item_details.get(item["sku"], {})
            contents.append([
                box["sequence"], item["name"], item["quantity"],
                detail.get("unit_price", 0), detail.get("discount_percent", 0) / 100,
                detail.get("tax_label", ""), detail.get("requested_date"),
                detail.get("amount", 0),
            ])
    contents.freeze_panes = "A2"
    contents.auto_filter.ref = contents.dimensions
    contents.column_dimensions["A"].width = 10
    contents.column_dimensions["B"].width = 38
    contents.column_dimensions["C"].width = 12
    for cell in contents["E"][1:]:
        cell.number_format = "0.0%"

    stream = BytesIO()
    workbook.save(stream)
    stream.seek(0)
    safe_number = "".join(character for character in order["order_number"] if character.isalnum() or character in "-_")
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="plan-{safe_number}.xlsx"'},
    )


@app.get("/api/catalog/products")
def list_products() -> list[dict[str, Any]]:
    with connect() as db:
        return rows_to_dicts(db.execute("SELECT * FROM products ORDER BY name").fetchall())


@app.get("/api/catalog/boxes")
def list_boxes() -> list[dict[str, Any]]:
    with connect() as db:
        return rows_to_dicts(db.execute("SELECT * FROM box_types ORDER BY code").fetchall())


@app.post("/api/catalog/products", status_code=201)
def create_product(payload: ProductPayload) -> dict[str, Any]:
    with connect() as db:
        existing = _find_product_by_description(db, payload.name)
        if existing and _normalize_product_name(existing["name"]) == _normalize_product_name(payload.name):
            raise HTTPException(409, "A product with this name already exists.")
        try:
            cursor = db.execute(
                """
                INSERT INTO products
                    (sku, name, length_cm, width_cm, height_cm, weight_kg,
                     rotation_allowed, fragile, active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (
                    _internal_product_code(payload.name), payload.name, payload.length_cm,
                    payload.width_cm, payload.height_cm, payload.weight_kg,
                    int(payload.rotation_allowed), int(payload.fragile), now_iso(),
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(409, "A product with this name already exists.") from exc
        return dict(db.execute("SELECT * FROM products WHERE id = ?", (cursor.lastrowid,)).fetchone())


@app.post("/api/catalog/boxes", status_code=201)
def create_box(payload: BoxPayload) -> dict[str, Any]:
    with connect() as db:
        try:
            cursor = db.execute(
                """
                INSERT INTO box_types
                    (code, name, length_cm, width_cm, height_cm,
                     empty_weight_kg, max_weight_kg, active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (
                    payload.code.upper(), payload.name, payload.length_cm,
                    payload.width_cm, payload.height_cm, payload.empty_weight_kg,
                    payload.max_weight_kg, now_iso(),
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise HTTPException(409, "This box code already exists.") from exc
        return dict(db.execute("SELECT * FROM box_types WHERE id = ?", (cursor.lastrowid,)).fetchone())


def _upsert_product_record(db: sqlite3.Connection, record: dict[str, Any]) -> None:
    product = _find_product_by_description(db, str(record["name"]))
    is_same_name = bool(
        product
        and _normalize_product_name(product["name"])
        == _normalize_product_name(str(record["name"]))
    )
    if is_same_name:
        db.execute(
            """
            UPDATE products SET name=?, length_cm=?, width_cm=?, height_cm=?,
                weight_kg=?, active=1 WHERE id=?
            """,
            (
                record["name"], record["length_cm"], record["width_cm"],
                record["height_cm"], record["weight_kg"], product["id"],
            ),
        )
        return
    db.execute(
        """
        INSERT INTO products
            (sku, name, length_cm, width_cm, height_cm, weight_kg,
             rotation_allowed, fragile, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 0, 1, ?)
        """,
        (
            _internal_product_code(str(record["name"])), record["name"],
            record["length_cm"], record["width_cm"], record["height_cm"],
            record["weight_kg"], now_iso(),
        ),
    )


def _upsert_box_record(db: sqlite3.Connection, record: dict[str, Any]) -> None:
    db.execute(
        """
        INSERT INTO box_types
            (code, name, length_cm, width_cm, height_cm,
             empty_weight_kg, max_weight_kg, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(code) DO UPDATE SET
            name=excluded.name, length_cm=excluded.length_cm,
            width_cm=excluded.width_cm, height_cm=excluded.height_cm,
            empty_weight_kg=excluded.empty_weight_kg,
            max_weight_kg=excluded.max_weight_kg, active=1
        """,
        (
            str(record["code"]).upper(), record["name"], record["length_cm"],
            record["width_cm"], record["height_cm"], record["empty_weight_kg"],
            record["max_weight_kg"], now_iso(),
        ),
    )


@app.post("/api/catalog/{catalog_type}/import")
async def import_catalog(catalog_type: str, file: UploadFile = File(...)) -> dict[str, Any]:
    if catalog_type not in {"products", "boxes"}:
        raise HTTPException(404, "Unknown catalog.")
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Upload an Excel .xlsx file.")
    content = await file.read()
    reference = parse_reference_workbook(content)
    records: list[dict[str, Any]] = []
    errors: list[str] = []
    if not reference:
        records, errors = parse_catalog_excel(content, catalog_type)
    imported = 0
    imported_products = 0
    imported_boxes = 0
    with connect() as db:
        if reference:
            for record in reference["products"]:
                try:
                    _upsert_product_record(db, record)
                    imported += 1
                    imported_products += 1
                except sqlite3.DatabaseError as exc:
                    errors.append(f"Could not import product {record.get('name')}: {exc}")
            for record in reference["boxes"]:
                try:
                    _upsert_box_record(db, record)
                    imported += 1
                    imported_boxes += 1
                except sqlite3.DatabaseError as exc:
                    errors.append(f"Could not import box {record.get('name')}: {exc}")
            for order in db.execute("SELECT id FROM orders").fetchall():
                _relink_order_items(db, order["id"])
            return {
                "imported": imported,
                "imported_products": imported_products,
                "imported_boxes": imported_boxes,
                "reference_workbook": True,
                "errors": errors,
            }
        for record in records:
            try:
                if catalog_type == "products":
                    _upsert_product_record(db, record)
                else:
                    _upsert_box_record(db, record)
                imported += 1
            except sqlite3.DatabaseError as exc:
                errors.append(f"Could not import {record}: {exc}")
    return {"imported": imported, "errors": errors}
