import { describe, expect, it } from 'vitest';

import { normalizeReason, reasonProblem } from './reason';

describe('administrative reasons', () => {
  it('become one line, since they travel in a header', () => {
    expect(normalizeReason('  first line\n\nsecond\tline  ')).toBe('first line second line');
  });

  it('are refused when too short, too long, or outside what a header carries', () => {
    expect(reasonProblem('too short')).toBe('short');
    expect(reasonProblem('          x          ')).toBe('short');
    expect(reasonProblem('x'.repeat(501))).toBe('long');
    expect(reasonProblem('Approved by the on-call ✅')).toBe('characters');
    expect(reasonProblem('Disetujui oleh tim on-call, tiket OPS-42.')).toBeNull();
    expect(reasonProblem('Café réseau approuvé, ticket 42')).toBeNull();
  });
});
