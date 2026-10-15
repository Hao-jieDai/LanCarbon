import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
const queues = new Map<string, Promise<unknown>>();
const context = new AsyncLocalStorage<string>();
/** The starter-content synchronizer and all resource mutations share one reentrant catalog lock. */
export function withAssetCatalog<T>(root: string, action: () => Promise<T>): Promise<T> {
  const key = path.resolve(root).toLocaleLowerCase();
  if (context.getStore() === key) return action();
  const pending = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(() => context.run(key, action));
  queues.set(key, pending.catch(() => undefined)); return pending;
}
