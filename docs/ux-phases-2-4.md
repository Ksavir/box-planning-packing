# Phases 2, 3 and 4 — implementation and review

Date: 2 November 2026. Scope authorized together by the user. Local implementation only; no Render deployment, commit or push. Phase 1 changes already in the working tree were preserved.

## Acceptance review

| Item | Status | Result |
| --- | --- | --- |
| UX-02 | PASS | Workspace header is the main New order action; mobile uses its existing bar. Duplicate sidebar creation action removed. |
| UX-03 | PASS | Compact PDF drop zone, visible footer, replace/remove selected file, existing three input modes retained. Long manual input scrolls within the modal. |
| UX-13 | PASS | Shared labels for actual states: Needs review, Validated, Packing ready, Needs attention. Process rail distinguishes validated details from a calculated plan. |
| UX-17 | PARTIAL | Semantic text, readable status labels, darker attention color and focus outlines added. Full contrast and screen-reader audit remains Phase 5; no blanket WCAG claim. |
| UX-18 | PASS | Normalized operational labels, table text, status size, viewer controls and spacing using existing tokens. Tiny placement labels have a separate readable unit inspector. |
| UX-20 | PASS | Accessible success/error notices for save, calculation, exports, catalog import and product changes; error notices persist longer. Saving a plan stays on the results page; Back to overview is separate. |
| UX-06 | PASS (incremental scope) | Rotate, zoom, reset, top/perspective projection, height slices, labels, product highlight, selected-unit details and expanded viewer with Escape/focus restoration. This is the existing projected layout, not a new physical simulation. |
| UX-07 | PASS | Direct box buttons show code, utilization and units; selected box updates viewer, contents and statistics together. |
| UX-08 | PASS | Optimize unused space provides engine-calculated preview, affected boxes, quantities, utilization, product value and resulting commercial total. Apply checks the current plan ID. Undo removes only the last added quantity, including when merged into an earlier suggested line. |
| UX-09 | PASS | Packing performance and commercial Order information are separate groups. |
| UX-10 / VERIFY-03 | PASS | Actionable warning types sort before success; low-utilization copy explains that automatic alternative-layout comparison is unavailable. No invented consolidation action. |
| UX-15 | PARTIAL | Confidence explanation accurately describes the order-level heuristic and manual-review 100%. Field-level scores/provenance do not exist in extraction; none were fabricated. Existing item-level checks remain available. |
| UX-01 | PASS | Pending work appears above analytics; duplicate utilization/action panels removed; KPI scope stated. |
| UX-11 | PASS | Up to five calculated orders use direct-labeled bars with the 85% target; larger histories retain the existing trend chart. Uncalculated orders are excluded from the chart and shown as a dash in lists. KPI formulas unchanged. |
| UX-12 | PASS | Existing search and semantic row buttons retained; exact status filters and sorting added. Bulk deletion moved into collapsed Order history management; existing confirmation retained. |
| UX-14 | PARTIAL (browser limitation) | New uploads retain the original bytes and expose View original PDF alongside review, open-in-new-tab and download fallbacks. API and retention verified. The test browser showed a blank native PDF iframe, so embedded rendering is not certified across browsers. Old uploads cannot be recovered retroactively. |
| UX-16 | PASS | Persistent sidebar instructions collapsed into How to plan an order. |
| UX-19 | PASS | Empty dashboard/order/chart states explain the next action; existing Create first order entry retained. |
| UX-22 | PASS | Actual uploading/extraction, saving/matching, calculation, preview and PDF-saving operations have meaningful feedback. No fabricated percentages or server-stage telemetry. |

## Changes by file

- `frontend/src/components/Shell.tsx`: action hierarchy and collapsible help.
- `frontend/src/components/UploadModal.tsx`: compact file selection, replace/remove and actual operation feedback.
- `frontend/src/workflow.ts`: pure shared lifecycle copy, sorting and insight priority; preview response type.
- `frontend/src/components/BoxVisual.tsx`: display-only inspection tools; no placement changes.
- `frontend/src/components/RecommendationPreview.tsx`: accessible confirmation dialog for a computed addition and its commercial impact.
- `frontend/src/components/SourceDocument.tsx`: source retrieval, object-URL lifecycle, side-by-side iframe and native-viewer fallbacks.
- `frontend/src/pages/OrderDetail.tsx`: box navigation, preview/apply/undo, separated metrics, confidence explanation and separate save/navigation.
- `frontend/src/pages/Dashboard.tsx`: attention queue, compact bars and removal of redundant panels.
- `frontend/src/pages/Orders.tsx`: exact filters, sorting and separated bulk maintenance.
- `frontend/src/App.tsx`, `pages/Catalog.tsx`: feedback timing, error semantics and navigation refresh.
- `frontend/src/api.ts`, `types.ts`: additive source/preview requests and optional expected plan/undo quantity fields.
- `frontend/src/styles.css`: existing design-system extensions, compact layouts, readable labels and viewer/modal controls.
- `backend/app/database.py`: additive `source_documents` table, keyed to order with cascading deletion.
- `backend/app/main.py`: source retention/retrieval; preview using SAVEPOINT + the same append/recalculate path as Apply; optional stale-plan guard and partial-quantity removal.
- `backend/tests/test_ux_contracts.py`, `frontend/tests/review.test.mjs`: regression coverage added to the Phase 1 suites.

## Verification

- `npm run build --prefix frontend`: PASS (includes TypeScript compilation).
- `npm run lint --prefix frontend`: PASS (repository lint command is TypeScript checking).
- `npm test --prefix frontend`: 20 passing tests.
- `PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -s backend/tests -q`: 33 passing tests.
- `git diff --check`: PASS.
- `backend/app/packing.py` has no diff. Packing search, orientation/weight constraints, utilization formulas, extraction and export implementation are unchanged.
- Tests cover preview rollback, equality with Apply, repeated merged additions, partial undo, stale plan rejection, impossible additions, original-source byte retention/deletion, weighted utilization, dashboard mean, supplied totals and Excel/PDF summaries.

Browser QA used an isolated temporary SQLite database on localhost, existing seeded sample orders and the synthetic PDF fixture. No customer PDF was uploaded to a public service.

Verified desktop at 1366×900 and narrow viewport at 390×844: direct box switching, rotate/zoom, unit inspector, expanded viewer and Escape, preview/apply/undo, save without navigation, three new-order modes, selected-file controls, source retrieval, attention queue, exact filters and sorting. Measured mobile document width did not exceed viewport in results, review and orders. The order table retains internal horizontal scrolling. Broader tablet/200% zoom/keyboard-only/screen-reader coverage belongs to Phase 5.

Evidence in `docs/ux-phases-2-4/`: viewer, addition preview, mobile upload, source panel, filtered orders, and final overview. Earlier evidence captures precede the last copy/fallback refinements.

## Known limits and review notes

1. Legacy seeded sample orders have zero stored line amounts despite nonzero unit prices. The pre-existing addition rule recomputes commercial totals as sum(line amount) + stored tax; the UI previously falls back to quantity × price for zero totals. The preview now exposes both the displayed current total and actual projected total and warns when their difference does not equal the added value. No financial formula or legacy data was rewritten.
2. Source PDFs increase SQLite size (existing upload limit remains 15 MB). They inherit the application's existing access model and database persistence; this is not a new durable storage service. Render free-instance storage limitations remain unchanged.
3. Preview performs a real synchronous packing calculation in a rolled-back transaction. Large orders can take time and briefly hold a SQLite write lock. No unbounded search or new optimization dependency was introduced.
4. Plan-ID checks protect against applying an outdated plan. Catalog edits in another session still require recalculating/reviewing the order; there is no new catalog revision system.
5. Confidence does not identify low-confidence fields because that metadata does not exist. Native PDF rendering depends on browser support; open/download remains available.
6. Phase 5 is pending. No production deployment was performed; review these changes before continuing.
