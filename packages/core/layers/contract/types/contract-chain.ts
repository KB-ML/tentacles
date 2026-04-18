import type { Store } from "effector";
import type { Model } from "../../model/model";
import type { ModelStore, RefManyApi, RefOneApi } from "../../model/types";
import type { FinalizedContractImpl } from "../finalized-contract";
import type {
  ContractComputed,
  ContractEvent,
  ContractInverse,
  ContractRef,
  ContractStore,
  OnDeletePolicy,
} from "./contract-entity";

// ─── Hidden phantom keys (unique symbols don't appear in autocomplete) ───

declare const _value: unique symbol;
declare const _hasDefault: unique symbol;
declare const _isUnique: unique symbol;
declare const _isIndexed: unique symbol;
declare const _storeResult: unique symbol;
declare const _eventResult: unique symbol;
declare const _kind: unique symbol;
declare const _cardinality: unique symbol;
declare const _onDelete: unique symbol;
declare const _fk: unique symbol;
declare const _refField: unique symbol;

export interface StoreMeta<
  T = unknown,
  HasDefault extends boolean = boolean,
  IsUnique extends boolean = boolean,
  IsIndexed extends boolean = boolean,
> {
  readonly [_value]: T;
  readonly [_hasDefault]: HasDefault;
  readonly [_isUnique]: IsUnique;
  readonly [_isIndexed]: IsIndexed;
}

export type StoreValues<S extends Record<string, StoreMeta>> = {
  [K in keyof S]: S[K][typeof _value];
};

export interface EventMeta<T = unknown> {
  readonly [_value]: T;
}

export interface RefMeta<
  Cardinality extends "many" | "one" = "many" | "one",
  OnDelete extends OnDeletePolicy = OnDeletePolicy,
  Fk extends string | undefined = string | undefined,
> {
  readonly [_kind]: "ref";
  readonly [_cardinality]: Cardinality;
  readonly [_onDelete]: OnDelete;
  readonly [_fk]: Fk;
}

export interface InverseMeta {
  readonly [_kind]: "inverse";
  readonly [_refField]: string;
}

export type AnyRefOrInverse = RefMeta | InverseMeta;

type AllKeys<S, E, D, R> = keyof S | keyof E | keyof D | keyof R;

export type FreshName<
  K extends string,
  S extends Record<string, unknown>,
  E extends Record<string, unknown>,
  D extends Record<string, unknown>,
  R extends Record<string, unknown>,
> = K extends AllKeys<S, E, D, R> ? never : K;

export interface StoreResult<
  T,
  HD extends boolean = false,
  U extends boolean = false,
  I extends boolean = false,
> {
  readonly [_storeResult]: true;
  readonly [_value]: T;
  readonly [_hasDefault]: HD;
  readonly [_isUnique]: U;
  readonly [_isIndexed]: I;
}

type StoreChain<
  T,
  Prev extends Record<string, unknown>,
  HD extends boolean,
  U extends boolean,
  I extends boolean,
> = StoreResult<T, HD, U, I> &
  (HD extends true
    ? {}
    : {
        default(value: T): StoreChain<T, Prev, true, U, I>;
        default(factory: (data: Prev) => T): StoreChain<T, Prev, true, U, I>;
      }) &
  (U extends true
    ? {}
    : {
        unique(): StoreChain<T, Prev, HD, true, I>;
      }) &
  (I extends true
    ? {}
    : {
        index(): StoreChain<T, Prev, HD, U, true>;
      }) &
  (HD extends true
    ? {}
    : T extends number
      ? {
          autoincrement(): StoreChain<T, Prev, true, U, I>;
        }
      : {}) &
  (HD extends true
    ? {
        resetOn(...fields: (keyof Prev & string)[]): StoreChain<T, Prev, HD, U, I>;
      }
    : {});

export type StoreTyped<T, Prev extends Record<string, unknown>> = StoreChain<
  T,
  Prev,
  false,
  false,
  false
>;

/**
 * Callable store field builder. Invoke as `s<T>()` to declare a store field type.
 */
export type StoreFieldBuilder<Prev extends Record<string, unknown> = {}> = <T>() => StoreTyped<
  T,
  Prev
>;

export interface EventResult<T> {
  readonly [_eventResult]: true;
  readonly [_value]: T;
}

/**
 * Callable event field builder. Invoke as `e<T>()` to declare an event payload type.
 */
export type EventFieldBuilder = <T>() => EventResult<T>;

export type DerivedParam<
  Stores extends Record<string, StoreMeta>,
  Derived extends Record<string, unknown>,
  Refs extends Record<string, AnyRefOrInverse>,
> = {
  [K in keyof Stores & string as `$${K}`]: ModelStore<Stores[K][typeof _value]>;
} & {
  [K in keyof Derived & string as `$${K}`]: Store<Derived[K]>;
} & {
  [K in keyof Refs as Refs[K] extends InverseMeta
    ? `$${K & string}`
    : K]: Refs[K] extends RefMeta<"many">
    ? RefManyApi
    : Refs[K] extends RefMeta<"one">
      ? RefOneApi
      : Refs[K] extends InverseMeta
        ? Store<unknown[]>
        : never;
};

export type BuildContract<
  Stores extends Record<string, StoreMeta>,
  Events extends Record<string, unknown>,
  Derived extends Record<string, unknown>,
  Refs extends Record<string, AnyRefOrInverse>,
> = {
  [K in keyof Stores & string]: ContractStore<
    Stores[K][typeof _value],
    Stores[K][typeof _hasDefault]
  > & {
    isUnique: Stores[K][typeof _isUnique];
    isIndexed: Stores[K][typeof _isIndexed];
  };
} & {
  [K in keyof Events & string]: Events[K] extends EventMeta<infer V>
    ? ContractEvent<V>
    : ContractEvent<Events[K]>;
} & {
  [K in keyof Derived & string]: ContractComputed<Derived[K]>;
} & {
  [K in keyof Refs & string]: Refs[K] extends RefMeta<infer C, infer _OD, infer FK>
    ? ContractRef<C, Model<any, any, any>, FK>
    : Refs[K] extends InverseMeta
      ? ContractInverse
      : never;
};
