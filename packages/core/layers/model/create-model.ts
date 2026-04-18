import type {
  FinalizedContractImpl,
  InferBuilt,
  InferPkFields,
} from "../contract/finalized-contract";
import { detectSidRoot } from "../shared/detect-sid-root";
import { Model, type PkResult } from "./model";
import type { ContractModel } from "./types";

type ExtractExtensions<CM, R> = Omit<R, keyof CM>;

export function createModel<
  FC extends FinalizedContractImpl<any, any, any, any, any>,
  R extends Record<string, unknown> = Partial<ContractModel<InferBuilt<FC>, {}>>,
>(config: {
  contract: FC;
  fn?: (model: ContractModel<InferBuilt<FC>, {}>) => R;
  name?: string;
}): Model<
  InferBuilt<FC>,
  {},
  ExtractExtensions<ContractModel<InferBuilt<FC>, {}>, R>,
  InferPkFields<FC>
> {
  const { contract, fn: userFn, name } = config;

  const c = contract as unknown as FinalizedContractImpl<any, any, any, any>;
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
    name,
    c.getPk() as (data: Record<string, unknown>) => PkResult,
    sidRoot,
    c.getFactoryDefaults(),
    !userFn,
  ) as unknown as Model<
    InferBuilt<FC>,
    {},
    ExtractExtensions<ContractModel<InferBuilt<FC>, {}>, R>,
    InferPkFields<FC>
  >;
}
