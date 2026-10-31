import type { ReactElement, ReactNode } from 'react';

import styles from './Sheet.module.scss';

const join = (...names: readonly (string | false | undefined)[]): string => names.filter(Boolean).join(' ');

// A fact the sheet's bar reads out to the right of its title: a term and its value, in the HUD voice,
// keyed by `id`.
export interface SheetFact {
  readonly id: string;
  readonly term: ReactNode;
  readonly value: ReactNode;
}

// Sheet is one section of a page, drawn as the brand book draws a sheet (scnehaux-design
// scnx-platform/Brand-Book.html, 04 Layout; ui-platform-docs' Sheet): a rule across the page at its
// top, a cross where the rule meets each of the column's lines, and a bar, `NN / Title ··· facts`,
// held under the frame's bar while the sheet is read on a large screen. The page counts its sheets
// (AppFrame's main), and the frame marks the sheet being read as here: its number turns blue.
//
// The title is the sheet's h2 and names the section, which makes it a region a screen reader can jump
// to. A sheet whose content is already a region of that name (a table captioned with the sheet's title)
// is not `named`: two landmarks of one name cannot be told apart. The description, when there is one,
// opens the body as the sheet's lede. A flush sheet's body runs from line to line with no padding, for
// a block that draws its own cells (Facts).
export function Sheet({
  id,
  title,
  description,
  facts,
  flush = false,
  named = true,
  className,
  children,
}: {
  readonly id: string;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly facts?: readonly SheetFact[];
  readonly flush?: boolean;
  readonly named?: boolean;
  readonly className?: string;
  readonly children?: ReactNode;
}): ReactElement {
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      className={join(styles['sheet'], className)}
      aria-labelledby={named ? titleId : undefined}
      data-sheet=""
    >
      <div className={styles['bar']}>
        <span className={styles['number']} aria-hidden="true" />
        <h2 id={titleId} className={styles['title']}>
          {title}
        </h2>
        {facts === undefined || facts.length === 0 ? null : (
          <dl className={styles['facts']}>
            {facts.map((fact) => (
              <div key={fact.id}>
                <dt>{fact.term}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className={styles['body']} data-flush={flush ? '' : undefined}>
        {description === undefined ? null : <p className={styles['description']}>{description}</p>}
        {children}
      </div>
    </section>
  );
}
