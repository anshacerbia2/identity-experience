import type { ReactElement } from 'react';

import { Button, Icon, Panel } from '@identity-experience/ui';

import { signInHref, useHere } from './session';
import { CoreMessage } from '../i18n/CoreMessage';

// SignInRequired stands in for a page that reads the Identity Control API when no one is signed in.
// It says why, and offers the sign-in that returns here.
export function SignInRequired(): ReactElement {
  const here = useHere();
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <CoreMessage id="session.required.title" />
        </Panel.Title>
        <Panel.Description>
          <CoreMessage id="session.required.body" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        <Button href={signInHref(here)} icon={<Icon name="key" />}>
          <CoreMessage id="shell.session.signIn" />
        </Button>
      </Panel.Body>
    </Panel.Root>
  );
}
