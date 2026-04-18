import { TentaclesError } from "../shared/tentacles-error";
import type { ModelContractChain } from "./contract-chain";
import { getChainOps } from "./contract-chain-strategy";
import type { PropsContractChainImpl } from "./props-contract-chain";
import type { ViewContractChain } from "./view-contract-chain";

function parseArgs(args: unknown[]): { keys: Set<string>; dropDangling: boolean } {
  let dropDangling = false;
  const keys = new Set<string>();
  for (const arg of args) {
    if (typeof arg === "string") keys.add(arg);
    else if (arg && typeof arg === "object")
      dropDangling = !!(arg as { dropDangling?: boolean }).dropDangling;
  }
  return { keys, dropDangling };
}

/** Create contract based on selected parts of another contract */
export function pick<C extends ModelContractChain<any, any, any, any>>(
  chain: C,
  ...args: Array<string | { dropDangling?: boolean }>
): C;
export function pick<C extends ViewContractChain<any, any, any>>(
  chain: C,
  ...args: Array<string | { dropDangling?: boolean }>
): C;
export function pick<C extends PropsContractChainImpl<any>>(chain: C, ...keys: string[]): C;
export function pick<C>(chain: C, ...args: Array<string | { dropDangling?: boolean }>): C;
export function pick(chain: object, ...args: unknown[]): unknown {
  const ops = getChainOps(chain);
  const { keys, dropDangling } = parseArgs(args);
  const result = ops.createEmpty();
  getChainOps(result).copyEntities(chain, keys);
  getChainOps(result).validateRefs(dropDangling);
  return result;
}

/** Create contract based on another contract and omit some fields in it */
export function omit<C extends ModelContractChain<any, any, any, any>>(
  chain: C,
  ...args: Array<string | { dropDangling?: boolean }>
): C;
export function omit<C extends ViewContractChain<any, any, any>>(
  chain: C,
  ...args: Array<string | { dropDangling?: boolean }>
): C;
export function omit<C extends PropsContractChainImpl<any>>(chain: C, ...keys: string[]): C;
export function omit<C>(chain: C, ...args: Array<string | { dropDangling?: boolean }>): C;
export function omit(chain: object, ...args: unknown[]): unknown {
  const ops = getChainOps(chain);
  const { keys: omitKeys, dropDangling } = parseArgs(args);
  const keepKeys = new Set(ops.entityNames().filter((n) => !omitKeys.has(n)));
  const result = ops.createEmpty();
  getChainOps(result).copyEntities(chain, keepKeys);
  getChainOps(result).validateRefs(dropDangling);
  return result;
}

/** Create contract based on another contract and make all contract fields non-required */
export function partial<C extends ModelContractChain<any, any, any, any>>(chain: C): C;
export function partial<C extends ViewContractChain<any, any, any>>(chain: C): C;
export function partial<C extends PropsContractChainImpl<any>>(chain: C): C;
export function partial<C>(chain: C): C;
export function partial(chain: object): unknown {
  const ops = getChainOps(chain);
  const result = ops.createEmpty();
  const resultOps = getChainOps(result);
  if (!resultOps.applyPartial)
    throw new TentaclesError("partial: not supported by this chain type");
  resultOps.applyPartial(chain);
  return result;
}

/** Create contract based on another contract and make all contract fields required */
export function required<C extends ModelContractChain<any, any, any, any>>(chain: C): C;
export function required<C extends ViewContractChain<any, any, any>>(chain: C): C;
export function required<C extends PropsContractChainImpl<any>>(chain: C): C;
export function required<C>(chain: C): C;
export function required(chain: object): unknown {
  const ops = getChainOps(chain);
  const result = ops.createEmpty();
  const resultOps = getChainOps(result);
  if (!resultOps.applyRequired)
    throw new TentaclesError("required: not supported by this chain type");
  resultOps.applyRequired(chain);
  return result;
}

/** Create new contract based on two contracts */
export function merge<
  A extends ModelContractChain<any, any, any, any>,
  B extends ModelContractChain<any, any, any, any>,
>(a: A, b: B): A;
export function merge<
  A extends ViewContractChain<any, any, any>,
  B extends ViewContractChain<any, any, any>,
>(a: A, b: B): A;
export function merge<A extends PropsContractChainImpl<any>, B extends PropsContractChainImpl<any>>(
  a: A,
  b: B,
): A;
export function merge<A, B>(a: A, b: B): A;
export function merge(a: object, b: object): unknown {
  const opsA = getChainOps(a);
  const opsB = getChainOps(b);

  const namesA = new Set(opsA.entityNames());
  for (const name of opsB.entityNames()) {
    if (namesA.has(name)) {
      throw new TentaclesError(`merge: field "${name}" exists in both contracts`);
    }
  }

  const result = opsA.createEmpty();
  const resultOps = getChainOps(result);
  resultOps.copyAll(a);
  resultOps.copyAll(b);
  return result;
}
