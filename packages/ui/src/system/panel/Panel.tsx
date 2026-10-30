import { Surface } from '@scnx/system/components/surface';
import type { ComponentPropsWithRef, ReactElement } from 'react';

import styles from './Panel.module.scss';

// Panel is a section of a page on the platform's Surface, in the `panel` material: in scnx-platform
// a 1px line and no radius. It composes Surface into the compound the applications use
// (STD-GLB-FE-006): Panel.Root holds Panel.Header, Panel.Title, Panel.Description and Panel.Body, and
// each renders the element its meaning calls for. Surface is one element; the parts are this file's.

const join = (...names: readonly (string | undefined)[]): string => names.filter(Boolean).join(' ');

// raised is a section of the page; floating is what is raised above one (a confirmation, a result),
// the platform's `raised` material.
type Elevation = 'raised' | 'floating';

function Root({
  className,
  elevation = 'raised',
  ...rest
}: ComponentPropsWithRef<'section'> & { readonly elevation?: Elevation }): ReactElement {
  return (
    <Surface
      {...rest}
      as="section"
      material={elevation === 'floating' ? 'raised' : 'panel'}
      className={join(styles['root'], className)}
      data-elevation={elevation}
    />
  );
}

function Header({ className, ...rest }: ComponentPropsWithRef<'header'>): ReactElement {
  return <header {...rest} className={join(styles['header'], className)} />;
}

function Title({ className, children, ...rest }: ComponentPropsWithRef<'h2'>): ReactElement {
  return (
    <h2 {...rest} className={join(styles['title'], className)}>
      {children}
    </h2>
  );
}

function Description({ className, ...rest }: ComponentPropsWithRef<'p'>): ReactElement {
  return <p {...rest} className={join(styles['description'], className)} />;
}

function Body({ className, ...rest }: ComponentPropsWithRef<'div'>): ReactElement {
  return <div {...rest} className={join(styles['body'], className)} />;
}

export const Panel = { Root, Header, Title, Description, Body };
