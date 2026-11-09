import { describe, expect, test } from "bun:test";
import { canonicalKey, generateKey, keyPrefix, KEY_ALPHABET } from "../src/lib/keys";

describe("key format", () => {
  test("generates APL-XXXX-XXXX-XXXX keys", () => {
    for (let index = 0; index < 200; index += 1) {
      expect(generateKey()).toMatch(/^APL(-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}){3}$/);
    }
  });

  test("generated keys are unique", () => {
    const keys = new Set(Array.from({ length: 1000 }, () => generateKey()));
    expect(keys.size).toBe(1000);
  });

  test("alphabet excludes ambiguous characters", () => {
    for (const ambiguous of ["0", "1", "I", "O"]) {
      expect(KEY_ALPHABET.includes(ambiguous)).toBe(false);
    }
  });

  test("canonicalizes lowercase, spaces and missing prefix", () => {
    const key = generateKey();
    const body = key.slice(4).replaceAll("-", "");
    expect(canonicalKey(`  apl ${body.toLowerCase()} `)).toBe(key);
    expect(canonicalKey(body)).toBe(key);
  });

  test("rejects wrong length and ambiguous characters", () => {
    expect(canonicalKey("APL-ABCD")).toBeNull();
    expect(canonicalKey("APL-0000-0000-0000")).toBeNull();
    expect(canonicalKey("APL-IIII-IIII-IIII")).toBeNull();
    expect(canonicalKey("")).toBeNull();
  });

  test("prefix is the first group", () => {
    expect(keyPrefix("APL-7F3K-9Q2M-ABCD")).toBe("APL-7F3K");
  });
});
