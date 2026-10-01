import type { ReactElement } from 'react';
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';

import { TextAreaField } from '@identity-experience/ui';

import { maxReasonLength, minReasonLength, reasonProblem } from '../domain/reason';
import { CoreMessage, useCoreMessage } from '../i18n/CoreMessage';

// reasonRules is how a form registers its reason. The reason is collected before submission and is
// required (TDD-identity-experience-003 §Security Notes): a reason written afterwards is written by
// someone who already knows how it turned out.
export const reasonRules = {
  validate: (value: string): true | string => reasonProblem(value) ?? true,
};

export function ReasonField({
  registration,
  error,
}: {
  readonly registration: UseFormRegisterReturn;
  readonly error: FieldError | undefined;
}): ReactElement {
  const t = useCoreMessage();
  const problem = error?.message;
  const values = { min: minReasonLength, max: maxReasonLength };
  const message =
    problem === 'short'
      ? t('form.reason.short', values)
      : problem === 'long'
        ? t('form.reason.long', values)
        : problem === 'characters'
          ? t('form.reason.characters')
          : undefined;
  return (
    <TextAreaField
      {...registration}
      label={<CoreMessage id="form.reason.label" />}
      hint={<CoreMessage id="form.reason.hint" values={values} />}
      error={message}
      required
    />
  );
}
