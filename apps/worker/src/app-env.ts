import type { Store } from "./domain/store";
import type { Env } from "./env";

export interface AppEnv {
  Bindings: Env;
  Variables: {
    store: Store;
    now: () => number;
  };
}
