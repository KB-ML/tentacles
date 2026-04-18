import type { ContractEntity, ContractFieldKind } from "../../contract";
import type { Model } from "../model";
import type { ContractModel } from "./contract-model";
import type { InstanceMeta } from "./instance-meta";

export type ModelInstance<M extends Model<any, any, any>> =
  M extends Model<
    infer C extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
    infer G extends Record<string, unknown>,
    infer E extends Record<string, unknown>
  >
    ? ContractModel<C, G> & E & InstanceMeta & { "@@unitShape": () => ContractModel<C, G> & E }
    : never;
