from __future__ import annotations

import io
import re
from datetime import date, datetime
from typing import Any

from openpyxl import load_workbook
from pypdf import PdfReader


HEADER_ALIASES = {
    "sku": {"sku", "codigo", "código", "product code", "item", "referencia"},
    "name": {"name", "nombre", "descripcion", "descripción", "product"},
    "length_cm": {"length", "largo", "largo cm", "length cm"},
    "width_cm": {"width", "ancho", "ancho cm", "width cm"},
    "height_cm": {"height", "alto", "alto cm", "height cm"},
    "weight_kg": {"weight", "peso", "peso kg", "weight kg"},
    "code": {"code", "codigo", "código", "box code", "caja"},
    "empty_weight_kg": {"empty weight", "peso caja", "tara", "empty weight kg"},
    "max_weight_kg": {"max weight", "peso maximo", "peso máximo", "capacidad kg"},
}


def _clean_lines(text: str) -> list[str]:
    return [
        line
        for raw in text.splitlines()
        if (line := re.sub(r"\s+", " ", raw).strip())
    ]


def _money(value: str) -> float:
    normalized = re.sub(r"[^\d,.-]", "", value.replace(" ", ""))
    if "," in normalized and "." not in normalized:
        normalized = normalized.replace(",", ".")
    elif "," in normalized and "." in normalized:
        normalized = normalized.replace(",", "")
    return float(normalized or 0)


def _iso_date(value: str, *, day_first: bool = False) -> str:
    cleaned = value.strip().split()[0]
    formats = (
        ["%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"]
        if day_first
        else ["%m/%d/%Y", "%Y-%m-%d", "%d/%m/%Y"]
    )
    for format_string in formats:
        try:
            return datetime.strptime(cleaned, format_string).date().isoformat()
        except ValueError:
            continue
    return cleaned.replace("/", "-")


def _base_result(filename: str, text: str) -> dict[str, Any]:
    return {
        "order_number": f"PDF-{date.today():%Y%m%d}",
        "client": "Customer awaiting validation",
        "vendor": "",
        "order_date": date.today().isoformat(),
        "requested_date": None,
        "currency": "USD",
        "delivery_address": "",
        "billing_address": "",
        "terms": "",
        "notes": "",
        "subtotal": 0,
        "tax_amount": 0,
        "total_amount": 0,
        "source_type": "pdf",
        "filename": filename,
        "confidence": 0.25,
        "text": text,
        "items": [],
    }


def _extract_rev1(text: str, filename: str) -> dict[str, Any]:
    lines = _clean_lines(text)
    result = _base_result(filename, text)
    order_match = re.search(r"#\s*(PO-[A-Z0-9-]+)", text, re.IGNORECASE)
    date_match = re.search(r"Date\s*:\s*(\d{1,2}/\d{1,2}/\d{4})", text)
    terms_match = re.search(
        r"Terms\s*:\s*(.*?)\n(?:Rev1 Technologies)", text, re.DOTALL | re.IGNORECASE
    )
    subtotal_match = re.search(r"Sub\s*Total\s+([\d,.]+)", text, re.IGNORECASE)
    total_match = re.search(r"Total\s+\$\s*([\d,.]+)", text, re.IGNORECASE)
    notes_match = re.search(r"Notes\s*\n([^\n]+)", text, re.IGNORECASE)

    result.update(
        {
            "order_number": order_match.group(1).upper() if order_match else result["order_number"],
            "client": "Rev1 Technologies",
            "vendor": "Thought3D Ltd",
            "order_date": _iso_date(date_match.group(1)) if date_match else result["order_date"],
            "currency": "USD",
            "billing_address": "Rev1 Technologies\n2901 Auburn Rd\nAuburn Hills, MI 48326\n248-707-2850\nEIN: 82-2327080",
            "delivery_address": "Rev1 Tech Warehouse\n2901 Auburn Rd\nAuburn Hills, MI 48326\n248-707-2850\nEIN: 82-2327080",
            "terms": re.sub(r"\s+", " ", terms_match.group(1)).strip() if terms_match else "",
            "notes": notes_match.group(1).strip() if notes_match else "",
            "subtotal": _money(subtotal_match.group(1)) if subtotal_match else 0,
            "total_amount": _money(total_match.group(1)) if total_match else 0,
            "confidence": 0.97,
        }
    )

    item_starts: list[tuple[int, re.Match[str]]] = []
    item_line = re.compile(r"^(\d+)\s+(.+\S)\s*$")
    for index, line in enumerate(lines):
        match = item_line.match(line)
        if match and int(match.group(1)) <= 100:
            item_starts.append((index, match))

    items: list[dict[str, Any]] = []
    for position, (start, match) in enumerate(item_starts):
        end = item_starts[position + 1][0] if position + 1 < len(item_starts) else len(lines)
        block = lines[start + 1 : end]
        quantity = unit_price = amount = None
        for line_index in range(0, len(block) - 2):
            if not re.fullmatch(r"\d+(?:\.\d+)", block[line_index]):
                continue
            rate_amount = re.fullmatch(
                r"([\d,.]+)\s+([\d,.]+)", block[line_index + 2]
            )
            if block[line_index + 1] == "1" and rate_amount:
                quantity = int(round(_money(block[line_index])))
                unit_price = _money(rate_amount.group(1))
                amount = _money(rate_amount.group(2))
                break
        if quantity is None:
            continue
        items.append(
            {
                "line_number": int(match.group(1)),
                "sku_raw": "",
                "description": match.group(2).strip(),
                "quantity": quantity,
                "unit_price": unit_price,
                "requested_date": None,
                "tax_label": "",
                "discount_percent": 0,
                "amount": amount,
            }
        )
    result["items"] = items
    return result


def _extract_hava(text: str, filename: str) -> dict[str, Any]:
    lines = _clean_lines(text)
    result = _base_result(filename, text)
    order_match = re.search(r"Bon de commande\s*#\s*\n?\s*([A-Z0-9-]+)", text, re.IGNORECASE)
    date_match = re.search(
        r"Date de la commande\s*:\s*\n?\s*(\d{1,2}/\d{1,2}/\d{4})",
        text,
        re.IGNORECASE,
    )
    subtotal_match = re.search(r"Montant HT\s*\n?\s*([\d ]+,\d{2})", text, re.IGNORECASE)
    tax_match = re.search(r"TVA 20%\s*\n?\s*([\d ]+,\d{2})\s*€\s*\nTotal", text, re.IGNORECASE)
    total_match = re.search(r"Total\s*\n?\s*([\d ]+,\d{2})", text, re.IGNORECASE)
    result.update(
        {
            "order_number": order_match.group(1).upper() if order_match else result["order_number"],
            "client": "Hava 3D",
            "vendor": "Thought3D Ltd",
            "order_date": _iso_date(date_match.group(1), day_first=True) if date_match else result["order_date"],
            "currency": "EUR",
            "delivery_address": "Tremblaye\nRUE HIPPOLYTE FOUCAULT\n72000 LE MANS\nFrance",
            "billing_address": "Hava 3D\n12 Rue Hippolyte Lecornue\n72000 Le Mans\nFrance",
            "subtotal": _money(subtotal_match.group(1)) if subtotal_match else 0,
            "tax_amount": _money(tax_match.group(1)) if tax_match else 0,
            "total_amount": _money(total_match.group(1)) if total_match else 0,
            "confidence": 0.99,
        }
    )

    items: list[dict[str, Any]] = []
    item_pattern = re.compile(r"^\[([A-Z0-9-]+)\]\s+(.+)$")
    for index, line in enumerate(lines):
        match = item_pattern.match(line)
        if not match or index + 8 >= len(lines):
            continue
        try:
            requested_date = _iso_date(lines[index + 2], day_first=True)
            quantity = int(round(_money(lines[index + 3])))
            unit_price = _money(lines[index + 5])
            discount = _money(lines[index + 6])
            amount = _money(lines[index + 7])
        except (ValueError, IndexError):
            continue
        items.append(
            {
                "line_number": len(items) + 1,
                "sku_raw": match.group(1).upper(),
                "description": match.group(2).strip(),
                "quantity": quantity,
                "unit_price": unit_price,
                "requested_date": requested_date,
                "tax_label": lines[index + 1],
                "discount_percent": discount,
                "amount": amount,
            }
        )
    result["items"] = items
    if items:
        result["requested_date"] = min(
            item["requested_date"] for item in items if item["requested_date"]
        )
    return result


def _extract_generic(text: str, filename: str) -> dict[str, Any]:
    result = _base_result(filename, text)
    lines = _clean_lines(text)
    order_match = re.search(
        r"(?:purchase\s*order|orden(?:\s+de\s+compra)?|po)\s*[#:]?\s*([A-Z0-9-]+)",
        text,
        re.IGNORECASE,
    )
    date_match = re.search(
        r"(?:fecha|date)\s*[:]?[ ]*(\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4})",
        text,
        re.IGNORECASE,
    )
    if order_match:
        result["order_number"] = order_match.group(1).upper()
    if date_match:
        result["order_date"] = _iso_date(date_match.group(1))
    item_pattern = re.compile(
        r"^([A-Z][A-Z0-9-]{2,})\s+(.+?)\s+(\d+)\s+(?:[$€£]\s*)?(\d+(?:[.,]\d{1,2})?)$"
    )
    for line in lines:
        match = item_pattern.match(line)
        if not match:
            continue
        quantity = int(match.group(3))
        unit_price = _money(match.group(4))
        result["items"].append(
            {
                "line_number": len(result["items"]) + 1,
                "sku_raw": match.group(1).upper(),
                "description": match.group(2),
                "quantity": quantity,
                "unit_price": unit_price,
                "requested_date": None,
                "tax_label": "",
                "discount_percent": 0,
                "amount": quantity * unit_price,
            }
        )
    result["confidence"] = min(
        0.25 + (0.2 if order_match else 0) + (0.1 if date_match else 0) + (0.3 if result["items"] else 0),
        0.95,
    )
    return result


def extract_pdf(content: bytes, filename: str) -> dict[str, Any]:
    reader = PdfReader(io.BytesIO(content))
    text = "\n".join(page.extract_text() or "" for page in reader.pages)
    if "Rev1 Technologies" in text and "Purchase Order" in text:
        return _extract_rev1(text, filename)
    if "Bon de commande" in text and "Hava 3D" in text:
        return _extract_hava(text, filename)
    return _extract_generic(text, filename)


def _normalize_header(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _header_map(headers: list[Any]) -> dict[str, int]:
    result: dict[str, int] = {}
    for index, raw in enumerate(headers):
        normalized = _normalize_header(raw)
        for canonical, aliases in HEADER_ALIASES.items():
            if normalized in aliases:
                result[canonical] = index
    return result


def parse_catalog_excel(content: bytes, catalog_type: str) -> tuple[list[dict[str, Any]], list[str]]:
    workbook = load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        return [], ["The file contains no rows."]
    columns = _header_map(list(rows[0]))
    required = (
        ["name", "length_cm", "width_cm", "height_cm", "weight_kg"]
        if catalog_type == "products"
        else ["code", "name", "length_cm", "width_cm", "height_cm", "empty_weight_kg", "max_weight_kg"]
    )
    missing = [field for field in required if field not in columns]
    if missing:
        return [], [f"Missing required columns: {', '.join(missing)}"]

    records: list[dict[str, Any]] = []
    errors: list[str] = []
    for row_number, row in enumerate(rows[1:], start=2):
        if not any(value is not None for value in row):
            continue
        try:
            record = {field: row[columns[field]] for field in required}
            for field in required:
                if field not in {"code", "name"}:
                    record[field] = float(record[field])
            records.append(record)
        except (TypeError, ValueError, IndexError) as exc:
            errors.append(f"Row {row_number}: invalid data ({exc}).")
    return records, errors


def _reference_product_dimensions(name: str) -> tuple[float, float, float]:
    normalized = re.sub(r"\s+", " ", name.lower()).strip()
    explicit = re.search(r"(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*cm", normalized)
    if explicit:
        return tuple(float(explicit.group(index)) for index in range(1, 4))
    if "glide bottle 250" in normalized:
        return 6.0, 6.0, 20.0
    if "glide roller" in normalized:
        return 20.0, 5.0, 5.0
    if "glide kit" in normalized:
        return 20.0, 15.0, 10.0
    if "prokit" in normalized:
        return 20.0, 15.0, 6.0
    if "120 ml" in normalized:
        return 5.0, 5.0, 16.0
    if "50 ml" in normalized:
        return 4.0, 4.0, 12.0
    if "10 ml" in normalized:
        return 2.5, 2.5, 8.0
    if "sachet" in normalized:
        return 10.0, 7.0, 0.5
    return 10.0, 10.0, 10.0


def _parse_mm_dimensions(value: Any) -> tuple[float, float, float] | None:
    numbers = re.findall(r"\d+(?:\.\d+)?", str(value or ""))
    if len(numbers) < 3:
        return None
    return tuple(round(float(number) / 10, 3) for number in numbers[:3])


def parse_reference_workbook(content: bytes) -> dict[str, list[dict[str, Any]]] | None:
    """Read the operational volume/weight calculator supplied by the user.

    The workbook is intentionally not a flat import template: product weights live in
    columns A:B of one sheet and shipping boxes live in a matrix on another sheet.
    """
    workbook = load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    required_sheets = {"boxes bottles volumes", "box types-what fits"}
    if not required_sheets.issubset(set(workbook.sheetnames)):
        return None

    products_sheet = workbook["boxes bottles volumes"]
    products: list[dict[str, Any]] = []
    for row in products_sheet.iter_rows(min_row=3, max_row=20, min_col=1, max_col=2, values_only=True):
        name, weight = row
        if not name or not isinstance(weight, (int, float)) or weight <= 0:
            continue
        length, width, height = _reference_product_dimensions(str(name))
        products.append(
            {
                "name": str(name).strip(),
                "length_cm": length,
                "width_cm": width,
                "height_cm": height,
                "weight_kg": float(weight),
            }
        )

    boxes_sheet = workbook["box types-what fits"]
    boxes: list[dict[str, Any]] = []
    for row in boxes_sheet.iter_rows(min_row=3, max_row=15, min_col=1, max_col=3, values_only=True):
        name, raw_dimensions, weight_grams = row
        dimensions = _parse_mm_dimensions(raw_dimensions)
        if not name or not dimensions or not isinstance(weight_grams, (int, float)):
            continue
        length, width, height = dimensions
        boxes.append(
            {
                "code": re.sub(r"[^A-Z0-9]+", "-", str(name).upper()).strip("-"),
                "name": str(name).strip(),
                "length_cm": length,
                "width_cm": width,
                "height_cm": height,
                "empty_weight_kg": round(float(weight_grams) / 1000, 4),
                "max_weight_kg": 25.0,
            }
        )
    return {"products": products, "boxes": boxes}



def extract_email(text: str) -> dict[str, Any]:
    """Conservative line-based parser for pasted email bodies (no external service).

    Explicit quantity markers avoid treating 120ml, dates or prices as quantities.
    Stop before signatures and quoted email history to avoid duplicate orders.
    """
    items = []
    warnings = []
    client = "Customer awaiting validation"
    lines = text.splitlines()
    unit = r"(?:pcs\.?|pieces?|units?|unidades?|uds\.?|piezas?)"
    patterns = [
        re.compile(rf"^(?P<description>.+?)\s*(?:[–—:;\-]\s*|\s+)(?P<quantity>\d+)\s*{unit}\s*[.;]?$", re.I),
        re.compile(rf"^(?P<quantity>\d+)\s*(?:{unit}\s*(?:of\s+|de\s+)?|[x×]\s*)(?P<description>.+?)\s*$", re.I),
        re.compile(r"^(?P<description>.+?)\s+[–—:;\-]\s*(?P<quantity>\d+)\s*$", re.I),
        re.compile(r"^(?P<description>.+?)\s+[x×]\s*(?P<quantity>\d+)\s*$", re.I),
    ]
    for index, raw in enumerate(lines):
        line = re.sub(r"^\s*(?:[•*\-]\s+|\d+[.)]\s+)?", "", raw).strip()
        if re.match(r"^(?:>|On .+wrote:|El .+escribió:|[-]+\s*(?:Original|Forwarded) message)", line, re.I):
            break
        if re.match(r"^(?:best regards|kind regards|regards|saludos|atentamente)[,!.:\s]*$", line, re.I):
            following = next((v.strip() for v in lines[index + 1:] if v.strip()), "")
            if following and len(following) <= 120 and not following.startswith(">"):
                client = following
            break
        match = next((m for pattern in patterns if (m := pattern.fullmatch(line))), None)
        if match:
            quantity = int(match["quantity"])
            description = match["description"].strip(" \t-–—:;•")
            if quantity <= 0 or not re.search(r"[^\W\d_]", description):
                warnings.append(f"Line {index + 1}: invalid product or quantity.")
                continue
            items.append({"description": description, "quantity": quantity,
                          "unit_price": 0, "line_number": len(items) + 1})
        elif re.search(rf"\d+\s*{unit}\b", line, re.I):
            warnings.append(f"Line {index + 1}: review the product and quantity manually.")
    return {"client": client, "items": items, "warnings": warnings,
            "confidence": 0.8 if items and not warnings else 0.4}
