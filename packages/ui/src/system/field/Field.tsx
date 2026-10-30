import { useId, type ComponentPropsWithRef, type ReactElement, type ReactNode } from 'react';

import styles from './Field.module.scss';

// Form fields the platform does not publish yet: a select and a multi-line field. They take the
// platform TextField's props and structure (`@scnx/core-ui/components/text-field-base`): a label bound
// to the control, then an optional description, the control, and an optional error, tied to the
// control by aria-describedby and aria-invalid, so a screen reader hears why a value was refused where
// it is typed (STD-GLB-FE-009). Their stylesheet draws them as the platform draws its text field, from
// the same tokens. They are local until the platform ships them (README.md, "Local").

interface FieldChrome {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
}

const join = (...names: readonly (string | undefined)[]): string => names.filter(Boolean).join(' ');

function useFieldIds(error: ReactNode, description: ReactNode) {
  const id = useId();
  const descriptionId = description === undefined || description === null ? undefined : `${id}-description`;
  const errorId = error === undefined || error === null || error === false ? undefined : `${id}-error`;
  return {
    id,
    descriptionId,
    errorId,
    describedBy: [descriptionId, errorId].filter(Boolean).join(' ') || undefined,
  };
}

function Chrome({
  id,
  label,
  description,
  descriptionId,
  error,
  errorId,
  className,
  children,
}: FieldChrome & {
  readonly id: string;
  readonly descriptionId: string | undefined;
  readonly errorId: string | undefined;
  readonly className: string | undefined;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className={join(styles['field'], className)} data-invalid={errorId === undefined ? undefined : ''}>
      <label className={styles['label']} htmlFor={id}>
        {label}
      </label>
      {descriptionId === undefined ? null : (
        <p id={descriptionId} className={styles['description']}>
          {description}
        </p>
      )}
      {children}
      {errorId === undefined ? null : (
        <p id={errorId} className={styles['error']}>
          {error}
        </p>
      )}
    </div>
  );
}

export function TextAreaField({
  label,
  description,
  error,
  className,
  ...rest
}: FieldChrome & ComponentPropsWithRef<'textarea'>): ReactElement {
  const ids = useFieldIds(error, description);
  return (
    <Chrome {...ids} label={label} description={description} error={error} className={className}>
      <textarea
        {...rest}
        id={ids.id}
        className={join(styles['control'], styles['area'])}
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
  description,
  error,
  options,
  className,
  ...rest
}: FieldChrome &
  ComponentPropsWithRef<'select'> & { readonly options: readonly SelectOption[] }): ReactElement {
  const ids = useFieldIds(error, description);
  return (
    <Chrome {...ids} label={label} description={description} error={error} className={className}>
      <select
        {...rest}
        id={ids.id}
        className={join(styles['control'], styles['select'])}
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
