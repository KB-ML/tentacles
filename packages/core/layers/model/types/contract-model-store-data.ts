import type { ContractEntity, ContractFieldKind, ContractRef, ContractStore } from "../../contract";
import type { ContractEntityToStoreType } from "./contract-entity-to-store-type";

/** Store keys used as FK aliases — excluded from store data since FK data type takes precedence */
type FkStoreKeys<Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>> = {
  [Key in keyof Contract]: Contract[Key] extends ContractRef<any, any, infer FK>
    ? FK extends string
      ? FK
      : never
    : never;
}[keyof Contract];

type RequiredStoreKeys<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
  Generics extends Record<string, unknown>,
> = Exclude<
  {
    [Key in keyof Contract]: Contract[Key] extends ContractStore<any, true>
      ? never
      : ContractEntityToStoreType<Contract[Key], Generics> extends never
        ? never
        : Key;
  }[keyof Contract],
  FkStoreKeys<Contract>
>;

type OptionalStoreKeys<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
> = Exclude<
  {
    [Key in keyof Contract]: Contract[Key] extends ContractStore<any, true> ? Key : never;
  }[keyof Contract],
  FkStoreKeys<Contract>
>;

export type ContractModelStoreData<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
  Generics extends Record<string, unknown>,
> = {
  [Key in RequiredStoreKeys<Contract, Generics>]: ContractEntityToStoreType<
    Contract[Key],
    Generics
  >;
} & {
  [Key in OptionalStoreKeys<Contract>]?: ContractEntityToStoreType<Contract[Key], Generics>;
};
