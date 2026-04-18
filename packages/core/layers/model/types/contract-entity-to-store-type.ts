import type { ContractEntity, ContractFieldKind, ContractStore } from "../../contract";

export type ContractEntityToStoreType<
  Entity extends ContractEntity<ContractFieldKind, unknown>,
  _Generics extends Record<string, unknown> = Record<string, unknown>,
> = Entity extends ContractStore<infer Value, any> ? Value : never;
