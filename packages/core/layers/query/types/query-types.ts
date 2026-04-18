import type { Store, StoreWritable } from "effector";
import type {
  ContractComputed,
  ContractEntity,
  ContractFieldKind,
  ContractInverse,
  ContractStore,
} from "../../contract";
import type { ContractEntityToStoreType } from "../../model/types";

export type ContractQueryableKeys<Contract extends Record<string, unknown>> = {
  [K in keyof Contract]: Contract[K] extends ContractStore<any, any>
    ? K
    : Contract[K] extends ContractComputed<any>
      ? K
      : Contract[K] extends ContractInverse
        ? K
        : never;
}[keyof Contract];

export type ExtensionStoreKeys<Ext extends Record<string, unknown>> = {
  [K in keyof Ext]: Ext[K] extends Store<any> ? K : never;
}[keyof Ext];

export type QueryableFieldNames<
  Contract extends Record<string, unknown>,
  Ext extends Record<string, unknown>,
> = (ContractQueryableKeys<Contract> & string) | (ExtensionStoreKeys<Ext> & string);

export type QueryFieldValueType<
  Contract extends Record<string, unknown>,
  Generics extends Record<string, unknown>,
  Ext extends Record<string, unknown>,
  K extends string,
> = K extends keyof Contract
  ? Contract[K] extends ContractComputed<infer V>
    ? V
    : Contract[K] extends ContractInverse
      ? any[]
      : Contract[K] extends ContractEntity<ContractFieldKind, unknown>
        ? ContractEntityToStoreType<Contract[K], Generics> extends never
          ? K extends keyof Ext
            ? Ext[K] extends Store<infer V>
              ? V
              : never
            : never
          : ContractEntityToStoreType<Contract[K], Generics>
        : never
  : K extends keyof Ext
    ? Ext[K] extends Store<infer V>
      ? V
      : never
    : never;

export type QueryDataRecord<
  Contract extends Record<string, unknown>,
  Generics extends Record<string, unknown>,
  Ext extends Record<string, unknown>,
> = {
  [K in QueryableFieldNames<Contract, Ext> & string]: QueryFieldValueType<
    Contract,
    Generics,
    Ext,
    K
  >;
};

export type IsWritableField<
  Contract extends Record<string, unknown>,
  Ext extends Record<string, unknown>,
  K extends string,
> = K extends keyof Contract
  ? Contract[K] extends ContractStore<any, any>
    ? true
    : false
  : K extends keyof Ext
    ? Ext[K] extends StoreWritable<any>
      ? true
      : false
    : false;
