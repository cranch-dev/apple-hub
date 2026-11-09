import type { Context } from "hono";
import type { AppEnv } from "./app-env";

export async function readJson(c: Context<AppEnv>): Promise<Record<string, unknown> | null> {
  try {
    const value = await c.req.json();
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function asString(value: unknown, maxLength = 512): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null;
  }
  return trimmed;
}

export function asInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Math.trunc(value);
}
