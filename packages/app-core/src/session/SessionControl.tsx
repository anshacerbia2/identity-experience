import type { ReactElement } from 'react';

import { Button, ButtonBase, Icon, StatusPill } from '@identity-experience/ui';

import { signInHref, useHere, useSession, useSignOut } from './session';
import styles from './SessionControl.module.scss';
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
      <span className={styles['cell']}>
        <StatusPill tone="neutral">
          <CoreMessage id="shell.session.checking" />
        </StatusPill>
      </span>
    );
  }
  if (session.isError) {
    return (
      <span className={styles['cell']}>
        <StatusPill tone="danger">
          <CoreMessage id="shell.session.unavailable" />
        </StatusPill>
      </span>
    );
  }
  if (!session.data.authenticated) {
    return (
      <span className={styles['cell']}>
        <Button href={signInHref(here)} size="small">
          <Icon name="key" />
          <CoreMessage id="shell.session.signIn" />
        </Button>
      </span>
    );
  }

  const { displayName, principalId, csrfToken } = session.data;
  return (
    <>
      <span className={`${styles['cell']} ${styles['who']}`}>
        {displayName ?? principalId ?? <CoreMessage id="shell.session.signedIn" />}
      </span>
      {/* Every person's own account security, a separate application (TDD-identity-experience-002
          §Delivery). Not offered from inside it. */}
      {here.startsWith(accountRoot) ? null : (
        <ButtonBase href={accountRoot} className={styles['action'] ?? ''}>
          <CoreMessage id="shell.session.account" />
        </ButtonBase>
      )}
      <ButtonBase
        className={styles['action'] ?? ''}
        disabled={signOut.isPending}
        onClick={() => {
          signOut.mutate(csrfToken);
        }}
      >
        <CoreMessage id="shell.session.signOut" />
      </ButtonBase>
    </>
  );
}
