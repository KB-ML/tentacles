import type { EventCallable, Store, StoreWritable } from "effector";
import type {
  ContractComputed,
  ContractEntity,
  ContractEvent,
  ContractFieldKind,
  ContractInverse,
  ContractRef,
  ContractStore,
} from "../../contract";
import type { RefManyApi, RefOneApi } from "./ref-api";

export type ModelStore<T> = StoreWritable<T> & { set: EventCallable<T> };

export type ContractEntityToModel<
  Entity extends ContractEntity<ContractFieldKind, unknown>,
  _Generics extends Record<string, unknown> = Record<string, unknown>,
> = Entity extends ContractStore<infer Value, any>
  ? ModelStore<Value>
  : Entity extends ContractEvent<infer Value>
    ? EventCallable<Value>
    : Entity extends ContractRef<infer Cardinality>
      ? Cardinality extends "one"
        ? RefOneApi
        : RefManyApi
      : Entity extends ContractInverse
        ? Store<any[]>
        : Entity extends ContractComputed<infer Value>
          ? Store<Value>
          : never;
