import '@testing-library/jest-dom/vitest';

import { cleanup, configure } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

expect.extend(axeMatchers);

// A page's first render loads its route chunk, which a loaded CI runner takes longer than the
// default second to compile; a find* query waits up to five, and still fails on what never appears.
configure({ asyncUtilTimeout: 5_000 });

afterEach(() => {
  cleanup();
});
