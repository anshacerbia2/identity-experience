import { useId, type ComponentPropsWithRef, type ReactElement, type ReactNode } from 'react';

import styles from './Field.module.scss';

// Form fields: a label bound to its control, an optional hint, and an error that is announced and
// tied to the control (aria-describedby, aria-invalid), so a screen reader hears why a value was
// refused where it is typed (STD-GLB-FE-009). The platform publishes no form components yet; these
// are local.

interface FieldChrome {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
}

const join = (...names: readonly (string | undefined)[]): string => names.filter(Boolean).join(' ');

function useFieldIds(error: ReactNode, hint: ReactNode) {
  const id = useId();
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined || error === null || error === false ? undefined : `${id}-error`;
  return {
    id,
    hintId,
    errorId,
    describedBy: [hintId, errorId].filter(Boolean).join(' ') || undefined,
  };
}

function Chrome({
  id,
  label,
  hint,
  hintId,
  error,
  errorId,
  children,
}: FieldChrome & {
  readonly id: string;
  readonly hintId: string | undefined;
  readonly errorId: string | undefined;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className={styles['field']} data-invalid={errorId === undefined ? undefined : true}>
      <label className={styles['label']} htmlFor={id}>
        {label}
      </label>
      {children}
      {hintId === undefined ? null : (
        <p id={hintId} className={styles['hint']}>
          {hint}
        </p>
      )}
      {errorId === undefined ? null : (
        <p id={errorId} className={styles['error']} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({
  label,
  hint,
  error,
  className,
  ...rest
}: FieldChrome & ComponentPropsWithRef<'input'>): ReactElement {
  const ids = useFieldIds(error, hint);
  return (
    <Chrome {...ids} label={label} hint={hint} error={error}>
      <input
        {...rest}
        id={ids.id}
        className={join(styles['control'], className)}
        aria-describedby={ids.describedBy}
        aria-invalid={ids.errorId === undefined ? undefined : true}
      />
    </Chrome>
  );
}

export function TextAreaField({
  label,
  hint,
  error,
  className,
  ...rest
}: FieldChrome & ComponentPropsWithRef<'textarea'>): ReactElement {
  const ids = useFieldIds(error, hint);
  return (
    <Chrome {...ids} label={label} hint={hint} error={error}>
      <textarea
        {...rest}
        id={ids.id}
        className={join(styles['control'], styles['area'], className)}
        aria-describedby={ids.describedBy}
        aria-invalid={ids.errorId === undefined ? undefined : true}
      />
    </Chrome>
  );
}

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export function SelectField({
  label,
  hint,
  error,
  options,
  className,
  ...rest
}: FieldChrome &
  ComponentPropsWithRef<'select'> & { readonly options: readonly SelectOption[] }): ReactElement {
  const ids = useFieldIds(error, hint);
  return (
    <Chrome {...ids} label={label} hint={hint} error={error}>
      <select
        {...rest}
        id={ids.id}
        className={join(styles['control'], styles['select'], className)}
        aria-describedby={ids.describedBy}
        aria-invalid={ids.errorId === undefined ? undefined : true}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Chrome>
  );
}
