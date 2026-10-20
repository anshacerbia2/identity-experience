import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { json, renderApp, stubFetch, type Sent } from '@/test/render-app';

// TDD-identity-experience-003 1.32.0 §The Bootstrap Ceremony's Review: the record is read, and a review
// is offered to an independent provider only (STD-IAM-001 2.9.0 §3.10).

const reviewerPrincipal = '01a0da74-44e7-7000-b600-b464c5cb8cec';
const firstPrincipal = '0192f0e0-3333-7000-8000-000000000001';

const signedIn = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  authenticated: true,
  principalId: reviewerPrincipal,
  displayName: 'Rina Reviewer',
  acr: '2',
  authTime: null,
  idleExpiresAt: '2026-10-20T10:30:00Z',
  absoluteExpiresAt: '2026-10-20T18:00:00Z',
  csrfToken: 'csrf-from-the-session',
  ...overrides,
});

const ceremony = (reviews: readonly unknown[] = []) => ({
  operator: 'Oscar Operator',
  witness: 'Wendy Witness',
  reason: 'First provider for the development estate, CHG-1',
  principal_id: firstPrincipal,
  requested_at: '2026-10-20T08:00:00Z',
  reviewed: reviews.length > 0,
  reviews,
});

function api(
  session: unknown,
  record: unknown,
  command?: (sent: Sent) => Response | undefined,
): { readonly sent: Sent[] } {
  return stubFetch((url, sent) => {
    if (url.pathname === '/auth/session') {
      return json(session);
    }
    if (sent.method === 'POST') {
      return command?.(sent);
    }
    if (url.pathname === '/api/v1/bootstrap-ceremony') {
      return record === null
        ? json({ type: 'https://problems.scnehaux.com/not-found', status: 404 }, 404)
        : json(record);
    }
    return undefined;
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('CeremonyPage', () => {
  it('shows the record, says it is not reviewed, and offers an independent provider the review', async () => {
    api(signedIn(), ceremony());
    const { container } = renderApp('/ceremony');
    expect(await screen.findByText('Not reviewed yet')).toBeInTheDocument();
    expect(screen.getByText('Oscar Operator')).toBeInTheDocument();
    expect(screen.getByText('Wendy Witness')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: firstPrincipal })).toHaveAttribute(
      'href',
      `/principals/${firstPrincipal}`,
    );
    expect(screen.getByText('Nobody has reviewed the record yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record review' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('records a review with the statement as the reason and an Idempotency-Key', async () => {
    const review = {
      review_id: '0192f0e0-8888-7000-8000-000000000001',
      reviewer: 'Rina Reviewer',
      reviewer_principal_id: reviewerPrincipal,
      outcome: 'findings',
      statement: 'Witness signature missing from the paper log.',
      reviewed_at: '2026-10-20T09:00:00Z',
    };
    const { sent } = api(signedIn(), ceremony(), () => json(review, 201));
    const { container } = renderApp('/ceremony');
    await userEvent.click(await screen.findByRole('button', { name: 'Record review' }));
    const panel = screen
      .getByRole('heading', { name: 'Record a review of the ceremony' })
      .closest('section') as HTMLElement;
    expect(within(panel).getByRole('textbox', { name: /Reviewer/ })).toHaveValue('Rina Reviewer');
    await userEvent.selectOptions(within(panel).getByRole('combobox', { name: 'Outcome' }), 'findings');
    await userEvent.type(
      within(panel).getByRole('textbox', { name: /Reason/ }),
      'Witness signature missing from the paper log.',
    );
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(within(panel).getByRole('button', { name: 'Record the review' }));
    expect(await screen.findByText('The review is recorded.')).toBeInTheDocument();

    const [request] = sent.filter((entry) => entry.method === 'POST');
    expect(request?.url.pathname).toBe('/api/v1/bootstrap-ceremony:review');
    expect(request?.body).toEqual({ reviewer: 'Rina Reviewer', outcome: 'findings' });
    expect(request?.headers['x-administrative-reason']).toBe('Witness signature missing from the paper log.');
    expect(request?.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('refuses the operator’s or the witness’s name as the reviewer before anything is sent', async () => {
    const { sent } = api(signedIn(), ceremony());
    renderApp('/ceremony');
    await userEvent.click(await screen.findByRole('button', { name: 'Record review' }));
    const reviewer = screen.getByRole('textbox', { name: /Reviewer/ });
    await userEvent.clear(reviewer);
    await userEvent.type(reviewer, '  wendy witness ');
    await userEvent.type(
      screen.getByRole('textbox', { name: /Reason/ }),
      'Read against the runbook evidence.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Record the review' }));
    expect(
      await screen.findByText(
        'This is the witness’s name. An independent person reviews the record, not the witness.',
      ),
    ).toBeInTheDocument();
    expect(sent.filter((entry) => entry.method === 'POST')).toHaveLength(0);
  });

  it('shows the API’s refusal when it finds the reviewer is not independent', async () => {
    api(signedIn(), ceremony(), () =>
      json(
        {
          type: 'https://problems.scnehaux.com/state-transition-refused',
          title: 'State transition refused',
          status: 409,
          detail:
            'The reviewer is the ceremony’s operator, its witness or the first Principal; an independent person reviews the record',
        },
        409,
      ),
    );
    renderApp('/ceremony');
    await userEvent.click(await screen.findByRole('button', { name: 'Record review' }));
    await userEvent.type(
      screen.getByRole('textbox', { name: /Reason/ }),
      'Read against the runbook evidence.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Record the review' }));
    expect(await screen.findByText(/an independent person reviews the record/)).toBeInTheDocument();
  });

  it.each([
    ['the first Principal’s holder', { principalId: firstPrincipal }, /You hold the first Principal/],
    ['the operator', { displayName: 'oscar operator' }, /You ran the ceremony as its operator/],
    ['the witness', { displayName: 'Wendy Witness' }, /You witnessed the ceremony/],
  ])('offers no review to %s, and says why', async (_who, overrides, why) => {
    api(signedIn(overrides), ceremony());
    renderApp('/ceremony');
    expect(await screen.findByText(why)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record review' })).not.toBeInTheDocument();
  });

  it('lists each review with its outcome and who recorded it', async () => {
    api(
      signedIn(),
      ceremony([
        {
          review_id: '0192f0e0-8888-7000-8000-000000000001',
          reviewer: 'Sam Security',
          reviewer_principal_id: '0192f0e0-3333-7000-8000-000000000009',
          outcome: 'satisfactory',
          statement: 'Record matches the runbook evidence.',
          reviewed_at: '2026-10-20T09:00:00Z',
        },
      ]),
    );
    renderApp('/ceremony');
    const table = await screen.findByRole('table', { name: 'Reviews of the ceremony record, oldest first' });
    expect(within(table).getByText('Sam Security')).toBeInTheDocument();
    expect(within(table).getByText('Satisfactory')).toBeInTheDocument();
    expect(screen.getByText('Reviewed once')).toBeInTheDocument();
  });

  it('says when no ceremony is on record', async () => {
    api(signedIn(), null);
    renderApp('/ceremony');
    expect(await screen.findByText(/No bootstrap ceremony is on record/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record review' })).not.toBeInTheDocument();
  });
});
