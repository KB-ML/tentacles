import type { ContractEntity, ContractFieldKind } from "../../contract";
import type { ContractEntityToStoreType } from "./contract-entity-to-store-type";
import type { ModelInstanceId } from "./model-intsance-id";

export type ModelUpdatedPayload<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
  Generics extends Record<string, unknown>,
> = {
  [K in keyof Contract]: ContractEntityToStoreType<Contract[K], Generics> extends never
    ? never
    : {
        id: ModelInstanceId;
        field: K & string;
        value: ContractEntityToStoreType<Contract[K], Generics>;
      };
}[keyof Contract];
