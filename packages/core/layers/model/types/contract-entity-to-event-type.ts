import type { ContractEntity, ContractEvent, ContractFieldKind } from "../../contract";

export type ContractEntityToEventType<
  Entity extends ContractEntity<ContractFieldKind, unknown>,
  _Generics extends Record<string, unknown> = Record<string, unknown>,
> = Entity extends ContractEvent<infer Value> ? Value : never;
