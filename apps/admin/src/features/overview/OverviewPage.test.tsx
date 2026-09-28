import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWithIntl } from '@/test/render';

import { OverviewPage } from './OverviewPage';

describe('OverviewPage', () => {
  it('has one level-one heading and a card per surface', () => {
    renderWithIntl(<OverviewPage />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Every identity, accounted for.' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
  });

  it('shows no figure it did not measure', () => {
    renderWithIntl(<OverviewPage />);
    expect(document.body.textContent).not.toMatch(/\d+\s*(%|ms|clients|principals)/i);
  });

  it('renders in Indonesian from the same catalogue', () => {
    renderWithIntl(<OverviewPage />, 'id');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Setiap identitas, tercatat.' }),
    ).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWithIntl(<OverviewPage />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
