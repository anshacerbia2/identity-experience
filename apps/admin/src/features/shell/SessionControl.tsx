import { useRouterState } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Button, Icon, StatusPill } from '@identity-experience/ui';

import { Message } from '@/core/i18n/Message';
import { signInHref, useSession, useSignOut } from '@/core/session/session';

// SessionControl states who is signed in and offers the one action that applies: sign in, or
// sign out. Signing in is a full navigation to the BFF, never a fetch: the identity kernel's
// hosted page is where credentials are entered.
export function SessionControl(): ReactElement {
  const session = useSession();
  const signOut = useSignOut();
  const here = useRouterState({ select: (state) => state.location.href });

  if (session.isPending) {
    return (
      <StatusPill tone="neutral">
        <Message id="shell.session.checking" />
      </StatusPill>
    );
  }
  if (session.isError) {
    return (
      <StatusPill tone="danger">
        <Message id="shell.session.unavailable" />
      </StatusPill>
    );
  }
  if (!session.data.authenticated) {
    return (
      <Button href={signInHref(here)} size="sm" icon={<Icon name="key" />}>
        <Message id="shell.session.signIn" />
      </Button>
    );
  }

  const { displayName, principalId, csrfToken } = session.data;
  return (
    <>
      <StatusPill tone="success">
        {displayName ?? principalId ?? <Message id="shell.session.signedIn" />}
      </StatusPill>
      <Button
        variant="ghost"
        size="sm"
        disabled={signOut.isPending}
        onClick={() => {
          signOut.mutate(csrfToken);
        }}
      >
        <Message id="shell.session.signOut" />
      </Button>
    </>
  );
}
