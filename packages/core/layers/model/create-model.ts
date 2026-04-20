import type {
  FinalizedContractImpl,
  InferBuilt,
  InferPkFields,
} from "../contract/finalized-contract";
import { detectSidRoot } from "../shared/detect-sid-root";
import { Model, type PkResult, type RefsConfig } from "./model";
import type { ContractModel } from "./types";

type ExtractExtensions<CM, R> = Omit<R, keyof CM>;

/** Any thunk returning a Model — the loose shape used by the `refs` option at the
 *  argument level. Strict per-field keys are enforced by `RefsConfig<Contract>`
 *  applied at the `refs` property position.
 *
 *  `refs` is always required at the type level when the contract has any
 *  ref/inverse field; otherwise it is forbidden. This mirrors the old
 *  `.bind()` requirement but surfaces it at construction time. */
type RefThunk = () => Model<any, any, any, any>;

export function createModel<
  FC extends FinalizedContractImpl<any, any, any, any, any>,
  Refs extends RefsConfig<InferBuilt<FC>> = RefsConfig<InferBuilt<FC>>,
  // NB: R default must NOT depend on Refs. If it did, inferring the return type
  // of `createModel` for model A would require resolving `typeof modelB` (to resolve
  // Refs), but modelB's return type would similarly require `typeof modelA` — an
  // inference cycle. Using the unrefined ContractModel here keeps the return type
  // of createModel independent of Refs, so cross-referencing models can be inferred.
  R extends Record<string, unknown> = Partial<ContractModel<InferBuilt<FC>, {}>>,
>(config: {
  contract: FC;
  /** Thunks that resolve ref/inverse target models. Required when the contract
   *  has ref or inverse fields that cannot self-resolve (i.e. are not self-refs).
   *  Runtime `create()`/`resolveInverses()` will throw if a needed target is missing. */
  refs?: Refs;
  fn?: (model: ContractModel<InferBuilt<FC>, {}>) => R;
  name?: string;
}): Model<
  InferBuilt<FC>,
  {},
  ExtractExtensions<ContractModel<InferBuilt<FC>, {}>, R>,
  InferPkFields<FC>
> {
  const cfg = config as {
    contract: FC;
    fn?: (model: Record<string, unknown>) => R;
    name?: string;
    refs?: Record<string, RefThunk>;
  };

  const c = cfg.contract as unknown as FinalizedContractImpl<any, any, any, any>;
  const userFn = cfg.fn;
  const fn = userFn
    ? (units: Record<string, unknown>) => ({
        ...units,
        ...(userFn as Function)(units),
      })
    : (m: Record<string, unknown>) => m;

  const sidRoot = detectSidRoot() ?? c.getSidRoot();

  return new Model(
    c.getContract() as Record<string, never>,
    fn as Function as (m: Record<string, unknown>) => Record<string, unknown>,
    cfg.name,
    c.getPk() as (data: Record<string, unknown>) => PkResult,
    sidRoot,
    c.getFactoryDefaults(),
    !userFn,
    cfg.refs,
  ) as unknown as Model<
    InferBuilt<FC>,
    {},
    ExtractExtensions<ContractModel<InferBuilt<FC>, {}>, R>,
    InferPkFields<FC>
  >;
}
