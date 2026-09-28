import type { ComponentPropsWithRef, ReactElement } from 'react';

import styles from './Panel.module.scss';

// Panel is the application's surface: a translucent card over the canvas. It is a compound
// component (STD-GLB-FE-006): Panel.Root holds Panel.Header, Panel.Title, Panel.Description and
// Panel.Body, and each renders the element its meaning calls for.

const join = (...names: readonly (string | undefined)[]): string => names.filter(Boolean).join(' ');

type Elevation = 'raised' | 'floating';

function Root({
  className,
  elevation = 'raised',
  ...rest
}: ComponentPropsWithRef<'section'> & { readonly elevation?: Elevation }): ReactElement {
  return <section {...rest} className={join(styles['root'], className)} data-elevation={elevation} />;
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
