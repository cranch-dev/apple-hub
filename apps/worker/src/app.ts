import { Hono } from "hono";
import type { AppEnv } from "./app-env";
import type { Store } from "./domain/store";
import type { Env } from "./env";
import { adminRoutes } from "./routes/admin";
import { handleDiscord } from "./routes/discord";
import {
  handleHealth,
  handleHubCore,
  handleLoader,
  handleManifest,
  handleModule,
  handleRoot,
  handleWindUI,
} from "./routes/static";
import { handleValidate } from "./routes/validate";

export interface AppDeps {
  getStore: (env: Env) => Store;
  now?: () => number;
}

export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>();
  const now = deps.now ?? (() => Date.now());

  app.use("*", async (c, next) => {
    c.set("store", deps.getStore(c.env));
    c.set("now", now);
    await next();
  });

  app.get("/", handleRoot);
  app.get("/health", handleHealth);
  app.get("/loader", handleLoader);
  app.get("/loader.luau", handleLoader);

  app.get("/v1/manifest", handleManifest);
  app.get("/v1/hub", handleHubCore);
  app.get("/v1/modules/:file", handleModule);
  app.get("/vendor/windui.lua", handleWindUI);

  app.post("/v1/validate", handleValidate);
  app.route("/v1/admin", adminRoutes);
  app.post("/discord/interactions", handleDiscord);

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((error, c) => {
    console.error("unhandled", error);
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}
