// @identity-experience/ui: the temporary stand-in for the UI Platform's packages.
//
//   primitives/  headless behaviour, mirroring @scnx/core-ui (ButtonBase ...)
//   system/      styled components, mirroring @scnx/system (Button ...)
//   styles/      the --ds-* token shim and the global foundations
//
// This file is the one door applications import through (Component-Driven Development). When the
// platform publishes a component, its line here changes to re-export the platform's, and no
// application changes:
//
//   export { Button } from '@scnx/system/button';
//
// README.md records which component is local and which is the platform's.
export { ButtonBase } from './primitives/button-base';
export type { ButtonBaseAnchorProps, ButtonBaseButtonProps, ButtonBaseProps } from './primitives/button-base';
export { Button } from './system/button';
export type { ButtonProps, ButtonSize, ButtonVariant } from './system/button';
export { Icon } from './system/icon';
export type { IconName } from './system/icon';
export { Panel } from './system/panel';
export { StatusPill } from './system/status-pill';
export type { StatusTone } from './system/status-pill';
export { Table } from './system/table';
export { SelectField, TextAreaField, TextField } from './system/field';
export type { SelectOption } from './system/field';
