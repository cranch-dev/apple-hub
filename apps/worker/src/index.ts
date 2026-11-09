import { D1Store } from "./adapters/d1-store";
import { createApp } from "./app";
import type { Env } from "./env";

const app = createApp({ getStore: (env) => new D1Store(env.DB) });

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response> {
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<Env>;
