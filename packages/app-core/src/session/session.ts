import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useRouterState } from '@tanstack/react-router';

// The browser side of the BFF session (TDD-identity-experience-001). The browser never sees a
// token: it knows whether it is signed in, what to display, and the CSRF token it echoes on a
// state-changing request. The cookie itself is HttpOnly and out of reach.

export type Session =
  | { readonly authenticated: false }
  | {
      readonly authenticated: true;
      readonly principalId: string | null;
      readonly displayName: string | null;
      readonly acr: string | null;
      readonly authTime: string | null;
      readonly idleExpiresAt: string;
      readonly absoluteExpiresAt: string;
      readonly csrfToken: string;
    };

export const sessionQueryKey = ['session'] as const;

// The header the BFF compares against the session's token (bff/src/http/csrf.ts).
export const csrfHeader = 'x-csrf-token';

async function fetchSession(): Promise<Session> {
  const response = await fetch('/auth/session', {
    credentials: 'same-origin',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`the session could not be read: ${String(response.status)}`);
  }
  return (await response.json()) as Session;
}

export function useSession() {
  return useQuery({ queryKey: sessionQueryKey, queryFn: fetchSession, staleTime: 60_000 });
}

// signInHref starts a sign-in that returns here. The BFF accepts only a path on its own origin.
export const signInHref = (returnTo: string): string =>
  `/auth/login?return_to=${encodeURIComponent(returnTo)}`;

// useHere is the path a sign-in returns to: where the browser is, on this origin. The router's own
// location leaves out the base path an application is served under (/developer/ for the Developer
// Console), and a sign-in returning without it would land in another application.
export function useHere(): string {
  const basepath = useRouter().basepath.replace(/\/+$/, '');
  const href = useRouterState({ select: (state) => state.location.href });
  return `${basepath}${href}`;
}

// useSignOut ends the session. The BFF ends the identity kernel's session server-side, so there
// is nowhere to redirect: the page reloads signed out.
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (csrfToken: string): Promise<void> => {
      const response = await fetch('/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { [csrfHeader]: csrfToken },
      });
      // 401: the session had already ended, which is the outcome asked for.
      if (!response.ok && response.status !== 401) {
        throw new Error(`sign-out failed: ${String(response.status)}`);
      }
    },
    onSettled: async () => {
      queryClient.clear();
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
  });
}
