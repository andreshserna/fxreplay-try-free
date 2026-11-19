const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LENGTH = 10;
const RANDOM_LENGTH = 16;

/**
 * A ULID: 48 bits of time, then 80 random bits, in Crockford base 32.
 * Ids sort by creation time, which is what key-based pagination needs.
 */
export function ulid(now: number = Date.now()): string {
  let time = '';
  let remaining = now;
  for (let index = 0; index < TIME_LENGTH; index += 1) {
    time = ALPHABET.charAt(remaining % 32) + time;
    remaining = Math.floor(remaining / 32);
  }
  let random = '';
  for (const byte of crypto.getRandomValues(new Uint8Array(RANDOM_LENGTH))) {
    random += ALPHABET.charAt(byte % 32);
  }
  return time + random;
}

export const USER_ID_PATTERN = /^usr_[0-9A-HJKMNP-TV-Z]{26}$/;
export const newUserId = (now?: number): string => `usr_${ulid(now)}`;
