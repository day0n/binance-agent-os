# UI design and interaction verification

## Reference and scope

The user supplied the Binance markets screen and requested its visual language throughout this independent workbench. The public [Binance markets page](https://www.binance.com/zh-CN/markets/overview) was visually inspected on 2026-09-03, including rendered color, typography, spacing and card dimensions. The project keeps its own name and explicitly identifies itself as independent; it does not copy account login forms, imply official endorsement, or add trading controls.

Implemented: a 64px top navigation, centered 1200px content, compact bordered overview cards, short yellow active-tab underlines, asset filter chips, uniform input/select menus, native dialogs, switches, history tables, evidence/report styling, mobile drawers and dark/light themes. Overview values come from existing configuration/history; no sample market prices are displayed.

## Type tokens

The source of truth is [globals.css](../src/app/globals.css); no second typography system is introduced.

```css
--text-xs: 0.75rem;
--text-sm: 0.875rem;
--text-base: 1rem;
--text-lg: 1.125rem;
--text-xl: 1.25rem;
--text-2xl: 1.5rem;
--text-display: clamp(1.5rem, 1.12rem + 1.5vw, 2rem);
--leading-label: 1.4;
--leading-body: 1.6;
--leading-heading: 1.25;
```

## Scale decision

- Density: dense product UI, evidenced by research controls, multiple metadata columns, a node rail and history tables.
- Ratio: approximately 1.15 with optical snapping; 14px UI base. Seven levels: 12, 14, 16, 18, 20, 24 and fluid 24–32px. Long report/help prose uses 16px with 1.7 line height, capped at 65ch and naturally wrapped within narrow viewports.
- Fonts: Arial with native Chinese/system fallbacks; 400/500/600/700 weights. The reference uses BinanceNova, Arial, sans-serif, but this repository does not redistribute the proprietary BinanceNova font.
- Loading: local system fonts only. The previous external Google stylesheet and multiple downloaded weights are removed, so initial text does not wait on a font network request.
- Tabular numerals are enabled for tables, metrics, history times and counters.

## Migration map

Counts refer to explicit font-size declarations in the previous global stylesheet.

| Found                         | Count                 | Replacement                                  |
| ----------------------------- | --------------------- | -------------------------------------------- |
| 7px / 8px / 9px / 10px / 11px | 4 / 15 / 19 / 26 / 21 | 12px caption, 14px control where interactive |
| 12px                          | 10                    | 12px caption or 14px body depending on role  |
| 14px / 15px                   | 1 / 1                 | 14px UI body                                 |
| 16px / 17px / 19px            | 1 / 2 / 1             | 16px section or 18px guide heading           |
| 20px / 21px / 24px / 25px     | 1 / 1 / 1 / 1         | 20px heading or 24px page/brand              |
| 10px chart ticks              | 4                     | 12px ticks with theme-aware text color       |

## Applied now

- workbench.tsx: global/page navigation, actual status cards, task/filter tabs, composer, history, execution records, settings and guide.
- ui.tsx: shared combobox and native modal primitives with consistent focus, dismissal and selection behavior.
- report.tsx: report/table/chart presentation, loaded dynamically only when a real report is present.
- format.ts: shared role labels and numeric/time formatting.
- globals.css: spacing, color, type and motion tokens; responsive layouts and reduced-motion handling.

## Verify

Observed normal-text contrast ratios: primary text on dark background 14.69:1; secondary caption 5.24:1; caption on raised modal 4.77:1; yellow-button label 12.18:1; yellow links 9.65:1; positive/negative values 8.18:1 / 4.93:1. Light-mode muted text is 5.79:1 and links 5.28:1. Nine explicit token-pair checks are automated; this is not a blanket accessibility certification.

Browser checks: dropdown Arrow/Enter selection and closing, ETH example/symbol consistency, native dialog scroll lock, Tab/Shift+Tab containment, Escape and restored trigger focus, risk switch, dark/light toggle, mobile navigation, history filtering and FAQ disclosure. Widths 320, 390, 768 and the default desktop viewport were checked for page-level horizontal overflow. Status cards intentionally use a touch-scroll strip on phones; real data tables may scroll inside their container.

Motion is limited to 160–180ms opacity/transform transitions and explicit loading indicators. Reduced-motion preference disables animations. Initial report/chart loading is deferred; no claim of identical performance across all devices or networks is made. Financial end-to-end execution and populated live report verification remain blocked as documented in VALIDATION.md.
