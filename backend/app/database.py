from __future__ import annotations

import json
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable

from .language import english_plan_copy


APP_DIR = Path(__file__).resolve().parent
DEFAULT_DB_PATH = APP_DIR.parent / "data" / "packflow.db"
DB_PATH = Path(os.getenv("PACKFLOW_DB_PATH", DEFAULT_DB_PATH))


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def init_db() -> None:
    with connect() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                length_cm REAL NOT NULL CHECK(length_cm > 0),
                width_cm REAL NOT NULL CHECK(width_cm > 0),
                height_cm REAL NOT NULL CHECK(height_cm > 0),
                weight_kg REAL NOT NULL CHECK(weight_kg > 0),
                rotation_allowed INTEGER NOT NULL DEFAULT 1,
                fragile INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS box_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                length_cm REAL NOT NULL CHECK(length_cm > 0),
                width_cm REAL NOT NULL CHECK(width_cm > 0),
                height_cm REAL NOT NULL CHECK(height_cm > 0),
                empty_weight_kg REAL NOT NULL CHECK(empty_weight_kg >= 0),
                max_weight_kg REAL NOT NULL CHECK(max_weight_kg > 0),
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_number TEXT NOT NULL UNIQUE,
                client TEXT NOT NULL,
                vendor TEXT NOT NULL DEFAULT '',
                order_date TEXT,
                requested_date TEXT,
                currency TEXT NOT NULL DEFAULT 'USD',
                source_filename TEXT,
                source_type TEXT NOT NULL DEFAULT 'pdf',
                delivery_address TEXT NOT NULL DEFAULT '',
                billing_address TEXT NOT NULL DEFAULT '',
                terms TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                subtotal REAL NOT NULL DEFAULT 0,
                tax_amount REAL NOT NULL DEFAULT 0,
                total_amount REAL NOT NULL DEFAULT 0,
                status TEXT NOT NULL DEFAULT 'needs_review',
                confidence REAL NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_id INTEGER REFERENCES products(id),
                sku_raw TEXT NOT NULL,
                description TEXT NOT NULL,
                quantity INTEGER NOT NULL CHECK(quantity > 0),
                unit_price REAL NOT NULL DEFAULT 0,
                line_number INTEGER,
                requested_date TEXT,
                tax_label TEXT NOT NULL DEFAULT '',
                discount_percent REAL NOT NULL DEFAULT 0,
                amount REAL NOT NULL DEFAULT 0,
                is_suggested INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS packing_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                box_count INTEGER NOT NULL,
                average_utilization REAL NOT NULL,
                total_weight_kg REAL NOT NULL,
                result_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS analysis_reports (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                plan_id INTEGER UNIQUE REFERENCES packing_plans(id) ON DELETE SET NULL,
                filename TEXT NOT NULL,
                pdf_content BLOB NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
            CREATE INDEX IF NOT EXISTS idx_plans_order ON packing_plans(order_id, id DESC);
            """
        )
        _migrate_schema(db)
        seed_demo_data(db)
        if os.getenv("PACKFLOW_SEED_REFERENCE_CATALOG", "").lower() in {"1", "true"}:
            seed_reference_catalog(db)


def _ensure_column(
    db: sqlite3.Connection, table: str, column: str, definition: str
) -> None:
    existing = {row["name"] for row in db.execute(f"PRAGMA table_info({table})")}
    if column not in existing:
        db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def _migrate_schema(db: sqlite3.Connection) -> None:
    """Aplica migraciones aditivas para bases SQLite creadas por versiones anteriores."""
    order_columns = {
        "vendor": "TEXT NOT NULL DEFAULT ''",
        "requested_date": "TEXT",
        "source_type": "TEXT NOT NULL DEFAULT 'pdf'",
        "delivery_address": "TEXT NOT NULL DEFAULT ''",
        "billing_address": "TEXT NOT NULL DEFAULT ''",
        "terms": "TEXT NOT NULL DEFAULT ''",
        "notes": "TEXT NOT NULL DEFAULT ''",
        "subtotal": "REAL NOT NULL DEFAULT 0",
        "tax_amount": "REAL NOT NULL DEFAULT 0",
        "total_amount": "REAL NOT NULL DEFAULT 0",
    }
    item_columns = {
        "line_number": "INTEGER",
        "requested_date": "TEXT",
        "tax_label": "TEXT NOT NULL DEFAULT ''",
        "discount_percent": "REAL NOT NULL DEFAULT 0",
        "amount": "REAL NOT NULL DEFAULT 0",
        "is_suggested": "INTEGER NOT NULL DEFAULT 0",
    }
    for column, definition in order_columns.items():
        _ensure_column(db, "orders", column, definition)
    for column, definition in item_columns.items():
        _ensure_column(db, "order_items", column, definition)


def rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
    return [dict(row) for row in rows]


def seed_reference_catalog(db: sqlite3.Connection) -> None:
    """Restore the demo's reference catalog on fresh ephemeral instances.

    Only insert missing records. User edits, disabled records and imported
    measurements must survive subsequent startup calls on the same database.
    """
    catalog = json.loads((APP_DIR / "reference_catalog.json").read_text())
    for product in catalog["products"]:
        db.execute(
            """INSERT INTO products
                (sku, name, length_cm, width_cm, height_cm, weight_kg,
                 rotation_allowed, fragile, active, created_at)
               SELECT ?, ?, ?, ?, ?, ?, ?, ?, 1, ?
               WHERE NOT EXISTS (SELECT 1 FROM products WHERE lower(trim(name)) = lower(?))
               ON CONFLICT(sku) DO NOTHING""",
            (product["sku"], product["name"], product["length_cm"], product["width_cm"],
             product["height_cm"], product["weight_kg"], product["rotation_allowed"],
             product["fragile"], now_iso(), product["name"]),
        )
    for box in catalog["boxes"]:
        db.execute(
            """INSERT INTO box_types
                (code, name, length_cm, width_cm, height_cm, empty_weight_kg,
                 max_weight_kg, active, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
               ON CONFLICT(code) DO NOTHING""",
            (box["code"], box["name"], box["length_cm"], box["width_cm"], box["height_cm"],
             box["empty_weight_kg"], box["max_weight_kg"], now_iso()),
        )


def seed_demo_data(db: sqlite3.Connection) -> None:
    if db.execute("SELECT COUNT(*) FROM products").fetchone()[0] == 0:
        timestamp = now_iso()
        db.executemany(
            """
            INSERT INTO products
                (sku, name, length_cm, width_cm, height_cm, weight_kg,
                 rotation_allowed, fragile, active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            """,
            [
                ("GLV-100", "Guantes de nitrilo · caja", 24, 13, 8, 0.72, 1, 0, timestamp),
                ("KIT-210", "Kit de primeros auxilios", 30, 22, 12, 1.80, 1, 0, timestamp),
                ("FLT-400", "Filtro industrial F400", 28, 28, 6, 0.45, 1, 0, timestamp),
                ("PUMP-08", "Bomba compacta P8", 36, 20, 18, 4.20, 0, 1, timestamp),
                ("TUBE-50", "Set de tubos reforzados", 20, 10, 10, 0.35, 1, 0, timestamp),
                ("SENSOR-X", "Sensor de presión X", 16, 12, 7, 0.28, 1, 1, timestamp),
                ("VALVE-20", "Válvula sanitaria 20 mm", 18, 14, 11, 0.62, 1, 0, timestamp),
            ],
        )

    if db.execute("SELECT COUNT(*) FROM box_types").fetchone()[0] == 0:
        timestamp = now_iso()
        db.executemany(
            """
            INSERT INTO box_types
                (code, name, length_cm, width_cm, height_cm, empty_weight_kg,
                 max_weight_kg, active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
            """,
            [
                ("BX-S", "Caja compacta", 32, 24, 16, 0.24, 8, timestamp),
                ("BX-M", "Caja estándar", 48, 34, 28, 0.55, 18, timestamp),
                ("BX-L", "Caja de carga", 62, 42, 40, 0.90, 30, timestamp),
            ],
        )

    seeded = db.execute("SELECT 1 FROM app_settings WHERE key = 'demo_orders_seeded'").fetchone()
    db.execute("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('demo_orders_seeded', '1')")
    if not seeded and db.execute("SELECT COUNT(*) FROM orders").fetchone()[0] == 0:
        products = {
            row["sku"]: row["id"]
            for row in db.execute("SELECT id, sku FROM products").fetchall()
        }
        timestamp = now_iso()
        demo_orders = [
            (
                "PO-1048",
                "Northstar Labs",
                "2026-10-27",
                0.96,
                [("GLV-100", 6, 14.50), ("SENSOR-X", 2, 89), ("FLT-400", 4, 28.75)],
            ),
            (
                "PO-1047",
                "Atlas Manufacturing",
                "2026-10-26",
                0.92,
                [("PUMP-08", 2, 349), ("TUBE-50", 3, 22), ("VALVE-20", 4, 47.50)],
            ),
            (
                "PO-1046",
                "Meridian Health",
                "2026-10-25",
                0.88,
                [("KIT-210", 5, 74), ("GLV-100", 8, 14.50), ("SENSOR-X", 3, 89)],
            ),
        ]
        for number, client, date, confidence, items in demo_orders:
            cursor = db.execute(
                """
                INSERT INTO orders
                    (order_number, client, order_date, currency, source_filename,
                     status, confidence, created_at, updated_at)
                VALUES (?, ?, ?, 'USD', 'orden-demo.pdf', 'ready', ?, ?, ?)
                """,
                (number, client, date, confidence, timestamp, timestamp),
            )
            order_id = cursor.lastrowid
            db.executemany(
                """
                INSERT INTO order_items
                    (order_id, product_id, sku_raw, description, quantity, unit_price)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                [
                    (
                        order_id,
                        products[sku],
                        sku,
                        db.execute("SELECT name FROM products WHERE sku = ?", (sku,)).fetchone()[0],
                        quantity,
                        price,
                    )
                    for sku, quantity, price in items
                ],
            )


def latest_plan(db: sqlite3.Connection, order_id: int) -> dict[str, Any] | None:
    row = db.execute(
        "SELECT * FROM packing_plans WHERE order_id = ? ORDER BY id DESC LIMIT 1",
        (order_id,),
    ).fetchone()
    if not row:
        return None
    plan = dict(row)
    plan["result"] = english_plan_copy(json.loads(plan.pop("result_json")))
    return plan

