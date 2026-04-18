import type { Store } from "effector";
import type { Model } from "../../model";
import type { ContractFieldKind } from "../enums";

export interface ContractEntity<Kind extends ContractFieldKind, ValueType> {
  kind: Kind;
  value: ValueType;
}

export interface ContractStore<ValueType, HasDefault extends boolean = boolean>
  extends ContractEntity<ContractFieldKind.State, ValueType> {
  isUnique: boolean;
  isIndexed: boolean;
  isAutoIncrement: boolean;
  hasDefault: HasDefault;
  defaultValue?: ValueType;
  resetOn?: string[];
}

export interface ContractEvent<ValueType>
  extends ContractEntity<ContractFieldKind.Event, ValueType> {}

export type OnDeletePolicy = "cascade" | "restrict" | "nullify";

export interface ContractRef<
  Cardinality extends "many" | "one" = "many",
  TargetModel extends Model<any, any, any, any> = Model<any, any, any, any>,
  Fk extends string | undefined = string | undefined,
> extends ContractEntity<ContractFieldKind.Ref, never> {
  cardinality: Cardinality;
  onDelete: OnDeletePolicy;
  ref?: () => TargetModel;
  fk: Fk;
}

export interface ContractInverse extends ContractEntity<ContractFieldKind.Inverse, never> {
  refField: string;
}

export interface ContractComputed<ValueType>
  extends ContractEntity<ContractFieldKind.Computed, ValueType> {
  factory: (stores: Record<string, unknown>) => Store<ValueType>;
}
