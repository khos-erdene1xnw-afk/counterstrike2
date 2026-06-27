import 'server-only';

/**
 * Strict Steam OpenID 2.0 verification helpers.
 * We re-POST the assertion to Steam with mode=check_authentication and require
 * an exact `is_valid:true`, and we validate the claimed_id host to prevent
 * spoofed identity endpoints.
 */

const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const CLAIMED_ID_PREFIX = 'https://steamcommunity.com/openid/id/';

export function buildLoginUrl(realm: string, returnTo: string): string {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
    'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
  });
  return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
}

export async function verifyAssertion(query: Record<string, string>): Promise<string | null> {
  // Must be a positive assertion
  if (query['openid.mode'] !== 'id_res') return null;

  const claimedId = query['openid.claimed_id'] || '';
  if (!claimedId.startsWith(CLAIMED_ID_PREFIX)) return null;

  const steamId = claimedId.slice(CLAIMED_ID_PREFIX.length);
  if (!/^\d{17}$/.test(steamId)) return null;

  // Re-verify the assertion with Steam
  const verifyParams = new URLSearchParams({ ...query, 'openid.mode': 'check_authentication' });
  const res = await fetch(STEAM_OPENID_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verifyParams.toString(),
    cache: 'no-store',
  });
  if (!res.ok) return null;

  const text = await res.text();
  const valid = /is_valid\s*:\s*true/.test(text);
  return valid ? steamId : null;
}
