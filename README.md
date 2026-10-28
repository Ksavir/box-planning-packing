# PackFlow MVP

PackFlow turns purchase orders received as PDFs, emails, calls or messages into verifiable packing plans. The MVP extracts data from known document formats, supports manual order entry, matches each product to the catalog by name or description, and calculates a three-dimensional layout that respects dimensions and weight limits.

## Stack

- React 19, TypeScript and Vite.
- FastAPI and Python 3.12.
- SQLite, with no external database service.
- `pypdf` for text-based PDFs and ReportLab for PDF reports.
- `openpyxl` for Excel catalogs.
- A 3D packing engine with a bounded search over box combinations, multiple item orderings and guillotine partitions.

## Local development

### API

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8001
```

Interactive API documentation is available at `http://127.0.0.1:8001/docs`.

### Web

```bash
cd frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` requests to port `8001`.

## Excel catalogs

The first row must contain column headers. Both English and Spanish header variants are accepted.

Products:

| Field | Example headers |
| --- | --- |
| Name | `nombre`, `descripción`, `name` |
| Length | `largo`, `largo cm`, `length` |
| Width | `ancho`, `ancho cm`, `width` |
| Height | `alto`, `alto cm`, `height` |
| Weight | `peso`, `peso kg`, `weight` |

Boxes:

| Field | Example headers |
| --- | --- |
| Code | `código`, `code`, `caja` |
| Name | `nombre`, `name` |
| Length, width and height | `largo`, `ancho`, `alto` |
| Empty weight | `peso caja`, `tara`, `empty weight` |
| Maximum weight | `peso máximo`, `capacidad kg`, `max weight` |

Dimensions are expressed in centimeters and weights in kilograms. Products with the same name and boxes with the same code are updated during an import.

The importer also recognizes the operational workbook `Volume - weight calculator.xlsx` directly. In a single upload, it reads weights from `boxes bottles volumes` and box types from `box types-what fits`, converts millimeters to centimeters and grams to kilograms, and rematches existing order items by description. Because the workbook does not include the maximum permitted weight per box, the MVP temporarily uses 25 kg for imported box types.

## MVP workflow

1. Open **New order** and choose **From PDF** or **Manual entry**.
2. For manual entry, enter the information available in the customer's email or message.
3. Review the customer, supplier, order number, dates, terms, addresses and totals.
4. Confirm each line item's description, quantity, price, tax, discount, requested date and amount.
5. Correct or add line items as needed.
6. Select **Validate and calculate**.
7. Inspect each box's utilization, weight, contents and recommendations.
8. Export the result to Excel, with summary, boxes and contents worksheets.

## Order information

The normalized structure supports:

- Order number, customer, supplier and source (`pdf`, `manual` or `email`).
- Order date and requested date.
- Currency, terms, notes, delivery address and billing address.
- Subtotal, tax and total.
- Per line item: product description, quantity, unit price, tax, discount, requested date and amount.

Dedicated extractors are currently available for the Rev1 Technologies and Hava 3D formats, alongside a conservative generic extractor.

The repository includes sample products, boxes and three demo orders. The database is created at `backend/data/packflow.db` on the first startup.

## Verification

```bash
cd backend
PYTHONPATH=. .venv/bin/python -m unittest discover -s tests -v

cd ../frontend
npm run build
```

## Current limitations

- Automatic extraction supports PDFs containing text. Scanned documents require OCR integration in a future iteration.
- Rev1 Technologies and Hava 3D formats have dedicated extractors. Other layouts use conservative extraction and require review.
- The algorithm aims for a practical, reproducible solution. It does not guarantee a global mathematical optimum for the 3D bin packing problem.
- Authentication, permissions, external storage and advanced auditing have not been implemented.

## Additional backend features

### Create an order from email text

`POST /api/orders/email` accepts JSON. `text` is required; `client`, `subject` and
`order_number` are optional. A unique order number is generated if none is provided.

```json
{
  "text": "Hi Alex,\nMagigoo Pro PP – 15 pcs\nMagigoo Pro PA – 15 pcs\nMagigoo Original 120ml – 15 pcs\nBest regards,\nQing",
  "subject": "Pricing and lead time"
}
```

Returns the saved order with `source_type: "email"` and `status: "needs_review"`.
The example produces three line items of 15 units each. The parser recognizes
explicit quantities such as `15 pcs`, `7 unidades`, `15 x Product`,
`Product x 15` and `Product - 15`.
It does not mistake `120ml` for a quantity, and skips signatures and quoted history.
The full email is preserved in the notes. Prices remain zero (pending), without
inventing amounts, and products are matched to the available catalog.
Complete the remaining details through `PATCH /api/orders/{id}`. If no line items
can be extracted, the endpoint returns 422. It does not connect to a mailbox or send emails.

### Save and download the final analysis as a PDF

After calculating a complete plan:

- `POST /api/orders/{id}/reports`: saves a PDF copy in SQLite and returns `id`,
  `plan_id`, `filename`, `created_at` and `download_url`. Repeating the request for
  the same plan returns the existing report.
- `GET /api/orders/{id}/reports`: lists saved copies.
- `GET /api/orders/{id}/reports/{report_id}/pdf`: downloads a specific copy.
- `GET /api/orders/{id}/export.pdf`: saves and downloads the current plan directly.

The PDF includes order details, a summary, original and additional line items,
contents per box, positions and orientations of each unit, weight limits and
recommendations. It identifies pending prices and provisional totals.
Orders without a complete plan are rejected with 422. Saved reports are immutable
snapshots: reviewing an order invalidates its current plan but preserves earlier
PDF reports. Excel export remains available at `/api/orders/{id}/export`.

### Box selection and additional products

The primary objective is to minimize the total box volume for the original order,
which is equivalent to minimizing unused space. For equal volumes, fewer boxes
are preferred. The engine may therefore prefer several small boxes over one large
box if they leave less unused space overall. It evaluates up to 16 search states
per level, multiple item orderings and partition sequences, checking dimensions,
permitted rotations and weight, including the empty box weight. This is a bounded
heuristic search; it does not guarantee a global mathematical optimum.

Recommendations test additional units within the actual remaining spaces,
without increasing box sizes or counts or moving the original order's items.
They also support products with pending prices. Recommendations are ranked by
highest projected utilization, then by lowest additional amount in the event of a
tie. Each proposal is an independent alternative of up to 100 units of a product
from the original order; the proposals do not form a jointly optimal combination.
They are recalculated after a proposal is applied. Attempting to add more units
than fit returns 422 and rolls back the entire operation, including amounts and
additional line items.

The interface includes **New order → From email** to paste an email and continue
with review and calculation. For a complete plan, **Save plan & go home** saves
the PDF and returns to the overview. **Delete all orders** is available on the
overview and purchase orders pages, with explicit confirmation before deletion.

`DELETE /api/orders` deletes all orders, their line items, plans and PDF reports
in a single transaction. It returns `deleted_orders` and preserves products and
boxes. Demo orders are not recreated on restart after deletion.

## Publish a free demo

The complete app is ready to deploy as a single Docker service on Render Free.
See the [deployment guide](docs/DEPLOY.md). The free plan uses ephemeral storage:
orders and PDF reports are lost when the service restarts.
