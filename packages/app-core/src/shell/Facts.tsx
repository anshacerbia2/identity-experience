import type { ReactElement, ReactNode } from 'react';

import styles from './Facts.module.scss';

// One fact: a term in the HUD voice over its value, keyed by `id`. `mono` sets an identifier or a
// figure in the HUD face; `wide` gives a long value, a URI or a list, two columns' room.
export interface Fact {
  readonly id: string;
  readonly term: ReactNode;
  readonly value: ReactNode;
  readonly mono?: boolean;
  readonly wide?: boolean;
}

// Facts is a title block set as cells that share their lines (the brand book's facts row): as many
// columns as the room holds, one line between any two cells, never a frame around one.
export function Facts({ items }: { readonly items: readonly Fact[] }): ReactElement {
  return (
    <dl className={styles['facts']}>
      {items.map((fact) => (
        <div key={fact.id} className={styles['fact']} data-wide={fact.wide === true ? '' : undefined}>
          <dt className={styles['term']}>{fact.term}</dt>
          <dd className={styles['value']} data-mono={fact.mono === true ? '' : undefined}>
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
