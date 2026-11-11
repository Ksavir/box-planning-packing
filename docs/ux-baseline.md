# PackFlow UI/UX baseline — Phase 0

Date: 2 November 2026 (Europe/Malta). Source revision: `18f6014f80b9e4638c3c5d89969249e66594e630`.
Plan: [improvement.md](improvement.md). Scope: reconnaissance, existing checks, visual baseline and a prioritized implementation map. **No application code, domain logic, API contract or deployment was changed. Phase 1 is not started.**

## 1. Method and evidence limits

- Inspected frontend entrypoint, pages, components, types, API wrappers, styles and focus hook; inspected backend calculations, persistence, extraction and existing tests.
- Ran the repository's existing frontend checks and Python suite; results below are from this run, not historical results.
- Served the built frontend and FastAPI together on `127.0.0.1:8016` using `app.web:app`, an isolated temporary SQLite database and `PACKFLOW_SEED_REFERENCE_CATALOG=true`. The normal local database and public Render service were not used or modified.
- Used the three seeded orders, with PO-1048 as the visual reference. Opened its editor without submitting changes. Did not apply recommendations, save reviews, delete orders or generate reports during browser reconnaissance.
- Captured desktop at 1440 × 900 and mobile at 390 × 844 CSS pixels. Some screenshots are full-page and consequently taller than the viewport. Browser scrollbars can reduce the screenshot/content width. Restored the viewport override afterwards.
- Tested opening/closing the PDF modal and mobile menu; Escape closed the modal and restored focus to its opener on desktop and mobile.
- This is a targeted visual/source baseline, **not a WCAG conformance audit**. No screen-reader session, automated accessibility scanner, 200% zoom audit, device hardware test or exhaustive keyboard traversal was performed.
- Other widths, all import modes, processing failures, empty-state rendering and large-order performance remain future QA cases. Prior user screenshots are described by the improvement plan; this baseline supplies newly captured, reproducible equivalents rather than assuming those screenshots prove behavior.

## 2. Existing checks

| Check | Command from repository root | Result |
| --- | --- | --- |
| Frontend script named lint | `npm run lint --prefix frontend` | PASS, exit 0; executes `tsc -b --pretty false`. This is a TypeScript check, not ESLint. |
| Production build and typecheck | `npm run build --prefix frontend` | PASS, exit 0; executes `tsc -b && vite build`. Vite 6.4.5; 1962 modules transformed. |
| Backend regression suite | `cd backend` then `PYTHONPATH=. .venv/bin/python -m unittest discover -s tests -v` | PASS: 25 tests, 1.293 seconds on this machine. |
| Browser navigation/inspection | Open built app against isolated DB | PASS for inspected pages and modal/menu interactions. |

No baseline failure appeared in these checks. Passing checks do not resolve the UI/data issues documented below.

Frontend test runner, ESLint, frontend coverage reporting and accessibility automation are **not configured**. Do not report frontend unit/E2E tests as passing. Existing backend coverage includes packing geometry/weight, impossible items, selection objective, fixed-box filler, recommendation add/remove, extraction, product matching, reports, deletion, language and reference seeding. It does not establish complete browser, financial/export or physical-shipping correctness.

## 3. Architecture and boundaries

| Layer | Files | Responsibility and constraint |
| --- | --- | --- |
| Bootstrap | `frontend/src/main.tsx`, `App.tsx` | React 19 + TypeScript + Vite; `App` owns shared data, selection, dialogs and notices. |
| Navigation | `App.tsx`, `components/Shell.tsx`, `types.ts` | Conditional rendering via `Page` state (`dashboard`, `orders`, `catalog`, `order`), not URL routing. Refresh returns to Overview; no deep links/history for individual orders. |
| Shared shell | `components/Shell.tsx` | Desktop sidebar/workspace bar, mobile menu, skip link and persistent help. Multiple create-order CTA placements. |
| Overview | `pages/Dashboard.tsx` | KPIs, SVG line/area chart, efficiency radial, recent orders and continue-work card. |
| Intake | `components/UploadModal.tsx` | Portal dialog; PDF, pasted email and manual entry; own form state, file validation and loading/error state. |
| Review/results | `pages/OrderDetail.tsx` | Editable draft, review submission, analyze, results, box index, exports, suggestions, save-and-navigate. Highest concentration of responsibilities. |
| Visualization | `components/BoxVisual.tsx` | DOM/CSS projected floor layout, SKU-based colors, Z labels and legend; not a WebGL/interactive 3D engine. |
| Supporting pages | `pages/Orders.tsx`, `pages/Catalog.tsx` | Client-side search/status filtering, catalog imports and create forms. |
| Safety/accessibility | `components/DeleteOrdersDialog.tsx`, `hooks/useDialogFocus.ts` | Confirmation; focus trap, Escape, restoration and scroll locking. Mobile shell also uses `inert`. |
| Contracts | `api.ts`, `types.ts` | Same-origin fetch wrappers and structural TS interfaces; no runtime response validation/query cache/request cancellation. Several mutation payloads are typed only as `object`. |
| Styling | `styles.css` | Global custom CSS, shared class conventions and tokens; no Tailwind/CSS modules/component library. Multiple historical overrides and media-query groups make cascade ordering significant. |
| Backend | `backend/app/main.py`, `packing.py`, `database.py`, `extraction.py`, `reports.py` | Authoritative matching, validation, packing, totals, extraction, persistence and exports. Preserve these boundaries. |
| Production | `Dockerfile`, `backend/app/web.py`, `render.yaml` | Built assets mounted after API routes; one origin. New URL routes would require an explicit static-serving/history-fallback decision. |

Typography: Manrope for body and Plus Jakarta Sans for headings, loaded through a Google Fonts CSS import with local fallbacks. Key tokens include text `#152331`, muted `#536575`/`#607180`, cyan `#087e97`, orange `#b94b15`, green `#24734e` and red `#bd3045`. Shared patterns include `.button`, `.panel`, `.page-header`, `.status-pill`, `.form-error` and `.toast`. The final stylesheet overrides earlier declarations: inspect computed styles before editing a token or breakpoint.

## 4. Screen-to-component and screenshot map

All evidence below uses synthetic built-in demo orders, not uploaded customer documents.

| Plan screenshot | Actual screen/state | Desktop evidence | Mobile evidence |
| --- | --- | --- | --- |
| Overview | `Dashboard`, page `dashboard` | [Overview](ux-baseline/desktop-overview.jpg) | [Overview](ux-baseline/mobile-overview.jpg) |
| New Order modal | `UploadModal`, PDF mode | [New order](ux-baseline/desktop-new-order.jpg) | [New order](ux-baseline/mobile-new-order.jpg) |
| Order Review | `OrderDetail`, editing PO-1048 | [Review](ux-baseline/desktop-review.jpg) | [Review](ux-baseline/mobile-review.jpg) |
| Packing Results | `OrderDetail` + `BoxVisual`, first box | [Packing](ux-baseline/desktop-packing.jpg) | [Packing](ux-baseline/mobile-packing.jpg) |
| Remaining Space / Order Summary | Lower portion of the same results screen | [Results including recommendations](ux-baseline/desktop-recommendations.jpg) | [Recommendations](ux-baseline/mobile-recommendations.jpg) |

### Observed visual/interaction baseline

- **Overview:** repeats average utilization in prominent widgets, uses a line chart for three observations and offers multiple New order actions. There is no dedicated attention queue; bulk deletion is beside routine recent-order actions.
- **New order:** PDF/email/manual modes, file size/type copy and footer actions exist. The mobile PDF modal fits the sampled height, although the drop zone consumes substantial space. Do not classify the modal as unusable without testing shorter heights and longer modes.
- **Review:** metadata, financial totals and line items are visually separated within one long form, but dimensions, unit weight, permitted rotation and individual matching status are absent from review rows. The generic warning is not linked to specific inputs.
- **Review data inconsistency:** seeded PO-1048 shows zero subtotal/tax/total in the editor; line amounts displayed by the draft are 87 + 178 + 115 = 380. Results show USD 380 through a fallback calculation. This confirms a seeded-data/display discrepancy, not a proven failure of every uploaded order. No correction was made.
- **Mobile review:** the form is long; the 960px minimum-width line table needs horizontal scrolling to reveal price/date/amount/removal controls. Tax input is hidden by responsive CSS at narrow widths. The process rail also scrolls horizontally. These are internal overflow regions; their discoverability needs improvement.
- **Results:** packing and commercial KPIs are mixed. Only arrows select boxes. The legend exists, but stacked product labels overlap and there is no rotation/zoom/selection/fullscreen control. Verification badges are unconditional UI copy.
- **Recommendations:** current code exposes projected utilization and price, but not a specific target box, before/after preview or combined-addition feasibility. Success/info content sits alongside actionable recommendations.
- **Mobile results:** panels stack vertically; reaching the inspector and recommendations requires substantial scrolling. Source-document panel and some labels are hidden at responsive breakpoints.
- **Measured page widths:** at 390px viewport, Overview 390px, Packing 390px, Review 375px (scrollbar), PDF modal 390px. No document-level horizontal overflow was measured in these cases. Internal table/rail scrolling still exists. Desktop Packing: viewport 1440px, document width 1425px, inspector right edge 1393px (inside viewport).
- **Focus:** desktop/mobile modal Escape and opener restoration worked; mobile menu made navigation available and closed after selecting Overview. Full keyboard/screen-reader compliance remains unverified.

## 5. Domain definitions to preserve

### Geometry, objective and units

- Products are axis-aligned rectangular cuboids. Catalog dimensions and placement coordinates are centimeters; weights are kilograms. Free volume is serialized in liters (`cm³ / 1000`).
- The packing engine combines best-fit placement, three orderings and three cyclic guillotine partition orders, with a beam width of 16 for multi-box plan search. It is bounded and does not guarantee a mathematical optimum.
- Complete-plan cost is lexicographic: `(sum(box volumes), number of boxes)`. **Minimum unused volume takes precedence over minimum box count.** Do not relabel it as a minimum-package or minimum-shipping-cost guarantee.
- Placement checks dimensions, allowed axis permutations and gross weight including tare. Partitioning prevents overlaps by construction. `fragile` is carried in the model but does not implement support, stability or fragile-stacking constraints. The viewer does not independently validate geometry.
- Some imported product dimensions are provisional, including 10 × 10 × 10 cm where the reference lacks measurements. Imported reference boxes use a provisional 25kg maximum. A frontend validity check cannot establish that these estimates are real measured values.

### Utilization and dashboard scope — VERIFY-01

- Per box: `sum(product cuboid volumes) / box volume`.
- Per plan: `sum(packed product volumes) / sum(used box volumes)`; exposed as `average_utilization`, rounded to one decimal percent. Partial plans count only packed units in that ratio; inspect `status` and `unplaced` separately.
- Dashboard: arithmetic mean of latest available order-plan percentages, not a volume-weighted fleet average. Its order KPI includes all orders; its ready KPI counts `status == packed`; boxes/weight sum latest available plans.
- Illustrative distinction, not an executed test: boxes of 10L at 90% and 30L at 50% have 60% volume-weighted utilization, versus a 70% simple mean. UI labels/tooltips must distinguish the definitions without changing either formula.
- The 85% target and 70% low-fill thresholds are operational message thresholds, not packing feasibility tests or the optimizer objective. Dashboard chart/history scope is limited by the endpoint, while its KPI mean uses all available latest plans.

### Matching, validation and confidence

- Order descriptions are resolved by the backend against active catalog products, using exact/normalized matching and reference aliases/fuzzy rules. Unknown products block `_run_plan` with 422. Draft descriptions can change while existing `product_id` and dimensions still describe the old match.
- `OrderItem` responses already include matched product ID/name, dimensions and unit weight. They do **not** include per-line rotation/fragility flags; those are available in the product catalog. Any UI join must remain a provisional display until matching is authoritative.
- Required numeric bounds are enforced by Pydantic; review inputs are not a native validated form with a field-error summary. Manual intake has its own explicit checks. Do not infer that HTML `min` alone blocks the button handler.
- Confidence is an order-level extraction heuristic, not field-level OCR provenance or a calibrated accuracy guarantee. Review sets confidence to 1. The extractor reads PDF text; no scanned-document OCR implementation is present.

### Money and persistence — VERIFY-04

- `_line_amount` accepts a supplied nonzero amount; otherwise calculates quantity × price × (1 − discount/100), rounded to two decimals. Review similarly preserves supplied nonzero subtotal/total or computes fallbacks. `tax_label` is text; it is not a parsed tax calculator.
- Quantity/price/discount edits recalculate draft line amounts; subtotal/total inputs are separately editable. The combined terms/notes editor can merge the fields on edit. These behaviors need regression cases before a form refactor.
- Orders and calculated plans already persist before the explicit save button. Analyze inserts a new plan and marks the order `packed` or `attention`. The explicit save button creates/reuses a PDF report for the plan, then navigates home.
- Reviewing replaces order items, removes current plan records and marks the order `ready`; saved reports survive with a nullable old plan reference. Failed analysis after successful review is not one atomic client transaction.
- `needs_review`: imported/manual/email record awaiting review. `ready`: reviewed order, not necessarily a packing plan. `packed`: complete calculated plan. `attention`: partial calculation. Plan result status is separately `complete`/`partial`. Dashboard KPI `ready` actually counts packed orders. The UI uses inconsistent labels for these domain states.
- Fixed-box filler keeps original boxes/placements, tries up to 100 units per original product and returns up to four independent alternatives. Adding/removing suggested items updates totals and recalculates transactionally. It does not optimize a joint mixture of recommendations.
- SQLite stores orders, plans and PDF snapshots. Free Render instances have ephemeral local storage; the bundled reference catalog is re-seeded on startup, but user-created orders/reports are not durable across instance replacement. This phase did not deploy or change persistence.
- Original source PDF bytes are not retained for viewing; `source_filename` is metadata. Source viewing requires an explicitly approved storage/API extension. Excel and PDF exports are existing authoritative backend operations and must remain compatible.

## 6. API boundary map

| Workflow | Existing contract | Frontend owner |
| --- | --- | --- |
| Overview/catalog reads | `GET /api/dashboard`, `/orders`, `/catalog/products`, `/catalog/boxes` | `App`, `Dashboard`, `Orders`, `Catalog` |
| Intake | `POST /api/orders/upload` (multipart PDF), `/orders/email`, `/orders/manual` | `UploadModal` |
| Review/calculation | `GET/PATCH /api/orders/{id}`, `POST /api/orders/{id}/analyze` | `OrderDetail` |
| Recommendation changes | `POST /api/orders/{id}/suggested-items`, `DELETE /api/orders/{id}/suggested-items/{itemId}` | `OrderDetail` |
| Reports/exports | `POST /api/orders/{id}/reports`, `GET /api/orders/{id}/export`, `/export.pdf`; saved report list/download routes | `api.ts`, `OrderDetail` |
| Catalog changes | Create product/box and Excel import endpoints | `Catalog` |
| Destructive management | `DELETE /api/orders` with client confirmation | `App`, `DeleteOrdersDialog` |

## 7. Backlog coverage and prioritized change map

Status is baseline coverage of the plan's acceptance criteria, not a claim of full QA. Paths below are relative to `frontend/src/` unless explicitly prefixed otherwise.

| ID | Priority | Baseline | Primary files / next change |
| --- | --- | --- | --- |
| UX-01 | P1 | Missing | `pages/Dashboard.tsx`: attention queue, reduce redundant utilization. |
| UX-02 | P1 | Missing | `components/Shell.tsx`, page headers: one dominant create action. |
| UX-03 | P1 | Partial | `components/UploadModal.tsx`, `styles.css`: compact sizing, replace/remove affordance, visible footer at shorter heights. |
| UX-04 | P0 | Partial | `pages/OrderDetail.tsx`, `types.ts`, catalog reads: read-only packing measurements and honest match state before calculation. |
| UX-05 | P0 | Missing | `pages/OrderDetail.tsx`, `api.ts`: field errors, summary/focus links, blocking versus warning distinctions. |
| UX-06 | P1 | Partial | `components/BoxVisual.tsx`: existing colors/legend; incrementally add controls and accessible product details. |
| UX-07 | P1 | Missing | `pages/OrderDetail.tsx`: direct selection with box count/utilization. |
| UX-08 | P1 | Partial | `pages/OrderDetail.tsx`, API boundary: existing add/remove; preview/target-box details need backend-supported semantics. |
| UX-09 | P2 | Missing | `pages/OrderDetail.tsx`: split operational/commercial presentation. |
| UX-10 | P1 | Partial | `pages/OrderDetail.tsx`, `styles.css`: typed prioritization and truthful action affordances. |
| UX-11 | P2 | Missing | `pages/Dashboard.tsx`: adaptive chart for small series. |
| UX-12 | P1 | Partial | `pages/Orders.tsx`, `Dashboard.tsx`, `DeleteOrdersDialog.tsx`: keep search/filter/confirmation, add sorting, relocate bulk deletion. |
| UX-13 | P1 | Partial | `pages/Dashboard.tsx`, `Orders.tsx`, `OrderDetail.tsx`, `types.ts`: shared status presentation preserving backend values. |
| UX-14 | P1 | Missing | `pages/OrderDetail.tsx` and separately approved backend storage/API work; source card is decorative. |
| UX-15 | P1 | Missing | `pages/OrderDetail.tsx`: explain order-level confidence; field-level values require new provenance. |
| UX-16 | P2 | Partial | `components/Shell.tsx`: mobile menu exists; contextualize persistent help. |
| UX-17 | P1 | Partial/unverified | `styles.css`: measure rendered contrast before claiming compliance. |
| UX-18 | P1 | Partial | `styles.css`: normalize small operational labels and dense table typography. |
| UX-19 | P2 | Present in source | `pages/Dashboard.tsx`: first-order CTA exists; empty DB state not browser-tested in this phase. |
| UX-20 | P1 | Partial | `App.tsx`, `api.ts`, pages: preserve live-region feedback; handle Excel errors and success-styled failure notices. |
| UX-21 | P1 | Partial | `styles.css`, all screens: measured mobile pages do not globally overflow; horizontal review/rail affordances and hidden fields need review. |
| UX-22 | P1 | Partial | `UploadModal.tsx`, `OrderDetail.tsx`, `App.tsx`: spinners exist; truthful stages/recovery need definition. |
| VERIFY-01 | P0 | Source verified, regression pending | `backend/app/packing.py`, `main.py`: different plan/dashboard formulas; preserve and explain. |
| VERIFY-02 | P0 | Source verified | `BoxVisual.tsx`, `OrderDetail.tsx`: unconditional verification labels overstate what UI checks. |
| VERIFY-03 | P1 | Limited capability confirmed | `backend/app/packing.py`, `OrderDetail.tsx`: consolidation is advice; no executable alternative-plan comparison. |
| VERIFY-04 | P1 | Partially covered | `backend/tests/`, `OrderDetail.tsx`, `reports.py`: existing tests pass; seeded totals/draft refresh/export parity need expanded cases. |

## 8. Proposed next approval: Phase 1 only

1. Add read-only dimensions/unit weight and match/missing-data indicators to review rows using real response/catalog fields. Never manufacture missing measurements. Do not add per-order editing of catalog dimensions.
2. Add explicit local field validation and an accessible error summary linked to inputs. Maintain backend authority and existing numeric/business rules. A changed description must not retain a visually confirmed stale match.
3. Explain current utilization and verification semantics without changing formulas or implementing shipping constraints.
4. Establish regression cases for draft preservation, seeded versus imported totals, changed descriptions, unavailable/inactive products and API error mapping. Select/approve a minimal frontend test setup because none exists today.
5. Extend backend regression tests where needed to lock existing calculation/export contracts, with separate authorization for any actual defect correction that changes results.

Gate: user can inspect available packing data and understand actionable blocking errors; existing math, extraction, matching, recommendation feasibility, persisted data and exports retain their behavior. Stop for review after that batch.

## 9. Technical risks and unresolved decisions

- Introducing URL routes requires production static-serving changes; do not migrate navigation merely to implement the first batch.
- Extracting components can alter hook lifecycles: `OrderDetail` resets draft and box index on every new order prop. Refreshing must not silently lose edits or selection.
- A frontend-only catalog join cannot guarantee the backend's alias/fuzzy match after a description edit. Decide whether authoritative validation needs a separate approved endpoint; otherwise label unconfirmed state honestly.
- Existing order/product types omit some backend fields and use nullable values less precisely than runtime responses. Narrow types carefully without changing JSON contracts.
- Review is a PATCH followed by POST analyze. Partial failure can leave the review saved and plan invalidated. Feedback must distinguish this from complete rollback.
- Amount/subtotal/total fallbacks and zero-versus-missing prices have business meaning. Do not introduce automatic tax interpretation or overwrite supplied totals during visual cleanup.
- Larger recommendation previews must not sum independent alternatives or enlarge original boxes. New preview contracts need approval.
- API errors can contain structured Pydantic details; the generic fetch wrapper assumes a string. Future field error mapping must handle both without losing useful messages.
- CSS cascade overrides, global selectors and column-order/nth-child rules can regress tables and modals when adding fields. Audit each affected breakpoint.
- Viewer controls may require a new rendering approach. Start small and preserve authoritative placements; avoid implying physical stability or shipping safety.
- Confidence becomes 100% after review and has no field provenance. Do not fabricate low-confidence fields.
- The source panel says OCR despite text-only extraction. Original PDF viewing, OCR, stable database storage and authentication are separate backend/infrastructure work.
- No real-user completion timings/correction counts were measured. No global accessibility or export-parity certification is claimed by this phase.

## 10. Measurement plan for later phases

| Success metric | Phase 0 baseline / next measurement |
| --- | --- |
| Import → validated packing time | Not timed; establish comparable synthetic PDF/email/manual tasks before/after workflow changes. |
| Clicks and corrections per order | Not quantified; record the same fixture tasks rather than estimating from screenshots. |
| Invalid data caught before calculation | No linked inline summary exists; add explicit valid/invalid fixtures for Phase 1. |
| Completion without assistance | Requires user sessions; not inferable from developer smoke tests. |
| Contents/utilization comprehension | Baseline has legend and arrow navigation; measure direct box selection and product inspection tasks after changes. |

Reproduce visual evidence: run the existing frontend build, start `app.web:app` against a fresh temporary DB with the reference seed enabled, use the stated viewports, inspect Overview → New order → Escape → PO-1048 → Edit details → Cancel editing. Scroll to recommendations. Do not submit edits to preserve comparable fixtures. The ephemeral local server is stopped after capture; this phase does not publish changes.

**Review checkpoint:** Phase 0 documentation and screenshots complete. Approval is required before Phase 1 implementation, new test dependencies or deployment.
