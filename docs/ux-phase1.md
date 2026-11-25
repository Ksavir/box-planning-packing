# Phase 1 — Core workflow safety

Date: 2 November 2026 (Europe/Malta).
Scope: UX-04, UX-05 and investigation/regression protection for VERIFY-01, VERIFY-02, VERIFY-04 from [improvement.md](improvement.md). Baseline: [ux-baseline.md](ux-baseline.md).

## Outcome and review gate

Phase 1 is implemented locally and ready for review. No production deployment, commit or push was performed. No files in `backend/app/` were changed. Extraction, matching rules, packing objective/algorithm, financial formulas, database schema, report generation and HTTP contracts remain unchanged. This is not an implementation of later viewer/navigation/dashboard redesign phases.

| Item | Result | Evidence / scope |
| --- | --- | --- |
| UX-04 | PASS | Separate Order information and Products to pack sections. Each product displays quantity, backend-confirmed match, read-only dimensions/unit weight, catalog rotation and fragile flag when available. Missing data is explicit. |
| UX-05 | PASS | Field bounds/required values, per-field messages, blocking issue count, focusable linked summary, non-blocking warnings, structured API errors and duplicate-number field mapping. Invalid values do not invoke review/calculation. Physical issues allow saving valid details to recheck matches but block calculation. |
| VERIFY-01 | PASS for existing formulas | Keyboard-accessible expandable explanations distinguish volume-weighted plan utilization from dashboard arithmetic mean. Regression tests lock both formulas. No numerical behavior changed. |
| VERIFY-02 | PASS for truthful UI claims | Replaced unconditional GEOMETRY VERIFIED / NO OVERLAPS badges with engine-origin wording. Explanation states which checks the engine performs and that stability, support and fragile stacking are not verified. No independent geometry/physical validator was added. |
| VERIFY-04 | PASS for scoped regression checks; PARTIAL for exhaustive audit | Tests cover supplied amounts/discounts/totals, separate terms/notes, review invalidation, summary parity in API/PDF/Excel, plus existing add/remove/report tests. Full commercial line-level parity across split boxes and all real document layouts is not certified. Existing seeded zero totals are explained, not silently rewritten. |

## Changes by file

- `frontend/src/review.ts`: pure draft/payload boundaries, numeric validation, match-state display rules and server-field error mapping. It does not implement a second product matcher or packing calculator.
- `frontend/src/components/ReviewProductRow.tsx`: labelled, responsive product cards; physical catalog data and field-level error descriptions. Replaces the review table's minimum-width layout for this workflow only.
- `frontend/src/pages/OrderDetail.tsx`: error summary/focus handling; explicit order information/products sections; revalidation before calculation; recoverable saved-versus-calculated messages; separate terms/notes controls. Disable exports/recalculation while editing so they cannot silently act on an older plan. Excel download errors now produce error feedback.
- `frontend/src/api.ts`: `ApiError` retains HTTP status and structured validation details while existing callers still receive an `Error` with a readable message. Request paths and payload contracts are unchanged.
- `frontend/src/components/BoxVisual.tsx`: replace unsupported verification claim with “PLACEMENTS FROM PACKING ENGINE”. Placement coordinates/rendering remain unchanged.
- `frontend/src/pages/Dashboard.tsx`: add explanation of the existing mean; no chart, KPI value or prioritization redesign.
- `frontend/src/styles.css`: product-card layout, error/warning treatments and expandable metric descriptions. An initial absolute-positioned description overflowed at 390px; changed it to expand in normal flow and rechecked.
- `frontend/package.json`, `frontend/tests/review.test.mjs`: add `npm run test` using Node's built-in runner and the already-installed TypeScript compiler. No dependency or lockfile change was needed.
- `backend/tests/test_ux_contracts.py`: four additional regression tests; no backend implementation changes.
- `docs/ux-phase1/`: local demonstration screenshots, not customer documents.

Phase 0 documentation/screenshots already present in the working tree are preserved separately.

## Matching and validation behavior

1. An unchanged description can show the match returned by the backend. Catalog data is fetched to check current availability and display orientation/fragile flags.
2. Editing a description, including changing it to a known catalog name, changes the state to Needs revalidation and hides the old dimensions/weight. New lines behave the same way. No browser fuzzy/alias matcher is introduced.
3. Blank order number/customer/description, invalid quantity, negative/nonfinite amounts and out-of-range discounts produce blocking field errors. Quantity must be a positive integer. Price zero is a warning and remains permitted.
4. Known missing/inactive products and nonpositive/missing dimensions or weight block packing. They do not prevent saving otherwise valid order fields through Save and recheck.
5. A pending description is sent through the existing review PATCH. The returned item identities/matches are checked before invoking analyze. If matching fails, the order details remain saved, calculation is not called, and the draft remains available with an actionable explanation.
6. If analysis or refreshing fails after a successful PATCH, the UI says details were saved and the remaining operation failed. It does not falsely imply a transaction rollback.
7. Parent refreshes no longer reset an in-progress draft merely because a new object was returned for the same order. Navigating to another order or explicitly entering editing starts from current server data.
8. Terms and notes are now separate controls, preventing the previous combined editor from merging distinct API fields.

Save and recheck is **not a new draft persistence mode**: it uses the existing review endpoint, marks the order ready and invalidates the prior plan as before. Calculation still requires Validate and calculate. Zero supplied subtotal/total still use the existing server fallback on save; warnings explain this. No tax-label parsing or automatic overwrite of nonzero supplied commercial values was added.

## Checks executed

| Check | Result |
| --- | --- |
| `npm run test --prefix frontend` | PASS — 17 tests |
| `npm run lint --prefix frontend` | PASS — TypeScript check; no ESLint configured |
| `npm run build --prefix frontend` | PASS — TypeScript + Vite production build |
| `cd backend && PYTHONPATH=. .venv/bin/python -m unittest discover -s tests -v` | PASS — 29 tests (25 baseline + 4 new) |
| `git diff --check` | PASS |
| Backend implementation diff | Empty for `backend/app/`; only new backend tests |

Frontend tests cover stale/new matches, incomplete/inactive catalog data, catalog outage fallback, required fields, integer quantities, nonfinite/negative money, discount bounds, non-blocking zero prices, save-versus-packing errors, unchanged supplied payload values, seeded fallback warnings, Pydantic field mapping, duplicate order numbers and API error preservation.

Backend tests specifically lock volume-weighted plan utilization (33.3%, rather than the 37.5% simple mean in the fixture), the dashboard's arithmetic mean, supplied financial values and separate terms/notes, plan invalidation after review, and API/PDF/Excel summary agreement. Existing packing/extraction/recommendation/report tests also pass.

## Browser verification

Used a fresh temporary SQLite database and built `app.web:app` on local port 8016, with built-in demo orders and reference catalog. No Render requests or real customer uploads were used. Desktop: 1440 × 900; mobile: 390 × 844 CSS pixels. Full-page captures are taller than the viewport.

| Scenario | Observed result |
| --- | --- |
| Open PO-1048 editor | Product cards display actual dimensions, weight, rotation and fragile flags. Seeded zero-total fallback appears as a non-blocking warning. |
| Clear customer and set first quantity to 0; calculate | Summary receives focus and shows two errors. SQLite still contains the three original plans and original customer: invalid input did not persist or calculate. |
| Follow quantity error link | Focus moves to `review-items-0-quantity`, with `aria-invalid=true` and `aria-describedby=review-items-0-quantity-error`. Activating the link with Enter was also checked. |
| Change description to an unknown synthetic product | Status becomes Needs revalidation; old measurements disappear before submission. |
| Validate changed unknown description | PATCH saves details; matching returns unavailable; calculation is stopped. Error summary explicitly states details were saved but packing was not calculated. |
| Restore original description and validate | Server confirms match; plan completes with the original 12 units, 2 boxes, 82.3% utilization and USD 380 fallback total. |
| Open utilization explanations on mobile | After fixing the initial overflow, measured document width 375px versus viewport 390px (scrollbar allowance), for both dashboard and packing explanation. Review validation screen measured 390px versus 390px. |
| Inspect desktop results | Document width 1425px versus viewport 1440px; inspector right edge 1393px, inside the viewport. |

The browser scenarios are manual integration checks, not a newly installed automated E2E framework. Native details controls and linked error focus were checked; full screen-reader, browser-matrix, 200% zoom and accessibility conformance audits remain future work.

### Screenshots

- [Desktop product review](ux-phase1/desktop-review.jpg)
- [Desktop validation summary](ux-phase1/desktop-validation.jpg)
- [Mobile validation and physical data](ux-phase1/mobile-validation.jpg)
- [Mobile catalog failure with saved-versus-calculated feedback](ux-phase1/mobile-catalog-error.jpg)
- [Desktop packing checks and utilization explanation](ux-phase1/desktop-packing.jpg)
- [Mobile packing with utilization explanation expanded](ux-phase1/mobile-packing.jpg)

Screenshots may show an existing sticky mobile bar/skip-link position during full-page capture. This phase did not redesign the shell. No document-level horizontal overflow was measured in the sampled final states.

Selected new text/background contrast pairs, calculated from CSS colors: error `#8a1d30/#fff4f5` 8.49:1, match `#18563a/#e6f3ec` 7.57:1, warning `#783f0d/#fff0de` 7.46:1, metric explanation `#ffffff/#152331` 15.95:1. These spot checks are not a full rendered contrast audit.

## Known limits and next review

- A description match is authoritative only after server review; changing a description deliberately hides old measurements. The backend still makes the final decision and can reject an analysis if the catalog changes concurrently.
- During catalog fetch failures, returned order measurements may be displayed but current availability/rotation can be unknown; the UI discloses this and saving retries the catalog request. No missing measurements are invented.
- Provisional catalog dimensions and box capacities remain provisional. The review includes a warning; it does not certify measurement accuracy.
- The seeded zero totals remain a baseline behavior. Full financial recalculation, source retention, confidence provenance, authentication and durable Render storage are outside this phase.
- Product cards increase vertical page length. Later phases can consider disclosure/density controls; no packing-critical fields are hidden behind the old horizontal table.
- Existing source illustration still includes OCR branding, despite text-only extraction. The original PDF viewer and source-card redesign remain separate approved tasks.
- Save/navigation coupling, direct box selection, advanced viewer controls, recommendation previews and broader dashboard action cleanup remain later phases.

**Stop for approval:** review this Phase 1 batch before beginning Phase 2 or publishing it to Render.
