import type { Context } from "hono";
import type { AppEnv } from "../app-env";
import { HUB_CORE, HUB_VERSION, LOADER, MANIFEST, MODULE_SHA, MODULES, WINDUI, WINDUI_SHA } from "../generated/hub";

const TEXT = "text/plain; charset=utf-8";

function matchesEtag(header: string | undefined, tag: string): boolean {
  if (!header) {
    return false;
  }
  return header
    .split(",")
    .map((value) => value.trim())
    .includes(tag);
}

export function handleRoot(c: Context<AppEnv>): Response {
  const origin = new URL(c.req.url).origin;
  return c.body(
    [
      "Apple Hub key service",
      "",
      `Loader : ${origin}/loader`,
      `Jalankan: loadstring(game:HttpGet("${origin}/loader"))()`,
      "",
      `Versi Hub: ${HUB_VERSION}`,
    ].join("\n"),
    200,
    { "Content-Type": TEXT, "Cache-Control": "no-store" },
  );
}

export function handleHealth(c: Context<AppEnv>): Response {
  return c.json({ ok: true, hub_version: HUB_VERSION });
}

export function handleLoader(c: Context<AppEnv>): Response {
  const origin = new URL(c.req.url).origin;
  return c.body(LOADER.replaceAll("__APPLEHUB_BASE__", origin), 200, {
    "Content-Type": TEXT,
    "Cache-Control": "no-store",
  });
}

export function handleHubCore(c: Context<AppEnv>): Response {
  const tag = `"hub-${HUB_VERSION}"`;
  if (matchesEtag(c.req.header("if-none-match"), tag)) {
    return c.body(null, 304, { ETag: tag });
  }
  return c.body(HUB_CORE, 200, {
    "Content-Type": TEXT,
    ETag: tag,
    "Cache-Control": "public, max-age=300",
  });
}

export function handleManifest(c: Context<AppEnv>): Response {
  const tag = `"hub-${HUB_VERSION}"`;
  if (matchesEtag(c.req.header("if-none-match"), tag)) {
    return c.body(null, 304, { ETag: tag });
  }
  return c.body(JSON.stringify(MANIFEST), 200, {
    "Content-Type": "application/json; charset=utf-8",
    ETag: tag,
    "Cache-Control": "public, max-age=300",
  });
}

export function handleModule(c: Context<AppEnv>): Response {
  const file = c.req.param("file") ?? "";
  const source = MODULES[file];
  if (!source) {
    return c.json({ error: "not_found" }, 404);
  }

  const tag = `"mod-${MODULE_SHA[file] ?? HUB_VERSION}"`;
  if (matchesEtag(c.req.header("if-none-match"), tag)) {
    return c.body(null, 304, { ETag: tag });
  }
  return c.body(source, 200, {
    "Content-Type": TEXT,
    ETag: tag,
    "Cache-Control": "public, max-age=300",
  });
}

export function handleWindUI(c: Context<AppEnv>): Response {
  const tag = `"windui-${WINDUI_SHA}"`;
  if (matchesEtag(c.req.header("if-none-match"), tag)) {
    return c.body(null, 304, { ETag: tag });
  }
  return c.body(WINDUI, 200, {
    "Content-Type": TEXT,
    ETag: tag,
    "Cache-Control": "public, max-age=86400",
  });
}
