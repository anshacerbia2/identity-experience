import { createRootRoute, Outlet } from '@tanstack/react-router';

import { AppShell } from '@/features/shell/AppShell';

// Routes are thin: a route file names a path and hands it to a feature (STD-GLB-FE-001 §3).
export const Route = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
