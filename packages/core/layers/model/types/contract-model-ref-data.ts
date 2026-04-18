import type {
  ContractEntity,
  ContractFieldKind,
  ContractInverse,
  ContractRef,
} from "../../contract";
import type { Model } from "../model";
import type { ContractModelStoreData } from "./contract-model-store-data";
import type { ModelInstanceId } from "./model-intsance-id";

export type ModelCreateInput<M extends Model<any, any, any, any>> =
  M extends Model<infer C, infer G>
    ? ContractModelStoreData<C, G> & ContractModelRefData<C, G>
    : never;

/** Object form for connect: only PK fields required */
export type ConnectByPk<M extends Model<any, any, any, any>> =
  M extends Model<infer C, infer G, any, infer P>
    ? [P] extends [keyof ContractModelStoreData<C, G>]
      ? Pick<ContractModelStoreData<C, G>, P & keyof ContractModelStoreData<C, G>>
      : Partial<ContractModelStoreData<C, G>>
    : never;

/** Value for connect: scalar ID or object (PK extracted via pkResolver) */
export type ConnectInput<M extends Model<any, any, any, any>> = ModelInstanceId | ConnectByPk<M>;

/** Operation-style create input for "one" refs (no disconnect in create context) */
export type RefOneCreateOperation<M extends Model<any, any, any, any>> =
  | { connect: ConnectInput<M> }
  | { create: ModelCreateInput<M> }
  | { connectOrCreate: ModelCreateInput<M> };

/** Operation-style create input for "many" refs — operations at top level with arrays */
export type RefManyCreateData<M extends Model<any, any, any, any>> = {
  connect?: ConnectInput<M>[];
  create?: ModelCreateInput<M>[];
  connectOrCreate?: ModelCreateInput<M>[];
};

/** Plain-array element for "many" ref create shortcut:
 *  - scalar `ModelInstanceId` → connect by id
 *  - full `ModelCreateInput<M>` object → connectOrCreate
 */
export type RefManyCreateElement<M extends Model<any, any, any, any>> =
  | ModelInstanceId
  | ModelCreateInput<M>;

export type ContractModelRefData<
  Contract extends Record<string, unknown>,
  _Generics extends Record<string, unknown> = Record<string, unknown>,
> = {
  [Key in keyof Contract as Contract[Key] extends ContractRef<any, any>
    ? Key
    : never]?: Contract[Key] extends ContractRef<"many", infer M>
    ? RefManyCreateData<M> | RefManyCreateElement<M>[]
    : Contract[Key] extends ContractRef<"one", infer M>
      ? ModelInstanceId | RefOneCreateOperation<M> | ModelCreateInput<M>
      : never;
};

/** FK alias fields: e.g. `schedule_id` maps to the `schedule` ref */
export type ContractModelFkData<Contract extends Record<string, unknown>> = {
  [Key in keyof Contract as Contract[Key] extends ContractRef<any, any, infer FK>
    ? FK extends string
      ? FK
      : never
    : never]?: ModelInstanceId | ModelInstanceId[];
};

/** Inverse ref fields: accept IDs or explicit operations */
export type ContractModelInverseData<Contract extends Record<string, unknown>> = {
  [Key in keyof Contract as Contract[Key] extends ContractInverse ? Key : never]?:
    | ModelInstanceId
    | ModelInstanceId[]
    | RefOneCreateOperation<Model<any, any, any, any>>;
};

// ═══ Update ref operation types (Prisma-style) ═══

/** Element inside set/add arrays for "many" refs */
export type RefManyElement<M extends Model<any, any, any, any>> =
  | ModelInstanceId
  | { connect: ConnectInput<M> }
  | { create: ModelCreateInput<M> }
  | { connectOrCreate: ModelCreateInput<M> };

/** Operations on a "many" ref field. `set` is mutually exclusive with `add`/`disconnect`. */
export type RefManyOperations<M extends Model<any, any, any, any>> =
  | { set: RefManyElement<M>[]; add?: never; disconnect?: never }
  | { set?: never; add?: RefManyElement<M>[]; disconnect?: ModelInstanceId[] };

/** Operations on a "one" ref field — exactly one operation per field. */
export type RefOneOperation<M extends Model<any, any, any, any>> =
  | { connect: ConnectInput<M> }
  | { create: ModelCreateInput<M> }
  | { connectOrCreate: ModelCreateInput<M> }
  | { disconnect: true };

/** Maps contract ref fields to their update operation types */
export type ContractModelRefOperations<
  Contract extends Record<string, unknown>,
  _Generics extends Record<string, unknown> = Record<string, unknown>,
> = {
  [Key in keyof Contract as Contract[Key] extends ContractRef<any, any>
    ? Key
    : never]?: Contract[Key] extends ContractRef<"many", infer M>
    ? RefManyOperations<M> | RefManyCreateElement<M>[]
    : Contract[Key] extends ContractRef<"one", infer M>
      ? RefOneOperation<M> | ModelCreateInput<M>
      : never;
};

/** Inverse ref update operations (source model type unknown at compile time) */
export type ContractModelInverseOperations<Contract extends Record<string, unknown>> = {
  [Key in keyof Contract as Contract[Key] extends ContractInverse ? Key : never]?:
    | RefOneOperation<Model<any, any, any, any>>
    | RefManyOperations<Model<any, any, any, any>>;
};

type StrictContract = Record<string, ContractEntity<ContractFieldKind, unknown>>;

/** Full update data: store fields + ref operations + FK aliases + inverse operations.
 *  Accepts loose Contract constraint (Record<string, unknown>) for query layer compat. */
export type UpdateData<
  Contract extends Record<string, unknown>,
  Generics extends Record<string, unknown>,
> = [Contract] extends [StrictContract]
  ? Partial<ContractModelStoreData<Contract, Generics>> &
      ContractModelRefOperations<Contract, Generics> &
      ContractModelFkData<Contract> &
      ContractModelInverseOperations<Contract>
  : Record<string, unknown>;

/** PK function input: stores as-is, refs normalized to string IDs */
export type ContractPkInput<
  Contract extends Record<string, unknown>,
  Generics extends Record<string, unknown>,
> = ContractModelStoreData<Contract & StrictContract, Generics> & {
  [Key in keyof Contract as Contract[Key] extends ContractRef<any, any>
    ? Key
    : never]?: Contract[Key] extends ContractRef<"many", any> ? string[] : string;
};
