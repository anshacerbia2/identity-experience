import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { captureInvitationToken, forgetInvitationToken } from '@/core/invitation-fragment';
import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// TDD-identity-experience-001 1.24.0 §Enrolment From an Invitation: the page asks for a code, returns
// it, and shows the temporary password once; every answer is one sentence, and none tells an
// invitation that can be used from one that cannot.

const token = 'inv_9Qk2nV7xLr4ZpT8sWm3Yb6Hc';
const enrolmentId = '0192f0e0-9999-7000-8000-000000000001';
const temporaryPassword = 'K7QH2M9XRT4WZP6VDN3BC8FA';
const created = {
  principal_id: '0192f0e0-aaaa-7000-8000-000000000001',
  username: 'ada@example.com',
  temporary_password: temporaryPassword,
  lapses_at: '2026-10-22T09:00:00Z',
};

function holdToken(): void {
  captureInvitationToken(
    { pathname: '/account/enrol', search: '', hash: `#${token}` },
    { state: null, replaceState: () => undefined },
  );
}

function api(answers: { readonly request?: () => Response; readonly verify?: () => Response }): {
  readonly sent: Sent[];
} {
  return stubFetch((url) => {
    if (url.pathname === '/auth/session') {
      return json({ authenticated: false });
    }
    if (url.pathname === '/auth/enrolment') {
      return (answers.request ?? (() => json({ enrolment_id: enrolmentId }, 202)))();
    }
    if (url.pathname === '/auth/enrolment/verify') {
      return (answers.verify ?? (() => json(created, 201)))();
    }
    return undefined;
  });
}

const problem = (status: number, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify({ status, detail: 'from the server, never shown' }), {
    status,
    headers: { 'content-type': 'application/problem+json', ...headers },
  });

const enrolmentCalls = (sent: readonly Sent[]) =>
  sent.filter((request) => request.url.pathname.startsWith('/auth/enrolment'));

async function sendCode(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'Send me a code' }));
}

async function enterCode(code = '48213907'): Promise<void> {
  await userEvent.type(await screen.findByRole('textbox', { name: 'Code' }), code);
  await userEvent.click(screen.getByRole('button', { name: 'Create my account' }));
}

afterEach(() => {
  forgetInvitationToken();
  vi.unstubAllGlobals();
});

describe('EnrolmentPage', () => {
  it('asks for the invitation link when it holds no token, and sends nothing', async () => {
    const { sent } = api({});
    const { container } = renderApp('/account/enrol');
    expect(await screen.findByText('Open the link from your invitation')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Send me a code' })).toBeNull();
    expect(enrolmentCalls(sent)).toHaveLength(0);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('creates the account: the code is asked for, returned, and the temporary password shown once', async () => {
    holdToken();
    const { sent } = api({});
    const { container } = renderApp('/account/enrol');
    expect(await axe(container)).toHaveNoViolations();
    await sendCode();

    expect(
      await screen.findByText(
        'If this invitation can still be used, a code is on its way to the address it was sent to. It is good for 10 minutes.',
      ),
    ).toBeInTheDocument();
    const [request] = enrolmentCalls(sent);
    expect(request?.method).toBe('POST');
    expect(request?.body).toEqual({ token });
    expect(request?.headers['content-type']).toBe('application/json');
    expect(request?.headers['x-csrf-token']).toBeUndefined();
    expect(request?.headers['idempotency-key']).toBeUndefined();
    expect(await axe(container)).toHaveNoViolations();

    await enterCode('4821 3907');
    expect(await screen.findByText('Your account is ready')).toBeInTheDocument();
    const verify = enrolmentCalls(sent)[1];
    expect(verify?.url.pathname).toBe('/auth/enrolment/verify');
    expect(verify?.body).toEqual({ enrolment_id: enrolmentId, code: '48213907' });

    expect(screen.getByText(temporaryPassword)).toBeInTheDocument();
    expect(screen.getByText('ada@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue to sign in' })).toHaveAttribute(
      'href',
      '/auth/login?return_to=%2Faccount%2F',
    );
    // In the page's memory alone: no storage, and no URL, holds the password or the token.
    const stored = [window.sessionStorage, window.localStorage]
      .flatMap((storage) =>
        Array.from({ length: storage.length }, (_, index) => storage.getItem(storage.key(index) ?? '')),
      )
      .join(' ');
    expect(stored).not.toContain(temporaryPassword);
    expect(stored).not.toContain(token);
    expect(window.location.href).not.toContain(token);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('refuses a code that is not 8 digits without sending it', async () => {
    holdToken();
    const { sent } = api({});
    renderApp('/account/enrol');
    await sendCode();
    await enterCode('4821');
    expect(await screen.findByText('The code is 8 digits.')).toBeInTheDocument();
    expect(enrolmentCalls(sent)).toHaveLength(1);
  });

  it('answers a refused code with the one sentence, and starts again from the link', async () => {
    holdToken();
    const { sent } = api({ verify: () => problem(400) });
    renderApp('/account/enrol');
    await sendCode();
    await enterCode();
    expect(
      await screen.findByText(
        'The code is wrong, has expired, or has been tried too often. Start again from the invitation link.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/from the server/)).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Start again' }));
    await sendCode();
    expect(enrolmentCalls(sent).filter((request) => request.url.pathname === '/auth/enrolment')).toHaveLength(
      2,
    );
  });

  it.each([
    [
      problem(429, { 'retry-after': '120' }),
      'Too many requests came from your network. Try again in 2 minutes.',
    ],
    [problem(400), 'This link cannot be used. Ask the person who invited you for a new one.'],
    [problem(503), 'Codes cannot be sent right now. Try again in a few minutes.'],
  ])('says one sentence for a request answered %#', async (answer, sentence) => {
    holdToken();
    api({ request: () => answer });
    renderApp('/account/enrol');
    await sendCode();
    expect(await screen.findByText(sentence)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send me a code' })).toBeInTheDocument();
  });

  it.each([
    [
      problem(429, { 'retry-after': '30' }),
      'Too many codes were tried from your network. Try again in 1 minute.',
    ],
    [
      problem(503),
      'Your account cannot be created right now. Your code stays good for its 10 minutes: try it again shortly.',
    ],
  ])('says one sentence for a verification answered %#', async (answer, sentence) => {
    holdToken();
    api({ verify: () => answer });
    renderApp('/account/enrol');
    await sendCode();
    await enterCode();
    expect(await screen.findByText(sentence)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Code' })).toBeInTheDocument();
  });
});
