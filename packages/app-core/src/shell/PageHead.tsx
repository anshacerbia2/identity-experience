import type { ReactElement, ReactNode } from 'react';

import { Facts, type Fact } from './Facts';
import styles from './PageHead.module.scss';

// PageHead is a page's head, drawn as the documentation site draws one: a way back, when the page has
// one, the eyebrow naming where the page sits, the heading, its lede, and what the page states at once
// (a status, an action). Facts, when there are any, follow as a row of cells across the page, the
// sheet's title block. An application's landing page takes the `display` size: the brand book's
// display heading, larger and tighter.
export function PageHead({
  back,
  eyebrow,
  title,
  lead,
  facts,
  display = false,
  children,
}: {
  readonly back?: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
  readonly lead?: ReactNode;
  readonly facts?: readonly Fact[];
  readonly display?: boolean;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <>
      <header className={styles['head']} data-display={display ? '' : undefined}>
        {back === undefined ? null : <div className={styles['back']}>{back}</div>}
        {eyebrow === undefined ? null : (
          <p className={styles['eyebrow']}>
            <span className={styles['here']} aria-hidden="true" />
            {eyebrow}
          </p>
        )}
        <h1 className={styles['title']}>{title}</h1>
        {lead === undefined ? null : <p className={styles['lead']}>{lead}</p>}
        {children === undefined ? null : <div className={styles['aside']}>{children}</div>}
      </header>
      {facts === undefined || facts.length === 0 ? null : <Facts items={facts} />}
    </>
  );
}
