import { useRouterState } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { Icon } from '@identity-experience/ui';

import styles from './SignInNotice.module.scss';
import type { CoreMessageKey } from '../i18n/core-messages';
import { CoreMessage } from '../i18n/CoreMessage';

const signInNotices: ReadonlyMap<string, CoreMessageKey> = new Map<string, CoreMessageKey>([
  ['failed', 'shell.session.signInFailed'],
  ['unavailable', 'shell.session.signInUnavailable'],
]);

// SignInNotice says that a sign-in did not complete. The BFF lands a failed sign-in on the
// application it started from, with ?sign-in=failed when it was refused and ?sign-in=unavailable
// when Keycloak did not answer; why stays in its log. Only the second is worth simply trying again,
// so the two read differently.
export function SignInNotice(): ReactElement | null {
  const signIn = useRouterState({
    select: (state) => new URLSearchParams(state.location.searchStr).get('sign-in'),
  });
  const notice = signInNotices.get(signIn ?? '');
  if (notice === undefined) {
    return null;
  }
  return (
    <p className={styles['notice']} role="alert">
      <Icon name="alert" />
      <CoreMessage id={notice} />
    </p>
  );
}
