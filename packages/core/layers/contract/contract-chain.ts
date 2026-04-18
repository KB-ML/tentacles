import type { Store } from "effector";
import type { PkResult } from "../model/model";
import { detectSidRoot } from "../shared/detect-sid-root";
import { BaseContractChain } from "./base-contract-chain";
import { ContractFieldKind } from "./enums";
import { FinalizedContractImpl } from "./finalized-contract";
import type {
  AnyRefOrInverse,
  DerivedParam,
  EventFieldBuilder,
  EventMeta,
  EventResult,
  FreshName,
  InverseMeta,
  OnDeletePolicy,
  RefMeta,
  StoreFieldBuilder,
  StoreMeta,
  StoreResult,
  StoreValues,
} from "./types";

// Phantom keys for type-level access (refs are model-specific; stores/events/
// derived share the base class's phantom keys so extractors work uniformly).
export declare const _ccRefs: unique symbol;

/**
 * Model contract chain — declares stores, events, derived stores, refs,
 * inverse refs, and finalizes with a primary key.
 *
 * Extends `BaseContractChain` which holds the runtime state and shared
 * helpers. `ModelContractChain` adds the model-specific surface: `ref`,
 * `inverse`, `pk`, and the public typed signatures for `store`/`event`/
 * `derived`/`merge` that preserve ref accumulators.
 */
export class ModelContractChain<
  Stores extends Record<string, StoreMeta> = {},
  Events extends Record<string, unknown> = {},
  Derived extends Record<string, unknown> = {},
  Refs extends Record<string, AnyRefOrInverse> = {},
> extends BaseContractChain<Stores, Events, Derived> {
  // Phantom property specific to model contracts (refs); stores/events/derived
  // are inherited from BaseContractChain's phantom keys.
  declare readonly [_ccRefs]: Refs;

  store<K extends string, T, HD extends boolean, U extends boolean, I extends boolean>(
    name: FreshName<K, Stores, Events, Derived, Refs>,
    builder: (s: StoreFieldBuilder<StoreValues<Stores>>) => StoreResult<T, HD, U, I>,
  ): ModelContractChain<Stores & Record<K, StoreMeta<T, HD, U, I>>, Events, Derived, Refs> {
    this._addStore(name as string, builder as (s: unknown) => unknown);
    return this as unknown as ModelContractChain<
      Stores & Record<K, StoreMeta<T, HD, U, I>>,
      Events,
      Derived,
      Refs
    >;
  }

  event<K extends string, T>(
    name: FreshName<K, Stores, Events, Derived, Refs>,
    builder: (e: EventFieldBuilder) => EventResult<T>,
  ): ModelContractChain<Stores, Events & Record<K, EventMeta<T>>, Derived, Refs> {
    this._addEvent(name as string, builder as (e: unknown) => unknown);
    return this as unknown as ModelContractChain<
      Stores,
      Events & Record<K, EventMeta<T>>,
      Derived,
      Refs
    >;
  }

  derived<K extends string, T>(
    name: FreshName<K, Stores, Events, Derived, Refs>,
    factory: (stores: DerivedParam<Stores, Derived, Refs>) => Store<T>,
  ): ModelContractChain<Stores, Events, Derived & Record<K, T>, Refs> {
    this._addDerived(
      name as string,
      factory as unknown as (stores: Record<string, unknown>) => Store<unknown>,
    );
    return this as unknown as ModelContractChain<Stores, Events, Derived & Record<K, T>, Refs>;
  }

  ref<
    K extends string,
    C extends "many" | "one",
    FK extends (keyof Stores & string) | undefined = undefined,
  >(
    name: FreshName<K, Stores, Events, Derived, Refs>,
    cardinality: C,
    options?: { onDelete?: OnDeletePolicy; fk?: FK },
  ): ModelContractChain<Stores, Events, Derived, Refs & Record<K, RefMeta<C, OnDeletePolicy, FK>>> {
    this.fields[name as string] = {
      kind: ContractFieldKind.Ref,
      cardinality,
      onDelete: options?.onDelete ?? "nullify",
      fk: options?.fk,
    };
    return this as unknown as ModelContractChain<
      Stores,
      Events,
      Derived,
      Refs & Record<K, RefMeta<C, OnDeletePolicy, FK>>
    >;
  }

  inverse<K extends string>(
    name: FreshName<K, Stores, Events, Derived, Refs>,
    refField: string,
  ): ModelContractChain<Stores, Events, Derived, Refs & Record<K, InverseMeta>> {
    this.fields[name as string] = { kind: ContractFieldKind.Inverse, refField };
    return this as unknown as ModelContractChain<
      Stores,
      Events,
      Derived,
      Refs & Record<K, InverseMeta>
    >;
  }

  merge<
    MS extends Record<string, StoreMeta>,
    ME extends Record<string, unknown>,
    MD extends Record<string, unknown>,
    MR extends Record<string, AnyRefOrInverse>,
  >(
    source: ModelContractChain<MS, ME, MD, MR>,
  ): ModelContractChain<Stores & MS, Events & ME, Derived & MD, Refs & MR> {
    this._merge(source);
    return this as unknown as ModelContractChain<Stores & MS, Events & ME, Derived & MD, Refs & MR>;
  }

  pk<F extends (keyof Stores | keyof Refs) & string>(
    ...fields: [F, ...F[]]
  ): FinalizedContractImpl<Stores, Events, Derived, Refs, F> {
    const firstField = fields[0];
    const fn =
      fields.length === 1
        ? (data: Record<string, unknown>) => data[firstField as string] as PkResult
        : (data: Record<string, unknown>) => fields.map((f) => data[f]) as PkResult;

    return new FinalizedContractImpl(
      this.fields as Record<string, never>,
      fn,
      this.sidRoot,
      Object.keys(this.factoryDefaults).length > 0 ? { ...this.factoryDefaults } : undefined,
    ) as FinalizedContractImpl<Stores, Events, Derived, Refs, F>;
  }
}

/**
 * Create a new model contract chain. Chain stores, events, derived fields,
 * refs, and inverse refs, then finalize with `.pk(...fields)` to produce a
 * `FinalizedContractImpl` that can be passed to `createModel`.
 */
export function createContract(): ModelContractChain {
  return new ModelContractChain(detectSidRoot());
}
