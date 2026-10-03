// The browser applications this process serves, by the path each is mounted at. The Admin Portal
// is at the root; the Developer Console is under /developer/ (TDD-identity-experience-004
// §Delivery), and the account security experience under /account/ (TDD-identity-experience-002
// §Delivery). All are the same origin, so the session cookie, the content security policy and the
// API proxy are the same for each.

export const developerPrefix = '/developer/';

// isDeveloperPath is whether a path, with or without its query, belongs to the Developer Console:
// /developer, or anything under /developer/.
export function isDeveloperPath(url: string): boolean {
  const pathname = url.split(/[?#]/, 1)[0] ?? '';
  return pathname === developerPrefix.slice(0, -1) || pathname.startsWith(developerPrefix);
}

export const accountPrefix = '/account/';

// isAccountPath is whether a path belongs to the account security experience: /account, or
// anything under /account/.
export function isAccountPath(url: string): boolean {
  const pathname = url.split(/[?#]/, 1)[0] ?? '';
  return pathname === accountPrefix.slice(0, -1) || pathname.startsWith(accountPrefix);
}

// applicationRoot is the root of the application a path belongs to.
export const applicationRoot = (url: string): string =>
  isDeveloperPath(url) ? developerPrefix : isAccountPath(url) ? accountPrefix : '/';
