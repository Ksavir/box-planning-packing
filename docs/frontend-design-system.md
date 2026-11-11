# PackFlow workspace design

The frontend follows the supplied packing dashboard reference: warm white canvas, white rounded cards, neutral navigation, a charcoal packing preview, and functional status colors. All interface copy remains English; product and customer data is preserved.

## UI stack

- Tailwind CSS 4, compiled by `@tailwindcss/vite`.
- Official shadcn registry components in `frontend/src/components/ui`: Button, Card, Input, Badge, and Chart (Recharts).
- Official Bklit Gauge and its dependencies in `frontend/src/components/charts`, installed from https://bklit.com/r/gauge-chart.json through the shadcn CLI. Documentation: https://bklit.com/docs/components/gauge-chart.
- `frontend/components.json` configures aliases and the Bklit registry for future additions.
- `theme.css` imports Tailwind, existing workflow layout styles in a CSS layer, and the shared workspace theme. `workspace.css` contains tokens and responsive compositions; Tailwind utilities power the shadcn primitives and shared layouts.

## Color roles

| Role | Colors |
| --- | --- |
| Canvas, cards, secondary surfaces, selection, borders | `#FAFAF8`, `#FFFFFF`, `#F5F5F3`, `#EDEDEB`, `#E5E5E3` |
| Featured card, headings/actions, secondary text | `#242424`, `#171717`, `#737373` |
| Success | `#357A45`, `#E5F3E2` |
| Warning | `#E87722`, `#FFF0E4` |
| Packing/information | `#389D9B`, `#E5F3F2` |
| Error | `#C94A4A`, `#FCEAEA` |

Small semantic text uses darker derived foregrounds where the accent itself would not reach 4.5:1 contrast. Secondary text on gray surfaces uses `#666666`. Status meaning is always written, never conveyed by color alone. Product colors in the detailed placement viewer identify product groups and are accompanied by a legend; they do not indicate order status.

## Live data and interactions

The overview bar chart shows the latest calculated **orders**, not invented weekday activity. Average utilization uses the API's mean of the latest plan per order. Orders without a plan are excluded. No trend percentages are fabricated.

The latest-plan card loads the order detail and draws its actual saved placements as a compact SVG projection. This is a preview of the first box; the complete plan retains the existing interactive viewer. Loading, empty, and failure states have explicit copy and actions. Insights link to the order that produced them.

Workspace search finds order numbers and customers. Quick actions, navigation, filters, import modes, catalog forms, review validation, exports, and destructive-action confirmations retain their existing behavior. The app does not add placeholder Settings or History destinations.

## Validation

Run `npm ci`, `npm run build`, and `npm test` in `frontend/`.

For a second local project running on the normal ports, set `PACKFLOW_API_PROXY=http://127.0.0.1:8012` when starting Vite. The default proxy remains port 8001.

Browser checks cover desktop (1518px) and mobile (390px): dashboard, order search and details, catalog modal, mobile navigation, manual-order validation, and focus restoration. Tests use an isolated temporary SQLite database.
