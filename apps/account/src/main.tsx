// First, before the router reads the location: the enrolment page's invitation token leaves the
// address bar (core/invitation-fragment.ts, TDD-identity-experience-001 1.24.0).
import './core/invitation-fragment';
import '@identity-experience/ui/styles';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './app/App';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('index.html has no #root element');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
