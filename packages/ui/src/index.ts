// @identity-experience/ui: the one door applications take the UI Platform through.
//
// The UI Platform's packages, `@scnx/system` and `@scnx/core-ui` (vendor/ui-platform/pin.json), are
// re-exported here, so no application imports them directly (each application's dependency-cruiser
// rules) and an upgrade or a replaced component changes this file only. Three kinds of export:
//
//   re-exported  the platform's component as it ships
//   composed     the platform's component with a composition the applications need, in a file of
//                its own that renders it (a required caption, a status glyph, a focus offset)
//   local        no platform counterpart yet; drawn from the platform's tokens
//
// README.md lists each component and its kind, and why a composed or local one is not re-exported.
export { ButtonBase } from '@scnx/core-ui/components/button-base';
export type { AnchorModeProps, ButtonBaseProps, ButtonModeProps } from '@scnx/core-ui/components/button-base';
export {
  createThemeStore,
  ThemeProvider,
  useTheme,
  type ResolvedMode,
  type ThemeMode,
  type ThemePreferenceAdapter,
  type ThemeStore,
} from '@scnx/core-ui/providers/theme-provider-base';
export { Alert } from '@scnx/system/components/alert';
export type { AlertProps, AlertScheme } from '@scnx/system/components/alert';
export { Badge } from '@scnx/system/components/badge';
export type { BadgeProps, BadgeScheme } from '@scnx/system/components/badge';

export { Button } from './system/button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './system/button';
export { Panel } from './system/panel';
export { StatusPill } from './system/status-pill';
export type { StatusTone } from './system/status-pill';
export { Table } from './system/table';
export { TextField } from './system/text-field';
export type { TextFieldProps } from './system/text-field';

export { Icon } from './system/icon';
export type { IconName } from './system/icon';
export { SelectField, TextAreaField } from './system/field';
export type { SelectOption } from './system/field';

// The theme every application renders in (ADR-UIP-VIS-002; scnehaux-design scnx-platform).
export const PLATFORM_THEME = 'scnx-platform';
