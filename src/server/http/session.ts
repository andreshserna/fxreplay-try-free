/**
 * The session issued when a user is created. It authorizes one thing: updating that
 * user's profile. The value is `<user id>.<expiry in seconds>.<HMAC-SHA256>`.
 */
export const SESSION_COOKIE = '__Host-session';
export const SESSION_TTL_SECONDS = 60 * 60;

const encoder = new TextEncoder();

const toBase64Url = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

const hmacKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);

/** The HMAC-SHA256 of a message under the server's secret, in base64url. */
export async function sign(secret: string, message: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(message));
  return toBase64Url(mac);
}

export async function signSession(
  secret: string,
  userId: string,
  expiresAt: number,
): Promise<string> {
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${await sign(secret, payload)}`;
}

/** Returns the user id the session was issued for, or null if it is forged or expired. */
export async function verifySession(
  secret: string,
  value: string,
  nowSeconds: number,
): Promise<string | null> {
  const [userId, expires, mac, ...extra] = value.split('.');
  if (!userId || !expires || !mac || extra.length > 0) return null;
  const signature = fromBase64Url(mac);
  if (!signature) return null;
  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    signature,
    encoder.encode(`${userId}.${expires}`),
  );
  if (!valid) return null;
  const expiresAt = Number(expires);
  return Number.isInteger(expiresAt) && expiresAt > nowSeconds ? userId : null;
}

export const sessionCookie = (value: string): string =>
  `${SESSION_COOKIE}=${value}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;

export function readCookie(header: string | null, name: string): string | null {
  for (const part of (header ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}
