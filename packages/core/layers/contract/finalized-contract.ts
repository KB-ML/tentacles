import type { PkResult } from "../model/model";
import type { ContractFieldKind } from "./enums";
import type { ContractEntity } from "./types";
import type { AnyRefOrInverse, BuildContract, StoreMeta } from "./types/contract-chain";

type FactoryDefaults = Record<string, (data: Record<string, unknown>) => unknown>;
type ContractRecord = Record<string, ContractEntity<ContractFieldKind, unknown>>;

export type Built<
  S extends Record<string, StoreMeta>,
  E extends Record<string, unknown>,
  D extends Record<string, unknown>,
  R extends Record<string, AnyRefOrInverse>,
> = BuildContract<S, E, D, R>;

// Phantom keys for type-level access (never exist at runtime)
export declare const _built: unique symbol;

// Phantom key for PK field names
export declare const _pkFields: unique symbol;

export class FinalizedContractImpl<
  Stores extends Record<string, StoreMeta>,
  Events extends Record<string, unknown>,
  Derived extends Record<string, unknown>,
  Refs extends Record<string, AnyRefOrInverse>,
  PkFields extends string = string,
> {
  // Phantom properties for direct type access (no conditional inference needed)
  declare readonly [_built]: Built<Stores, Events, Derived, Refs>;
  declare readonly [_pkFields]: PkFields;

  constructor(
    private readonly _contract: ContractRecord,
    private readonly _pk: (data: Record<string, unknown>) => PkResult,
    private readonly _sidRoot?: string,
    private readonly _factoryDefaults?: FactoryDefaults,
  ) {}

  /** @internal */
  getContract(): ContractRecord {
    return this._contract;
  }

  /** @internal */
  getPk(): (data: Record<string, unknown>) => PkResult {
    return this._pk;
  }

  /** @internal */
  getSidRoot(): string | undefined {
    return this._sidRoot;
  }

  /** @internal */
  getFactoryDefaults(): FactoryDefaults | undefined {
    return this._factoryDefaults;
  }
}

/** Extract the Built contract type from a FinalizedContractImpl */
export type InferBuilt<FC> = FC extends { readonly [_built]: infer B } ? B : never;
/** Extract the PK field names from a FinalizedContractImpl */
export type InferPkFields<FC> = FC extends { readonly [_pkFields]: infer P }
  ? P extends string
    ? P
    : string
  : string;
