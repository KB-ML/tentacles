import { PropsContractChainImpl } from "../contract";
import {
  BaseContractChain,
  type BCDerived,
  type BCEvents,
  type BCStores,
} from "../contract/base-contract-chain";
import type { StoreMeta } from "../contract/types";
import type { AnyPropMeta } from "../contract/types/props-contract-chain";
import { detectSidRoot } from "../shared/detect-sid-root";
import { TentaclesError } from "../shared/tentacles-error";
import type { ExtractVMProps, ViewModelContext, ViewModelStores } from "./types";
import { ViewModelDefinition } from "./view-model-definition";

// Narrow helpers that constrain the extracted generics to the shapes the
// view model runtime expects. The base chain uses `Record<string, unknown>`
// for maximum flexibility, but view models specifically need `StoreMeta` on
// the stores accumulator.
type VMStores<CC> = BCStores<CC> extends Record<string, StoreMeta> ? BCStores<CC> : never;
type VMEvents<CC> = BCEvents<CC> extends Record<string, unknown> ? BCEvents<CC> : never;
type VMDerived<CC> = BCDerived<CC> extends Record<string, unknown> ? BCDerived<CC> : never;

/**
 * Create a view model from a pre-built contract chain and optional props
 * contract.
 *
 * Both `contract` and `props` accept **pre-built chain values only** — no
 * inline callbacks. Declaring contracts as named values up front makes them
 * reusable across multiple VMs, composable via `merge`/`pick`/`omit`, and
 * testable in isolation. The extra line of code per VM is worth the
 * uniformity with `.extend()`, which has the same rule.
 *
 * The contract may be a `ModelContractChain` or a `ViewContractChain` —
 * view models care only about stores/events/derived, and both chain types
 * expose those.
 */
export function createViewModel<
  CC extends BaseContractChain<any, any, any>,
  Props extends Record<string, AnyPropMeta> = {},
  R = ViewModelStores<VMStores<CC>, VMEvents<CC>, VMDerived<CC>>,
>(config: {
  contract: CC;
  name?: string;
  props?: PropsContractChainImpl<Props>;
  fn?: (
    stores: ViewModelStores<VMStores<CC>, VMEvents<CC>, VMDerived<CC>>,
    ctx: ViewModelContext<ExtractVMProps<Props>>,
  ) => R;
}): ViewModelDefinition<R, VMStores<CC>, VMEvents<CC>, VMDerived<CC>, Props> {
  const { contract, name, props, fn } = config;

  if (!(contract instanceof BaseContractChain)) {
    throw new TentaclesError(
      "createViewModel: `contract` must be a pre-built ViewContractChain or ModelContractChain value",
    );
  }
  if (props !== undefined && !(props instanceof PropsContractChainImpl)) {
    throw new TentaclesError(
      "createViewModel: `props` must be a pre-built PropsContractChain value",
    );
  }

  const fields = contract.getFields();
  const factoryDefaults = contract.getFactoryDefaults();
  const sidRoot = detectSidRoot() ?? contract.getSidRoot();
  const propDescriptors = props ? props.getDescriptors() : {};

  return new ViewModelDefinition(
    { ...fields },
    Object.keys(factoryDefaults).length > 0 ? { ...factoryDefaults } : undefined,
    propDescriptors,
    fn as ((stores: Record<string, unknown>, ctx: Record<string, unknown>) => R) | undefined,
    name ?? "unnamed",
    sidRoot,
  ) as ViewModelDefinition<R, VMStores<CC>, VMEvents<CC>, VMDerived<CC>, Props>;
}
