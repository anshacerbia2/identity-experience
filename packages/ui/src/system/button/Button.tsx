import { Button as SystemButton, type ButtonProps } from '@scnx/system/components/button';
import type { ReactElement } from 'react';

import styles from './Button.module.scss';

// Button is the platform's Button, composed with two rules the applications hold it to and it does
// not draw yet (README.md, "Composed"):
//
// - its label wraps between its words and the button is never wider than its container, so a long
//   label fits a 320 CSS px screen (TDD-identity-experience-003 §Layout, STD-GLB-FE-005 §3.10);
// - a pressed toggle (`pressed`, announced as aria-pressed) shows an edge and a surface, so its state
//   is not told by colour alone (WCAG 2.2 SC 1.4.11, TDD-identity-experience-003 §Contrast and Focus).
//
// Its props are the platform's, unchanged.

export type { ButtonProps, ButtonSize, ButtonVariant } from '@scnx/system/components/button';

export function Button({ className, ...rest }: ButtonProps): ReactElement {
  const classes = [styles['root'], className].filter(Boolean).join(' ');
  return <SystemButton {...rest} className={classes} />;
}
