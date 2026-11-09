/**
 * Key format: APL-XXXX-XXXX-XXXX over a 32 character alphabet without 0/1/I/O.
 * 12 characters = 60 bits of entropy, which is enough for a 24h free key that
 * is rate limited to a handful of guesses per minute per IP.
 */
export const KEY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const GROUP_COUNT = 3;
const GROUP_SIZE = 4;

const KEY_PATTERN = /^APL(?:-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/;

export function generateKey(): string {
  const bytes = new Uint8Array(GROUP_COUNT * GROUP_SIZE);
  crypto.getRandomValues(bytes);

  const groups: string[] = [];
  for (let group = 0; group < GROUP_COUNT; group += 1) {
    let text = "";
    for (let index = 0; index < GROUP_SIZE; index += 1) {
      text += KEY_ALPHABET[bytes[group * GROUP_SIZE + index] % KEY_ALPHABET.length];
    }
    groups.push(text);
  }

  return `APL-${groups.join("-")}`;
}

/** Accepts "apl 1234abcd..." and returns the canonical APL-XXXX-XXXX-XXXX form. */
export function canonicalKey(raw: string): string | null {
  const compact = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = compact.startsWith("APL") ? compact.slice(3) : compact;
  if (body.length !== GROUP_COUNT * GROUP_SIZE) {
    return null;
  }

  const candidate = `APL-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
  return KEY_PATTERN.test(candidate) ? candidate : null;
}

/** Short, non-secret handle shown in admin lists: "APL-XXXX". */
export function keyPrefix(canonical: string): string {
  return canonical.slice(0, 8);
}
