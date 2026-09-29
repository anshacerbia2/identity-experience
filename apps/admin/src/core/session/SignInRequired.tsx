import { useRouterState } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Button, Icon, Panel } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';

import { signInHref } from './session';

// SignInRequired stands in for a page that reads the Identity Control API when no one is signed in.
// It says why, and offers the sign-in that returns here.
export function SignInRequired(): ReactElement {
  const here = useRouterState({ select: (state) => state.location.href });
  return (
    <Panel.Root>
      <Panel.Header>
        <Panel.Title>
          <Message id="session.required.title" />
        </Panel.Title>
        <Panel.Description>
          <Message id="session.required.body" />
        </Panel.Description>
      </Panel.Header>
      <Panel.Body>
        <Button href={signInHref(here)} icon={<Icon name="key" />}>
          <Message id="shell.session.signIn" />
        </Button>
      </Panel.Body>
    </Panel.Root>
  );
}
