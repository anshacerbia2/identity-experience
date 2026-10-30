# @identity-experience/ui

The one door the applications take the UI Platform through. It re-exports `@scnx/system` and
`@scnx/core-ui` in the `scnx-platform` theme, composes a few of their components into the shapes the
applications use, and keeps local only what the platform does not publish yet. Every application in
this repository takes its components, tokens and global foundations from here and from nowhere else;
each application's dependency-cruiser rule `platform-through-ui-only` refuses an `@scnx/*` import
anywhere else.

This package was a local stand-in for the platform under the exception `ADR-IAM-012`, whose exit is
"the entry point re-exports them". It now does, and the stand-in's tokens are gone. ROADMAP.md records
the proposed status of the exception and the components that stay local.

## Intake

The platform's packages are not on npm yet (`ADR-UIP-REL-001`). This repository installs them the way
`ui-platform-docs` does (`TDD-ui-platform-docs-001` D2):

- `vendor/ui-platform/` holds the two tarballs of one ui-platform CI run on `main`, its
  `packed-packages` artifact. ui-platform builds reproducibly, so they are byte-identical to that run's
  attested tarballs.
- `vendor/ui-platform/pin.json` records the repository, the commit, the run, the signer workflow and
  each tarball's sha256.
- This package's `package.json` installs exactly those files (`file:../../vendor/ui-platform/…`), at
  the exact version `.npmrc` requires, and the lockfile holds their integrity.
- `scripts/ui-platform.mjs check` holds the files to the pin and the manifest to the files.
  `scripts/ui-platform.mjs verify`, run by CI's `ui-platform` job, also verifies each tarball's SLSA
  provenance with `gh attestation verify`: signed by ui-platform's `.github/workflows/ci.yml`, built
  from the pinned commit on `refs/heads/main`, on a GitHub-hosted runner.
- `scripts/ui-platform.mjs pin --packs <artifact> --commit <sha> --run <url>` moves the pin.
  organization-experience pins the same commit, so both consoles render one release.

| Pinned          | Value                                                                                   |
| :-------------- | :-------------------------------------------------------------------------------------- |
| Commit          | `21133371b59e1286efad8b255104cae8ae75d4dc` (ui-platform `main`, #145)                   |
| Run             | <https://github.com/anshacerbia2/ui-platform/actions/runs/40547022973>                  |
| `@scnx/core-ui` | 2.0.0-beta.0, sha256 `58875be2096addff667573cd084087416631cc1fb401927136e55b09c7276b51` |
| `@scnx/system`  | 2.0.0-beta.0, sha256 `f28c091ef117a9a030ec060dbf0aba2fb5c43b2f9fd0b69bd834a52460a92bd2` |

## How the applications use it

- **One entry point.** `@identity-experience/ui` exports every component, the theme provider and
  `PLATFORM_THEME` (`'scnx-platform'`). The `exports` field exposes nothing else besides the two
  below.
- **One stylesheet import.** Each application's entry imports `@identity-experience/ui/styles` once.
  It loads the platform's aggregate component stylesheet (`@scnx/system/styles/components.css`), its
  theme (`@scnx/system/tokens/css/scnx-platform.css`), then this package's foundations
  (`src/styles/index.scss`): IBM Plex Mono, a reset, the base element rules the platform leaves to the
  application, and the utilities (STD-GLB-FE-005 §3.5).
- **One roles module.** A stylesheet that needs a role beyond one token takes
  `@use '@identity-experience/ui/roles.scss' as *;` (Sass values only, below).
- **The theme root.** `@identity-experience/app-core/preferences` `ThemeRoot` renders the platform's
  `ThemeProvider` on `<html>`, with a `ThemePreferenceAdapter` over the preferences store. Each
  `index.html` carries `data-scnx-theme="scnx-platform"` and `data-scnx-resolved-mode="dark"`, so the
  first paint already has tokens: the content security policy allows no inline script that could set
  them sooner. Dark is the default; the viewer's choice of dark or light is kept as before.

## Components

| Export                                          | Kind        | Platform component                                    | What the composition adds, or why it is local                                                                                                                                                                      |
| :---------------------------------------------- | :---------- | :---------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ButtonBase`                                    | re-exported | `@scnx/core-ui/components/button-base`                |                                                                                                                                                                                                                    |
| `Badge`                                         | re-exported | `@scnx/system/components/badge`                       |                                                                                                                                                                                                                    |
| `Alert`                                         | re-exported | `@scnx/system/components/alert`                       |                                                                                                                                                                                                                    |
| `ThemeProvider`, `createThemeStore`, `useTheme` | re-exported | `@scnx/core-ui/providers/theme-provider-base`         |                                                                                                                                                                                                                    |
| `Button`                                        | composed    | `@scnx/system/components/button`                      | Its label wraps and it is never wider than its container (§Layout, 320 CSS px). A pressed toggle (`pressed`) shows the strong edge and the selected surface: the platform draws no pressed state. Props unchanged. |
| `TextField`                                     | composed    | `@scnx/system/components/text-field`                  | Its focus outline stands 2px off the input, as everywhere else; the platform draws it on the edge. Its invalid edge takes `danger.border.strong.selected` through the platform's hook (Findings). Props unchanged. |
| `Panel`                                         | composed    | `@scnx/system/components/surface` (`panel`, `raised`) | The compound `Panel.Root`, `Header`, `Title`, `Description`, `Body` (STD-GLB-FE-006) over one Surface: `elevation="raised"` is the `panel` material, `"floating"` the `raised` one.                                |
| `StatusPill`                                    | composed    | `@scnx/system/components/badge`                       | A glyph per tone before the word, so a status never rests on colour (STD-GLB-FE-009); the Badge's dot is the same for every scheme. It wraps rather than pushing the page sideways. `data-tone` names the tone.    |
| `Table`                                         | composed    | `@scnx/system/components/table`                       | `Table.Root` requires a caption and puts the table in a region that scrolls, takes focus and is named by the caption; the platform's frame scrolls with no focus or name. `Table.Cell` adds `mono`.                |
| `SelectField`, `TextAreaField`                  | local       | none                                                  | The platform publishes no select and no multi-line field. They take TextField's props (`label`, `description`, `error`) and structure, and draw as it does, from the same tokens.                                  |
| `Icon`                                          | local       | none                                                  | The platform publishes no icon set. Drawn in the brand's grammar: a 24-unit grid, a 1.8 stroke, round caps and joins, `currentColor`.                                                                              |

A composed component renders the platform's component and adds only the rule stated, in the
`overrides` layer (STD-GLB-FE-005 §3.4: "explicit consumer composition overrides") or through the
platform's own hooks (`--scnx-*`). None selects a platform class (`.scnx-*`); a part is reached by the
name its specification gives it (`[data-part='input']`).

### Prop changes at the call sites

| Was (stand-in)                                     | Now (platform)                                                                       |
| :------------------------------------------------- | :----------------------------------------------------------------------------------- |
| `Button size="sm"`, `size="md"`                    | `size="small"`; `medium` is the default                                              |
| `Button icon={<Icon … />}`                         | `<Icon … />` as the first child; it is `aria-hidden`                                 |
| `TextField`, `SelectField`, `TextAreaField` `hint` | `description`                                                                        |
| A field error with `role="alert"`                  | Tied to the input by `aria-describedby` and `aria-invalid`, as the platform draws it |
| `data-theme="dark"` on `<html>`                    | `data-scnx-theme="scnx-platform"` and `data-scnx-resolved-mode="dark"`               |

## Tokens

`src/styles/tokens/_ds-temporary.scss` is deleted. Every `--ds-*` name the stylesheets read is the
package's (ADR-UIP-TKN-003). No compatibility alias is kept.

| Stand-in                                                    | Package                                                                                                 |
| :---------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ |
| `color-neutral-canvas-default`                              | `color-neutral-surface-canvas-default`                                                                  |
| `color-neutral-canvas-glow-a`, `-glow-b`, `-grid`           | removed, with the aurora and the grid backdrop                                                          |
| `color-neutral-border-strong-hover`                         | `color-neutral-border-strong-default` (the platform's field has no hover edge)                          |
| `color-neutral-border-default-focus`                        | `color-primary-border-default-focus`                                                                    |
| `color-primary-solid-default-{default,hover}`               | `color-primary-surface-solid-{default,hover}`                                                           |
| `color-danger-solid-default-default` (an invalid edge)      | `color-danger-border-strong-default`; the field's edge is `-selected` (Findings)                        |
| `color-accent-*`                                            | `color-info-*` (the package has no accent scheme)                                                       |
| `color-primary-shadow-default-default` (a glow)             | removed, with every glow                                                                                |
| `font-family-sans`                                          | `typography-body-default-font-family` (Inter, from the package)                                         |
| `font-family-mono`                                          | `$font-mono`: IBM Plex Mono before `typography-code-default-font-family`                                |
| `font-size-xs`, `-sm`, `-md`, `-lg`                         | `typography-label-small-`, `body-small-`, `body-default-`, `body-large-font-size`                       |
| `font-size-xl`, `-2xl`                                      | `typography-heading-medium-`, `heading-xlarge-font-size`                                                |
| `font-weight-*`                                             | `typography-weight-*`                                                                                   |
| `letter-spacing-tight`                                      | `typography-heading-large-letter-spacing`                                                               |
| `letter-spacing-wide`                                       | `$hud-tracking` (0.15em, the brand book's HUD tracking)                                                 |
| `line-height-tight`, `-normal`, `-relaxed`                  | `typography-heading-large-`, `body-default-`, `article-readable-line-height`                            |
| `duration-fast`, `-normal`                                  | `motion-feedback-duration`, `motion-enter-duration`                                                     |
| `easing-standard`                                           | `motion-feedback-easing`                                                                                |
| `radius-sm`, `-md`, `-lg`, `-xl`, `-full`                   | `dimension-radius-element`, `-control`, `-panel`, `-container`, `-pill` (0 in scnx-platform but `pill`) |
| `size-control-xs`, `-sm`, `-md`, `-lg`                      | `dimension-size-control-compact`, `-compact`, `-default`, `-comfortable`                                |
| `size-icon-xs`, `-sm`, `-md`                                | `$icon-glyph`, `$icon-text`, `$icon-nav` (12, 16, 20px; the package has no icon sizes)                  |
| `stroke-hairline`, `-thin`, `-default`                      | `dimension-border-width-default`, `-default`, `-strong`                                                 |
| `z-sticky`, `z-overlay`, `z-dropdown`                       | `dimension-z-index-sticky`, `-overlay`, `-dropdown`                                                     |
| `shadow-low`, `-medium`                                     | `effect-shadow-low`, `-medium`                                                                          |
| `shadow-focus` (a glow)                                     | removed: focus is the platform's outline                                                                |
| `layout-sidebar-width`, `-navbar-height`, `-container-wide` | `$layout-rail`, `$layout-bar`, `$layout-page` (local geometry)                                          |

Spacing has no scale in the package, only roles, so each step maps by the property it sets:

| Stand-in step | `padding`                                             | `gap`, block `margin`       | inline `margin`, `column-gap` |
| :------------ | :---------------------------------------------------- | :-------------------------- | :---------------------------- |
| `3xs`, `2xs`  | `spacing-stack-compact`                               | `spacing-stack-compact`     | `spacing-inline-compact`      |
| `xs`          | `spacing-inset-compact`                               | `spacing-stack-default`     | `spacing-inline-default`      |
| `sm`          | `spacing-control-default`                             | `spacing-control-default`   | `spacing-control-default`     |
| `md`          | `spacing-inset-default`                               | `spacing-stack-comfortable` | `spacing-inline-comfortable`  |
| `lg`          | `spacing-inset-comfortable`                           | `spacing-page`              | `spacing-page`                |
| `xl`          | `spacing-section`                                     | `spacing-section`           | `spacing-section`             |
| `2xl`, `3xl`  | `calc(2 * spacing-page)`, `calc(2 * spacing-section)` | the same                    | the same                      |

Every spacing token is under `--ds-dimension-`. `3xs` (0.125rem) has no counterpart and takes 0.25rem.

### Roles (`src/styles/_roles.scss`)

Sass values, no custom properties, so no ad-hoc custom property is declared (STD-GLB-FE-005 §3.2).
Each is a token, or a local value with its purpose stated:

| Role                                          | Value                                                            | Purpose                                |
| :-------------------------------------------- | :--------------------------------------------------------------- | :------------------------------------- |
| `$font-mono`                                  | `'IBM Plex Mono', var(--ds-typography-code-default-font-family)` | The HUD voice; identifiers and figures |
| `$hud-tracking`                               | `0.15em`                                                         | The HUD voice's tracking; no token     |
| `$icon-glyph`, `$icon-text`, `$icon-nav`      | `0.75rem`, `1rem`, `1.25rem`                                     | Icon sizes; no token                   |
| `$layout-rail`, `$layout-bar`, `$layout-page` | `16.5rem`, `3.75rem`, `80rem`                                    | The frame's local geometry             |

## Fonts

- **Inter** ships in `@scnx/system` (`fonts/inter-variable.woff2`, `inter-italic-variable.woff2`, OFL)
  and its theme stylesheet declares it.
- **IBM Plex Mono** 400, 500 and 600 are in `src/styles/fonts/`, copied from scnehaux-design
  `design-system/fonts/` with their SIL Open Font License 1.1 (`ibm-plex-mono-ofl.txt`), and declared
  in `src/styles/foundations/_fonts.scss`.
- The build emits every font as a file (`assetsInlineLimit: 0`), served from this origin under the
  BFF's `font-src 'self'`. `@fontsource-variable/inter` and `@fontsource-variable/jetbrains-mono` are
  removed; JetBrains Mono is no longer drawn.

## Styling rules

These follow STD-GLB-FE-005, and stylelint enforces them in this repository's stylesheets (the
package's CSS is not linted here):

- Styles are SCSS Modules beside their component, inside `@layer components`; a composition's rule is
  in `@layer overrides`.
- The layer order is the platform's, `reset, tokens, base, components, recipes, utilities,
overrides` (§3.4). Each application's Vite config states it at the top of every stylesheet that has
  no `@use` (`css.preprocessorOptions.scss.additionalData`), and `_layers.scss` states it for one that
  has. A browser takes the order from the first stylesheet that names a layer, and a split CSS chunk
  can load before the global one.
- Colours are platform tokens. HEX, `rgb()`, `hsl()` and `hwb()` are refused.
- Properties are logical only. `margin-left`, `width` and their kind are refused.
- Nesting is at most two levels deep, specificity at most `0,4,0`, and no `!important`.
- Global classes carry the `scnx-iam-` prefix.
- Focus is the platform's: a 2px outline in `primary.border.default.focus`, 2px off the element,
  `Highlight` under forced colours (STD-GLB-FE-005 §3.9).

Every state is conveyed by a word or a glyph as well as a colour (STD-GLB-FE-009).

## Contrast

`src/styles/contrast.test.ts` reads both modes of the `scnx-platform` theme from the pinned package's
stylesheet and holds every colour pair the components and the frame draw to WCAG 2.2 AA after alpha
composition: 4.5:1 for text, 3:1 for a field's edge, a pressed state and the focus indicator. A new
pair a component draws belongs in its list. TDD-identity-experience-003 §Contrast and Focus records the
ratios, and identity-kernel's login theme takes the same tokens and measures them the same way.

## Findings for ui-platform

What this intake found in `@scnx/system` 2.0.0-beta.0 at `2113337`, for its owner. Each is worked
around here as stated, without selecting a platform class.

1. **TextField's invalid edge fails SC 1.4.11 in light.** `danger.border.strong.default` is 2.38:1
   against the input's `neutral.surface.raised` fill; a field whose only boundary is its edge loses it
   when invalid. Here: the hook `--scnx-text-field-input-border-color-invalid` takes
   `danger.border.strong.selected` (4.55:1 light, 3.85:1 dark).
2. **TextField's focus outline has offset 0** (`.scnx-text-field > [data-part=input]:focus-visible`),
   where the platform's base draws every other focus 2px off. Here: the composition sets the offset to
   `dimension.border-width.strong`.
3. **Button draws no pressed state.** `ButtonBase` sets `aria-pressed`, and nothing in the styled
   Button binds to it, so a toggle's state shows only to assistive technology. Here: the composition
   draws it.
4. **Button never wraps** (`white-space: nowrap`, a fixed `block-size`). A long label overflows its
   container at 320 CSS px (SC 1.4.10). Here: the composition lets it wrap.
5. **Table's scrolling frame takes no focus and no name.** A table wider than its frame scrolls in a
   region a keyboard cannot reach (SC 2.1.1). Here: the composition wraps it in a named, focusable
   region that scrolls instead.
6. **No select, multi-line field or icon set**, and no icon size tokens. Here: local, as listed.
