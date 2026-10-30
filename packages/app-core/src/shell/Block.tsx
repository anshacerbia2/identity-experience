import type { ComponentPropsWithRef, ReactElement } from 'react';

import styles from './Block.module.scss';

// Block is a page's content that is not a sheet of its own (a way back, a sign-in prompt, a read that
// failed, one still loading): padded as a sheet's body is, so it lines up with the page's head and its
// sheets, and stacked as a section's parts were.
export function Block({ className, ...rest }: ComponentPropsWithRef<'div'>): ReactElement {
  return <div {...rest} className={[styles['block'], className].filter(Boolean).join(' ')} />;
}
