# @identity-experience/ui

A temporary stand-in for the UI Platform's packages, `@scnx/core-ui` and `@scnx/system`, while
they are not yet published. Every application in this repository takes its components, tokens and
global foundations from here and from nowhere else.

It exists under an approved exception, `ADR-IAM-012`, accepted on 2026-10-20 and expiring on
2027-04-20. SAD-002 §10 rejects bypassing the UI Platform without an approved exception, and
STD-GLB-FE-005 §3.5 makes applications consumers of the platform's token pipeline; the ADR is that
exception. Its exit is the one this package is shaped for: once the platform releases its packages,
`src/index.ts` re-exports them and the local copies are deleted. If they are not released by
2027-04-20, a new exception ADR supersedes it (ROADMAP.md).

## How replacement works

Applications import one entry point, `@identity-experience/ui`, and one stylesheet,
`@identity-experience/ui/styles.scss`. The `exports` field exposes nothing else, so no application
file can depend on an internal path. Replacing a component is changing its line in `src/index.ts`:

```ts
// today
export { Button } from './system/button';
// once the platform publishes it
export { Button } from '@scnx/system/button';
```

Three rules keep that one-line change honest:

1. **The same API.** Each local component takes the props its platform counterpart takes.
   `ButtonBase` renders a `<button>`, or an `<a>` when given `href`, like
   `@scnx/core-ui/components/button-base`. `Button` exposes `data-variant` like `@scnx/system`'s.
2. **The same tokens.** `src/styles/tokens/_ds-temporary.scss` defines only Tier-2 names, in the
   platform's own naming (ADR-UIP-TKN-003): `--ds-color-{scheme}-{role}-{emphasis}-{state}`,
   `--ds-spacing-*`, `--ds-radius-*` and so on. Components read nothing else. Replacing the tokens
   means deleting that file and importing the platform's theme.
3. **The same layers.** Primitives carry behaviour and no style. Styled components wrap them and
   bind their stylesheet to data attributes.

## Map

| Here                               | Platform counterpart                   | Status                                                      |
| :--------------------------------- | :------------------------------------- | :---------------------------------------------------------- |
| `primitives/button-base`           | `@scnx/core-ui/components/button-base` | mirrors the platform's API                                  |
| `system/button`                    | `@scnx/system` `Button`                | mirrors; variants `primary`, `secondary`, `ghost`, `danger` |
| `system/panel`                     | none yet                               | local                                                       |
| `system/status-pill`               | none yet                               | local                                                       |
| `system/icon`                      | none yet                               | local                                                       |
| `system/table`                     | none yet                               | local; a `<table>` with a required caption                  |
| `system/field`                     | none yet                               | local; `TextField`, `TextAreaField`, `SelectField`          |
| `styles/tokens/_ds-temporary.scss` | `@scnx/system/themes/*`                | platform names, local values                                |

## Styling rules

These follow STD-GLB-FE-005, and stylelint enforces them:

- Styles are SCSS Modules beside their component, inside `@layer components`.
- The layer order (`reset, tokens, base, components, utilities, overrides`) is stated at the top of
  every stylesheet by the application's Vite config (`css.preprocessorOptions.scss.additionalData`).
  A browser takes the order from the first stylesheet that names a layer. A split CSS chunk can load
  before the global one, and without the statement the reset's button rules beat every Button's own.
- Colours are OKLCH. HEX, `rgb()` and `hsl()` are refused.
- Properties are logical only. `margin-left`, `width` and their kind are refused.
- Nesting is at most two levels deep, and no `!important`.
- Global classes carry the `scnx-iam-` prefix.

- Focus is always the outline `foundations/_base.scss` draws. A component may add
  `--ds-shadow-focus` (a glow, dark only) but never removes the outline (STD-GLB-FE-005 §3.9).

Every state is conveyed by a word or a glyph as well as a colour (STD-GLB-FE-009).

## Contrast

`src/styles/contrast.test.ts` compiles `styles.scss`, reads each theme's tokens and holds every colour
pair the components draw to WCAG 2.2 AA after alpha composition, over the worst part of the canvas:
4.5:1 for text, 3:1 for a field's edge, a pressed state and the focus indicator. A new token pair a
component draws belongs in its list. TDD-identity-experience-003 §Contrast and Focus records the
ratios, and identity-kernel's login theme copies these tokens and measures them the same way.
