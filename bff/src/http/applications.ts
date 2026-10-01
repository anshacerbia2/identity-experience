// The browser applications this process serves, by the path each is mounted at. The Admin Portal
// is at the root; the Developer Console is under /developer/ (TDD-identity-experience-004
// §Delivery). Both are the same origin, so the session cookie, the content security policy and the
// API proxy are the same for each.

export const developerPrefix = '/developer/';

// isDeveloperPath is whether a path, with or without its query, belongs to the Developer Console:
// /developer, or anything under /developer/.
export function isDeveloperPath(url: string): boolean {
  const pathname = url.split(/[?#]/, 1)[0] ?? '';
  return pathname === developerPrefix.slice(0, -1) || pathname.startsWith(developerPrefix);
}

// applicationRoot is the root of the application a path belongs to.
export const applicationRoot = (url: string): string => (isDeveloperPath(url) ? developerPrefix : '/');
