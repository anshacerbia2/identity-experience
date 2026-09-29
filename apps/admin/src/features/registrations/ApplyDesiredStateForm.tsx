import type { ReactElement } from 'react';
import { useForm } from 'react-hook-form';

import { Button, Icon, Panel } from '@identity-experience/ui';

import { MutationError } from '@/core/api/MutationError';
import { Message, useMessage } from '@/core/i18n/Message';
import type { Finding } from '@/domain/registration';

import { fieldLabel } from './labels';
import { ReasonField, reasonRules } from './ReasonField';
import { useApplyDesiredState } from './registrations-api';
import styles from './RegistrationsPage.module.scss';

interface Values {
  readonly reason: string;
}

// ApplyDesiredStateForm asks for the reason, then applies the registered state to one finding the
// sweep will not settle on its own. It is offered only for such a finding: the API would refuse
// any other, and the console does not offer what the API would refuse.
export function ApplyDesiredStateForm({
  finding,
  onDone,
  onCancel,
}: {
  readonly finding: Finding;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}): ReactElement {
  const t = useMessage();
  const apply = useApplyDesiredState();
  const form = useForm<Values>({ defaultValues: { reason: '' } });
  const submit = form.handleSubmit((values) => {
    apply.mutate({ findingId: finding.finding_id, reason: values.reason }, { onSuccess: onDone });
  });
  return (
    <Panel.Root elevation="floating">
      <Panel.Header>
        <Panel.Title>
          <Message id="findings.apply.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="findings.apply.body" values={{ field: t(fieldLabel(finding.field_class)) }} />
        </Panel.Description>
      </Panel.Header>
      <form className={styles['form']} onSubmit={(event) => void submit(event)} noValidate>
        <ReasonField
          registration={form.register('reason', reasonRules)}
          error={form.formState.errors.reason}
        />
        {apply.isError ? <MutationError error={apply.error} /> : null}
        <div className={styles['formActions']}>
          <Button type="submit" disabled={apply.isPending} icon={<Icon name="check" />}>
            <Message id="findings.apply" />
          </Button>
          <Button variant="ghost" onClick={onCancel} disabled={apply.isPending}>
            <Message id="form.cancel" />
          </Button>
        </div>
      </form>
    </Panel.Root>
  );
}
