# Phase 5 — responsive and accessibility review

Date: 2 November 2026. Local implementation; no deployment, commit or merge.

The implementation plan in `docs/improvement.md` defines phases 0–5 only. The user also requested phases 6–8; clarification of their scope is pending. They have not been invented or treated as the separately numbered guide steps.

## Changes

- `frontend/src/hooks/useDialogFocus.ts`: background `inert` isolation, focus containment, summary/tabindex support, panel fallback while controls are disabled, Escape handling and opener restoration. Ancestor isolation supports the expanded packing viewer. Previously inert content is restored correctly. Mobile navigation retains its existing React-controlled isolation.
- `frontend/src/components/Shell.tsx`: mobile navigation dialog semantics; decorative scrim and separators excluded from accessibility navigation; skip link isolated while the menu is open.
- `frontend/src/App.tsx`: focus the new page heading on navigation, avoiding unrelated refreshes; announce workspace/order loading.
- `frontend/src/components/UploadModal.tsx`: focus errors, associate manual/email fields with error/help text, expose required/invalid states and ignore file drops during processing. Existing validation and order payload rules remain unchanged.
- `frontend/src/pages/OrderDetail.tsx`: move focus to Packing performance after calculation, addition or removal, including when the previously focused action disappears. Failed addition confirmation also produces an accessible error notice.
- `frontend/src/pages/Orders.tsx`, `pages/Catalog.tsx`, `components/BoxVisual.tsx`: named keyboard-focusable regions for internal scrolling.
- `frontend/src/components/DeleteOrdersDialog.tsx`, `components/RecommendationPreview.tsx`, `pages/Catalog.tsx`: decorative modal backdrops removed from sequential/accessibility navigation while keeping pointer dismissal.
- `frontend/src/styles.css`: strong focus outlines override rules that removed them; mobile input size, touch targets, short-height modal layout, wrapping, reduced motion and sticky catalog footer. The upload target retains its minimum height instead of shrinking and clipping its instructions.
- `frontend/tests/accessibility.test.mjs`: eight contrast regression tests for normal text colors and input placeholder color.

## Contrast correction

The previous cyan `#087e97` was 4.40:1 on the workspace background `#f5f7f9`, below the 4.5:1 target for small text. The new `#08778e` reaches 4.84:1 there and 4.68:1 on the light blue panel `#eaf5f8`. Seven semantic text tokens are checked against four actual light backgrounds. Brand marks, decorative graphics and disabled controls are excluded from these normal-text tests.

A DOM-based spot check of visible text found no remaining normal-text contrast failures on the tested overview, order list, product catalog, results or preview screens after this correction. This spot check is not a complete automated WCAG audit: it does not model every alpha-composited or image background.

## Browser verification

Used an isolated temporary SQLite database on localhost and a synthetic order `QA-A11Y-5`. No customer files or production data were submitted or deleted.

| Check | Result |
| --- | --- |
| Desktop 1366×900 | New order opens with Enter; focus starts inside; Shift+Tab wraps to Cancel; Escape restores New order. |
| 320×640 mobile | Menu opens/closes with keyboard and restores Open menu; main content is isolated. Upload footer stays visible and PDF instructions are no longer clipped. |
| 320×640 order flow | Create synthetic manual order; heading receives focus; zero quantity blocks calculation; summary link focuses the invalid quantity and its description exists; correction allows packing. |
| 320×640 results | Expand viewer isolates background; Escape returns to Expand viewer. Preview supports keyboard Apply; addition/removal return focus to Packing performance after the source action disappears. Save stays on the plan. |
| 320×640 orders | Document width is 320 px; Orders list can receive keyboard focus for internal scrolling. Delete confirmation was opened and canceled with Escape; focus returned to Delete all orders. No deletion executed. |
| 768×1024 tablet | Product catalog fits the page width; labels and controls present; no document horizontal overflow. |
| 683×450 reflow | Equivalent CSS viewport to a 1366×900 window at 200% page zoom; results and catalog form fit; form footer accessible; native required-field validation focuses Name; Escape restores Add product. |
| Accessibility semantics | Native accessibility tree and DOM labels checked: only dialog/menu content exposed while modal; field error associations, named controls, loading status and recovery notices present. |

Evidence: `docs/ux-phase5/01-preview-320.png` and `02-upload-320.png`.

## Automated checks

- `npm run build --prefix frontend`: PASS, including TypeScript compilation.
- `npm run lint --prefix frontend`: PASS; this repository uses TypeScript checking for lint.
- `npm test --prefix frontend`: 28 tests passing (20 prior + 8 contrast checks).
- `PYTHONPATH=backend backend/.venv/bin/python -m unittest discover -s backend/tests -q`: 33 tests passing.
- `git diff --check`: PASS.

No backend implementation, packing algorithm, extraction, utilization calculation, pricing rule or export implementation was changed in this phase. Existing local Phase 1–4 changes were retained.

## Acceptance and limits

UX-21 and keyboard/focus issues found in the tested core journey have been addressed. No critical keyboard or responsive blocker remains in the exercised scenarios. The contrast issue found in UX-17 is corrected and guarded by tests.

Native VoiceOver/NVDA speech output, real browser zoom at 200%, operating-system text enlargement, and cross-browser embedded PDF rendering still require manual verification. The 683×450 check validates equivalent reflow only; it is not claimed as a real browser zoom test. Reduced-motion rules were reviewed in code; OS preference switching was not exercised. This work is not a blanket WCAG compliance certification.

Phases 6–8 remain undefined in the supplied plan. No Render publication or merge was performed.
