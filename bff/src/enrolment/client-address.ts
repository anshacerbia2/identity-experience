import { BlockList, isIP } from 'node:net';

// The client address the BFF states to identity-control on the enrolment routes (ADR-IAM-011 §5.8,
// amended 2026-10-21; TDD-identity-experience-001 1.24.0 §The Client Address).
//
// It is the address of the TCP connection the platform's own edge accepted. When nothing is in front
// of this process, that edge is this process, and the address is the connection's. When one ingress is
// in front, the connection is the ingress's, and the ingress states the client's address in
// X-Forwarded-For, having replaced whatever a client sent. That one hop is trusted and nothing behind
// it: RFC 7239 §8.1 says the header "cannot be relied upon to be correct, as it may be modified,
// whether mistakenly or for malicious reasons, by every node on the way to the server". A header on
// a connection from anywhere else is never read, so a browser cannot choose the limit's key.

// ingressList builds the set of addresses the one trusted ingress connects from: one address, or one
// CIDR range. config.ts has already refused anything else.
export function ingressList(range: string): BlockList {
  const list = new BlockList();
  const [address = '', prefix] = range.split('/');
  const family = isIP(address) === 6 ? 'ipv6' : 'ipv4';
  if (prefix === undefined) {
    list.addAddress(address, family);
  } else {
    list.addSubnet(address, Number(prefix), family);
  }
  return list;
}

// normalized writes an IPv4-mapped IPv6 address, which a dual-stack socket reports for an IPv4
// client, as the IPv4 address it is; an IPv6 zone is dropped. Anything that is not an address is null.
export function normalized(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const bare = value.trim().replace(/%.*$/, '');
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(bare);
  const address = mapped?.[1] ?? bare;
  return isIP(address) === 0 ? null : address;
}

const familyOf = (address: string): 'ipv4' | 'ipv6' => (isIP(address) === 6 ? 'ipv6' : 'ipv4');

// clientAddress is the client's address, or null when the trusted ingress connected and did not state
// exactly one: a misconfigured ingress, which no request can repair.
export function clientAddress(
  peer: string | undefined,
  forwardedFor: string | string[] | undefined,
  ingress: BlockList | null,
): string | null {
  const connection = normalized(peer);
  if (connection === null) {
    return null;
  }
  if (ingress === null || !ingress.check(connection, familyOf(connection))) {
    return connection;
  }
  // The ingress overwrites the header, so it names one address: the one it accepted. A list, or a
  // second header, is a header the ingress passed through, and is not trusted.
  if (typeof forwardedFor !== 'string' || forwardedFor.includes(',')) {
    return null;
  }
  return normalized(forwardedFor);
}

// forwardedFor is the RFC 7239 element the BFF sends identity-control. §5.2: "The "for" parameter is
// used to disclose information about the client that initiated the request". §6: "an IPv6 address
// and any nodename with node-port specified MUST be quoted", in brackets.
export const forwardedFor = (address: string): string =>
  isIP(address) === 6 ? `for="[${address}]"` : `for=${address}`;
