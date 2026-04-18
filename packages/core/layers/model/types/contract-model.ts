import type {
  ContractComputed,
  ContractEntity,
  ContractFieldKind,
  ContractInverse,
  ContractStore,
} from "../../contract";
import type { ContractEntityToModel } from "./contract-entity-to-model";

type PrefixedKey<K extends string | number | symbol, Entity> = Entity extends ContractStore<
  any,
  any
>
  ? `$${K & string}`
  : Entity extends ContractComputed<any>
    ? `$${K & string}`
    : Entity extends ContractInverse
      ? `$${K & string}`
      : K;

export type ContractModel<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
  Generics extends Record<string, unknown>,
> = {
  [Key in keyof Contract as PrefixedKey<Key, Contract[Key]>]: ContractEntityToModel<
    Contract[Key],
    Generics
  >;
};
