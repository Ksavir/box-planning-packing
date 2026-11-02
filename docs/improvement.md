# PackFlow — UI/UX Improvement Plan

> **Purpose:** Actionable UI/UX improvement backlog and a safe, step-by-step implementation guide for Codex.
>
> **Evidence:** Five screenshots supplied on 2 November 2026: Overview, New Order modal, Order Review, Packing Results, and Remaining Space / Order Summary. This is a visual audit, **not** a functional or accessibility test. Validate assumptions in the code before making changes.

## 1. Goals and guardrails

**Primary goal:** Help warehouse/operations staff go from a purchase order to a verified packing plan with minimal confusion and effort.

**Success criteria (measure before and after):**
- Time to import, validate, and generate a packing plan.
- Number of clicks and corrections per order.
- Rate of incomplete or invalid product data caught before calculation.
- Task completion rate without assistance.
- Ability to identify the contents and utilization of each box quickly.

**Implementation guardrails:**
- Preserve existing extraction, order calculations, packing algorithms, data contracts, and exports unless a task explicitly requires changing them.
- Use the project's existing stack, components, design tokens, routing, and test conventions; do not assume React/Tailwind without checking.
- Make small changes with tests, screenshots, and a review checkpoint after each phase.
- Preserve accessibility: semantic labels, keyboard navigation, focus states, contrast, and screen-reader feedback.
- Keep copy in English, matching the current UI, unless localization is already supported.
- Do not silently change business definitions, especially utilization, geometry verification, weight constraints, and monetary totals.

## 2. Prioritized backlog

Legend: **P0** = core workflow and correctness; **P1** = high-impact usability; **P2** = polish and optional enhancements. Effort: S/M/L (relative, validate against codebase).

| ID | Priority | Area | Improvement | Effort | Acceptance criteria |
|---|---|---|---|---|---|
| UX-01 | P1 | Dashboard | Simplify overview: remove redundant utilization displays, emphasize orders requiring attention, retain meaningful KPIs. | M | Primary action and pending work are clear above the fold; no unnecessary duplicate metric. |
| UX-02 | P1 | Global actions | Remove duplicate **New order** CTA and standardize primary/secondary action placement and styling. | S | One dominant create-order action per screen; consistent action hierarchy. |
| UX-03 | P1 | New order | Reduce oversized modal/drop zone and tab-card whitespace; evaluate dedicated route for long multi-step flow. | M | Upload, input choice, progress and CTA remain visible at typical laptop height. |
| UX-04 | P0 | Order review | Separate **Order information** from **Products to pack**; expose dimensions, unit weight, quantity, and match status. | M | Users can inspect packing-critical data before calculation. |
| UX-05 | P0 | Validation | Replace generic “Check descriptions, quantities and units” / “Manual review” with item-level actionable warnings, counts, and focus links. | M | Invalid fields are identified; blocking errors prevent calculation; warnings are distinct. |
| UX-06 | P1 | Packing viewer | Add discoverable rotate/zoom/reset controls, product selection details, legend, labels toggle, and fullscreen; assess top/layer views. | L | User can inspect placements and understand each product without relying on tiny labels. |
| UX-07 | P1 | Boxes | Replace arrows-only navigation with selectable box tabs/cards showing box number, utilization, and unit count. | M | Any box can be selected directly; selected state and 3D/stats stay synchronized. |
| UX-08 | P1 | Remaining space | Rename to **Optimize unused space**; show current → projected utilization, target box, units, added value, preview and undo. | M | Users know the exact consequence before applying a suggestion. |
| UX-09 | P2 | Results | Group **Packing performance** separately from **Order information**. | S | Operational metrics and commercial metrics are visually distinct. |
| UX-10 | P1 | Insights | Distinguish warnings, suggestions, and success notices; place actionable issues first; provide relevant action buttons. | M | Low-utilization notice has a meaningful next step; success notice is not mistaken for a task. |
| UX-11 | P2 | Charts | Use bars for very few orders; direct labels and 85% target; switch to trends when enough history exists. | M | Two-order chart is legible and more informative than a nearly flat line. |
| UX-12 | P1 | Orders table | Add search, sorting, status filters, accessible row navigation and safe contextual actions; relocate **Delete all orders**. | M | Users can find orders; bulk deletion is not adjacent to routine navigation and requires confirmation. |
| UX-13 | P1 | Status copy | Standardize **Imported**, **Needs review**, **Validated**, **Packing ready**, **Ready** as appropriate to real domain states. | S | Same lifecycle state uses consistent language across screens. |
| UX-14 | P1 | Source PDF | Provide **View original PDF**, preferably side-by-side with extracted fields; optional source-page references. | M | User can verify extraction without losing review context. |
| UX-15 | P1 | OCR confidence | Explain confidence score and show low-confidence fields; do not imply it guarantees accuracy. | M | Users know what 99–100% means and which fields require checking. |
| UX-16 | P2 | Sidebar | Collapse persistent **From order to box** help into contextual assistance; optional collapsible navigation. | S | Guidance is available without consuming permanent screen space. |
| UX-17 | P1 | Colors | Improve small-text contrast; consistent semantic usage of blue, orange, green, with icons/text in addition to color. | S | Key labels, warnings and statuses meet WCAG contrast targets where applicable. |
| UX-18 | P1 | Typography | Normalize type scale, minimum operational text size, spacing, and table density. | S | Labels and tabular data remain readable at common desktop sizes. |
| UX-19 | P2 | Empty states | Provide helpful zero-order screen with **Create first order**. | S | First-time user sees a clear next action. |
| UX-20 | P1 | Feedback | Add success/error notifications for save, export, calculation and adding products. | S | Every consequential action provides accessible confirmation or error feedback. |
| UX-21 | P1 | Responsive | Test and improve modal, forms, tables, sidebar, viewer at tablet/mobile widths. | M | No horizontal page overflow or inaccessible action controls at supported breakpoints. |
| UX-22 | P1 | Processing | Show meaningful extraction/matching/optimization/loading stages, without fake progress percentages. | M | User knows what is happening and can recover from failure. |

### 2.1 Additional verification tasks (do not treat as proven defects)

| ID | Priority | Verify | Acceptance criteria |
|---|---|---|---|
| VERIFY-01 | P0 | **Global utilization formula**: clarify whether volume-weighted total or simple mean; screenshots show 87.3% global and 96% for Box 01, which may be valid. | Calculation and tooltip agree; regression test uses known box volumes. |
| VERIFY-02 | P0 | **Geometry vs shipping feasibility**: “No overlaps” and “Geometry verified” do not automatically prove weight, orientation, fragility, spacing, or transport constraints. | UI explicitly states checks actually performed; no unsupported guarantees. |
| VERIFY-03 | P1 | **Consolidation suggestion**: check whether the engine can actually propose a better arrangement. | Suggestion only offers executable actions when feasible; otherwise explains limitation. |
| VERIFY-04 | P1 | **Order data integrity**: check that editing products, adding suggested units and recalculating updates totals, box contents and exports consistently. | Tests cover recalculation, persistence and exports. |

## 3. Screen-by-screen design specifications

### A. Overview
1. Show a concise page title and one prominent **New order** action (choose header or sidebar, not both).
2. Keep KPI cards for average utilization, orders analyzed, boxes assigned, planned weight; make their time scope clear.
3. Add an **Orders requiring attention** section above analytics when there are pending items.
4. For only a handful of orders, prefer compact bar comparison to the wide line chart; preserve 85% target labeling.
5. Make recent orders searchable/sortable; move destructive bulk actions into a clearly separated admin area.
6. Avoid repeating the same 89.5% efficiency figure in multiple prominent widgets without added meaning.

### B. New Order
1. Keep the three import modes: **From PDF**, **From email**, **Manual entry**.
2. Reduce the upload target's vertical footprint while keeping it obviously clickable and drag-and-droppable.
3. Keep file types and max size visible (currently PDF / 15 MB); verify actual supported types before changing copy.
4. Provide selected-file name, replace/remove action, file-validation errors and accessible upload progress.
5. Preserve the existing 3-step progress indicator; use clear completed/current/upcoming states.
6. Keep the primary action anchored in the visible footer. If the flow becomes lengthy, use a dedicated route instead of a modal.

### C. Review Order
1. Split commercial metadata from the product packing table, optionally via collapsible sections.
2. Add packing-relevant fields: length × width × height, unit weight, orientation rules where supported, and product match status.
3. Mark missing catalog dimensions and low-confidence OCR values in-line; provide a summary with links to fields.
4. Keep **Save draft** distinct from **Validate and calculate**; block only on real blocking errors.
5. Add **View original PDF** with side-by-side comparison when feasible.
6. Clarify if extracted order value includes tax/discount and maintain arithmetic consistency.

### D. Packing Results
1. Make **Box 01 / 02** selectable via compact tabs/cards, with utilization and item counts.
2. Show viewer toolbar: rotate, zoom, reset, fullscreen, layers/top view if implemented.
3. Color-code product types; add legend and accessible selected-product detail panel.
4. Explain utilization calculation in a tooltip and clarify what **Geometry verified** actually checks.
5. Group logistical KPIs apart from order value and customer data.
6. Separate **Save packing plan** from **Back to overview**; do not couple saving with navigation.
7. Preserve existing Excel/PDF exports and test that displayed data matches exported values.

### E. Optimize Unused Space / Order Summary
1. Rename the section to **Optimize unused space**.
2. Each recommendation must specify box, item, number of units, current → estimated utilization, and commercial impact.
3. Offer **Preview addition** before **Apply**; confirm changes and provide undo where technically feasible.
4. Separate actionable consolidation warnings from positive status messages.
5. If a box is below 70% utilization, show a path to compare alternative packing only if supported by the engine.

## 4. Recommended implementation phases

### Phase 0 — Repository reconnaissance and baseline
- Identify framework, routing, state management, API boundaries, components, design tokens, and test tooling.
- Run current tests, typecheck, lint, and build; record existing failures before changing code.
- Map each screenshot to its actual route/component.
- Capture current desktop and mobile screenshots and note layout problems.
- Document domain definitions for utilization, item dimensions, unit weights, statuses, and plan persistence.
- **Deliverable:** `docs/ux-baseline.md` (or equivalent) with findings and a prioritized change map.

### Phase 1 — Core workflow safety (P0)
- Implement UX-04 and UX-05 (packing-critical fields and field-level validation).
- Investigate VERIFY-01, VERIFY-02, VERIFY-04.
- Add tests for validation, formulas, and no-regression of packing/export behavior.
- **Gate:** Invalid product data is caught before calculation; core math and exports unchanged unless corrected with tests.

### Phase 2 — Quick usability wins
- Implement UX-02, UX-03, UX-13, UX-17, UX-18, UX-20.
- Review keyboard focus and small-screen modal behavior.
- **Gate:** Primary actions are consistent; new-order flow is compact and clear.

### Phase 3 — Packing result comprehension
- Implement UX-07, UX-08, UX-09, UX-10 and UX-15.
- Implement UX-06 incrementally: first legend/controls, then product selection, then advanced modes.
- Investigate VERIFY-03.
- **Gate:** User can choose a box, interpret utilization, and preview an addition before applying.

### Phase 4 — Overview and supporting workflows
- Implement UX-01, UX-11, UX-12, UX-14, UX-16, UX-19, UX-22.
- **Gate:** Dashboard prioritizes pending work and provides safe order management.

### Phase 5 — Responsive and accessibility pass
- Complete UX-21 and audit all new components.
- Test keyboard-only flows, screen-reader labels, focus restoration after modal close, form errors, contrast, zoom at 200%, and supported mobile widths.
- **Gate:** No critical keyboard or responsive blockers in core order-to-packing journey.

## 5. Step-by-step guide: use this file with Codex

### Step 1 — Place the file in the project
Copy `improvement.md` to the **root** of the PackFlow repository, beside the project README and package manifest.

### Step 2 — Open the repository in Codex
Start Codex in the PackFlow repository (IDE extension, Codex app, or CLI). Make sure it can read `improvement.md` and the source tree. Create a new branch, for example `feat/ux-improvements`.

### Step 3 — Ask for inspection first (no edits)
Paste this prompt:

```text
Read improvement.md completely. Inspect this repository and map each UX-xx and VERIFY-xx item to the relevant existing routes, components, state, API contracts and tests.
Do NOT modify files yet.
1. Identify the framework, styling system, test commands and architectural constraints.
2. Separate screenshot-confirmed UI observations from assumptions requiring verification.
3. Propose an implementation plan for Phase 0 and Phase 1 with exact file paths, dependencies, risks and acceptance criteria.
4. Flag any task that would alter packing logic, OCR, persistence, pricing or export contracts.
Wait for my approval before coding.
```

### Step 4 — Establish a baseline
After reviewing the plan, paste:

```text
Execute Phase 0 from improvement.md. Run existing lint, typecheck, tests and build (only commands supported by this repository). Record baseline failures without disguising them. Map screenshots to components and document findings in docs/ux-baseline.md. Do not change business logic. Summarize findings and stop for review.
```

### Step 5 — Implement one small batch at a time
Use a separate Codex request for each coherent batch. Start with:

```text
Implement UX-04 and UX-05 from improvement.md, using the existing design system. First inspect current product data models and validation behavior. Display packing-critical fields only when supported by real data; show missing values clearly instead of inventing defaults. Add field-level errors and an accessible summary linking to affected inputs. Preserve API contracts and calculation behavior. Add or update tests. Run relevant checks and report files changed, behavior changed, screenshots or UI checks, and any unresolved risks. Stop after this batch.
```

Then continue with batches such as:
- **Batch B:** UX-02, UX-03, UX-13 (actions, modal, status copy).
- **Batch C:** UX-07, UX-09, UX-15 (box navigation and results clarity).
- **Batch D:** UX-08, UX-10, VERIFY-03 (recommendations and safe preview).
- **Batch E:** UX-06 (viewer, broken into small sub-tasks).
- **Batch F:** UX-01, UX-11, UX-12 (dashboard and order table).
- **Batch G:** UX-14, UX-16, UX-19, UX-20, UX-22 (supporting experience).
- **Batch H:** UX-17, UX-18, UX-21 (contrast, typography, responsive/a11y).

### Step 6 — Require a review after every batch
Use this reusable prompt:

```text
Review the latest batch against improvement.md acceptance criteria. Show a checklist with PASS / PARTIAL / FAIL for each targeted UX item. Run relevant tests, typecheck, lint and build. Check for unintended changes to packing algorithms, utilization calculations, OCR extraction, order totals, persistence and exports. Identify regressions, provide manual QA steps, and stop for my approval before the next batch.
```

### Step 7 — Test the actual user journey
Manual smoke test after each major phase:
1. Open Overview and create a new order.
2. Upload a valid PDF; verify file and processing feedback.
3. Review extracted order details and packing-critical product fields.
4. Deliberately clear one required dimension and confirm the error is specific and calculation is blocked.
5. Correct it, validate and calculate.
6. Navigate directly between boxes and verify viewer, contents and utilization update together.
7. Preview a suggested addition; apply or cancel and verify quantities, value, plan and export consistency.
8. Save the plan, navigate away and reopen it.
9. Export PDF/Excel and compare with the displayed plan.
10. Repeat key tasks at desktop and narrow viewport widths using keyboard navigation.

### Step 8 — Merge only after acceptance
For each batch, request a short summary of code changes, tests, known limitations, and screenshots. Review the diff, commit the approved batch, and proceed to the next. Avoid asking Codex to implement the entire backlog in one pass.

## 6. Definition of Done (every task)

- [ ] Acceptance criteria for the selected UX item are met.
- [ ] Existing domain calculations and data contracts are preserved or intentionally changed with documented tests.
- [ ] Loading, empty, success and error states are covered where relevant.
- [ ] Keyboard, focus, labels and contrast are checked.
- [ ] Desktop and narrow-screen layouts are checked.
- [ ] Tests/typecheck/lint/build are run where available; pre-existing failures are identified separately.
- [ ] Codex provides a file-by-file change summary and manual verification steps.
- [ ] User reviews and approves before the next batch.

## 7. Suggested task tracking

Track each `UX-xx` and `VERIFY-xx` as a GitHub issue or project task with fields: **Status** (Todo / In progress / Review / Done), **Owner**, **Priority**, **Effort**, **Acceptance criteria**, **PR**, and **QA evidence**.

## 8. Notes and limits

- The screenshots demonstrate visual layout and labels, not whether controls already work; verify features before rebuilding them.
- “Maximize utilization” is not necessarily the same as “minimize box count”; preserve the algorithm's true optimization objective and explain it accurately.
- Do not show fake extraction progress, unsupported shipping-safety assurances, or inaccurate confidence guarantees.
- Prioritize correct packing data and explainable results over cosmetic changes.
