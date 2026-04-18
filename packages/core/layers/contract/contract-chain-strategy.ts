import { TentaclesError } from "../shared/tentacles-error";

/**
 * Internal operations that contract utilities (pick, omit, partial, required)
 * need from any contract chain. Hidden from the public API via a WeakMap
 * registry — nothing leaks onto the chain instance.
 */
export interface ChainOps {
  entityNames(): string[];
  createEmpty(): object;
  copyEntities(source: object, names: Set<string>): void;
  copyAll(source: object): void;
  applyPartial?(source: object): void;
  applyRequired?(source: object): void;
  validateRefs(dropDangling: boolean): void;
}

const registry = new WeakMap<object, ChainOps>();

/** @internal Register a chain's ops (called from chain constructors) */
export function registerChainOps(chain: object, ops: ChainOps): void {
  registry.set(chain, ops);
}

/** @internal Retrieve a chain's ops (called from contract utilities) */
export function getChainOps(chain: object): ChainOps {
  const ops = registry.get(chain);
  if (!ops) throw new TentaclesError("Contract utility: unsupported chain type");
  return ops;
}
