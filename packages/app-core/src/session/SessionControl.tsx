import type { ReactElement } from 'react';

import { Button, Icon, StatusPill } from '@identity-experience/ui';

import { signInHref, useHere, useSession, useSignOut } from './session';
import { CoreMessage } from '../i18n/CoreMessage';

// The account security experience's root, served by the same BFF.
const accountRoot = '/account/';

// SessionControl states who is signed in and offers the one action that applies: sign in, or
// sign out. Signing in is a full navigation to the BFF, never a fetch: the identity kernel's
// hosted page is where credentials are entered.
export function SessionControl(): ReactElement {
  const session = useSession();
  const signOut = useSignOut();
  const here = useHere();

  if (session.isPending) {
    return (
      <StatusPill tone="neutral">
        <CoreMessage id="shell.session.checking" />
      </StatusPill>
    );
  }
  if (session.isError) {
    return (
      <StatusPill tone="danger">
        <CoreMessage id="shell.session.unavailable" />
      </StatusPill>
    );
  }
  if (!session.data.authenticated) {
    return (
      <Button href={signInHref(here)} size="sm" icon={<Icon name="key" />}>
        <CoreMessage id="shell.session.signIn" />
      </Button>
    );
  }

  const { displayName, principalId, csrfToken } = session.data;
  return (
    <>
      <StatusPill tone="success">
        {displayName ?? principalId ?? <CoreMessage id="shell.session.signedIn" />}
      </StatusPill>
      {/* Every person's own account security, a separate application (TDD-identity-experience-002
          §Delivery). Not offered from inside it. */}
      {here.startsWith(accountRoot) ? null : (
        <Button variant="ghost" size="sm" href={accountRoot} icon={<Icon name="shield" />}>
          <CoreMessage id="shell.session.account" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={signOut.isPending}
        onClick={() => {
          signOut.mutate(csrfToken);
        }}
      >
        <CoreMessage id="shell.session.signOut" />
      </Button>
    </>
  );
}
