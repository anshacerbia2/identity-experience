import type { ReactElement, ReactNode } from 'react';

import { Icon, type IconName } from '../icon';
import styles from './StatusPill.module.scss';

// StatusPill states a status with a glyph and a word as well as a colour. STD-GLB-FE-009 forbids
// colour-only meaning, and in this product a status is often a security fact: "blocked" must read
// as blocked to someone who cannot tell cyan from green.

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const glyphs: Record<StatusTone, IconName> = {
  neutral: 'clock',
  info: 'pulse',
  success: 'check',
  warning: 'alert',
  danger: 'alert',
};

export function StatusPill({
  tone,
  children,
}: {
  readonly tone: StatusTone;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <span className={styles['root']} data-tone={tone}>
      <span className={styles['glyph']}>
        <Icon name={glyphs[tone]} />
      </span>
      {children}
    </span>
  );
}
