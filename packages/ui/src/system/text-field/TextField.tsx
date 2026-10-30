import { TextField as SystemTextField, type TextFieldProps } from '@scnx/system/components/text-field';
import type { ReactElement } from 'react';

import styles from './TextField.module.scss';

// TextField is the platform's TextField: a visible label bound to its input, an optional
// description, and an error tied to the input (aria-describedby, aria-invalid), so a screen reader
// hears why a value was refused where it is typed (STD-GLB-FE-009). It is composed with one rule:
// its focus outline stands 2px off the input, as on every other focusable element here, where the
// platform draws it on the input's edge (TDD-identity-experience-003 §Contrast and Focus).
//
// Its props are the platform's, unchanged.

export type { TextFieldProps } from '@scnx/system/components/text-field';

export function TextField({ className, ...rest }: TextFieldProps): ReactElement {
  return <SystemTextField {...rest} className={[styles['root'], className].filter(Boolean).join(' ')} />;
}
