# Types

Every exported type from `@kbml-tentacles/core`, grouped by the layer it belongs to. This page catalogues what each type represents and where it comes from; it does not reproduce full TypeScript definitions — check the source for the precise shape when working at the type level. All types are importable from the package root:

```ts
import type {
  Built, InferBuilt, InferPkFields,
  ContractEntity, ContractStore, ContractRef, ContractInverse,
  BuildContract, StoreMeta, AnyRefOrInverse,
  ModelInstance, ModelInstanceId, UpdateData,
  RefManyApi, RefOneApi,
  Operator, QueryContext, Reactive,
  ResolvedRef, ScopeEntry, ViewModelInstance,
} from "@kbml-tentacles/core"
```

The `ContractFieldKind` enum is a runtime export; everything else is type-only.

## Contract layer

### `Built<S, E, D, R>`

Alias for `BuildContract<S, E, D, R>` — the entity record produced by a finalized contract. Materializes the phantom generics carried through `ModelContractChain` into a structural type keyed by field name, with each key mapped to `ContractStore<T>`, `ContractEvent<T>`, `ContractComputed<T>`, `ContractRef<...>`, or `ContractInverse`.

Used internally by `FinalizedContractImpl` to expose `_built` for extraction by `InferBuilt`. You rarely write `Built<...>` by hand — let `InferBuilt` do it.

### `InferBuilt<FC>`

Extracts the `Built<...>` entity record from a `FinalizedContractImpl`.

```ts
const postContract = createContract()
  .store("id",    (s) => s<string>())
  .store("title", (s) => s<string>())
  .pk("id")

type PostContract = InferBuilt<typeof postContract>
// { id: ContractStore<string>; title: ContractStore<string>; ... }
```

### `InferPkFields<FC>`

Extracts the primary-key field names from a `FinalizedContractImpl`. Returns a string literal union (for single PKs) or a union of tuple elements (for compound PKs).

```ts
type PkOf<FC> = InferPkFields<FC>
// For .pk("id"):       "id"
// For .pk("a", "b"):   "a" | "b"
```

### `ContractEntity<Kind, T>`

Base shape shared by every contract field descriptor. `Kind` is a `ContractFieldKind` value; `T` is the field's payload type (or `never` for refs/inverses, which have no intrinsic payload).

### `ContractStore<T, HasDefault>`

Descriptor for a store field. Carries `kind`, `value`, `isUnique`, `isIndexed`, `isAutoIncrement`, `hasDefault`, `defaultValue?`, `resetOn?`.

### `ContractEvent<T>`

Descriptor for an event field. Carries `kind` and `value` (the payload type).

### `ContractComputed<T>`

Descriptor for a derived field. Carries `kind`, `value`, and a `factory` thunk that builds the derived `Store<T>` given the sibling stores.

### `ContractRef<Cardinality, TargetModel, Fk>`

Descriptor for a ref field. `Cardinality` is `"one" | "many"`, `TargetModel` is a `Model<...>` type (or `Model<any, any, any, any>` when unbound), `Fk` is the FK alias string or `undefined`. Also carries `onDelete: OnDeletePolicy` and an optional `ref: () => TargetModel` thunk.

### `ContractInverse`

Descriptor for an inverse field. Carries `kind` and `refField` (the name of the ref on the target model that points back to this instance).

### `BuildContract<S, E, D, R>`

Maps the four phantom-generic slots (Stores, Events, Derived, Refs) to the corresponding `ContractEntity` subtypes, keyed by field name. The output is the canonical "entity record" consumed by the model layer.

### `StoreMeta<T, HasDefault, IsUnique, IsIndexed>`

The phantom-only shape accumulated by `ModelContractChain`'s Stores generic. Has no runtime representation — only phantom symbol keys. Extracted by helper types inside the contract layer to rebuild the final entity record.

### `AnyRefOrInverse`

Union `RefMeta | InverseMeta`. The phantom-only shape for the Refs slot of a `ModelContractChain`.

### `ContractFieldKind` (runtime enum)

```ts
enum ContractFieldKind {
  State = "state",
  Event = "event",
  Ref = "ref",
  Inverse = "inverse",
  Computed = "computed",
}
```

Used at runtime to discriminate field descriptors. This is the only runtime export on this page.

## Model layer

### `ApplyRefs<Contract, R>`

Given a contract record and a `refs: { refName: () => Model }` config, produces a contract record where ref targets are substituted with the configured model types. Kept as an identity at the value level to avoid circular type inference across bidirectional relationships; the runtime still enforces ref/inverse target configuration.

### `RefsConfig<Contract>`

Strict per-field dictionary type used by `createModel`'s `refs` option. Keys are the names of `ref` and `inverse` fields on the contract; each value is `() => TargetModel`.

### `BindableFieldNames<Contract>`

Union of field names eligible for entries in `refs` — all `ref` and `inverse` fields declared on the contract.

### `CompoundKey`

Alias `[ModelInstanceId, ...ModelInstanceId[]]`. The runtime representation of a compound primary key. Exported for typing custom lookup utilities.

### `PkResult`

Union `string | number | CompoundKey`. Return type of the PK resolver function stored on a `FinalizedContractImpl`.

### `ContractModelRefData<Contract, Generics>`

Shape of the ref-related keys in `ModelCreateInput`. For each `ContractRef<"many", M>`, produces a union of `RefManyCreateData<M>` (operations form) or `RefManyCreateElement<M>[]` (shortcut array form). For `ContractRef<"one", M>`, produces `ModelInstanceId | RefOneCreateOperation<M> | ModelCreateInput<M>`.

### `ContractModelRefOperations<Contract, Generics>`

Shape of the ref-related keys in `UpdateData`. Like `ContractModelRefData` but using `RefManyOperations<M>` (with `set` exclusive from `add`/`disconnect`) and `RefOneOperation<M>` (with `connect`/`create`/`connectOrCreate`/`disconnect: true`).

### `ContractPkInput<Contract, Generics>`

Input shape accepted by the PK resolver. Store fields appear with their declared types; ref fields are normalized to `string | string[]` depending on cardinality, matching what the model has after PK resolution.

### `InstanceMeta`

The meta fields attached to every model instance: `__id: ModelInstanceId` and `__model: Model<any, any, any>`. Useful when a consumer needs to know which model an instance came from without exposing the internal `Model` reference on every field.

### `ModelCreateInput<M>`

Alias for the full input shape of `M.create()`: store fields plus ref operations plus FK alias fields plus inverse operations. When used in a nested ref (e.g., `{ create: { ... } }`), the same type recurses into the target model's input.

### `ModelInstance<M>`

The runtime instance type produced by a model. Combines:

- The `ContractModel<C, G>` projection (`$`-prefixed stores, derived, inverses; plain refs)
- The extension type `E` (the return value of the user's `fn`)
- `InstanceMeta`
- `"@@unitShape": () => ContractModel<C, G> & E`

The `@@unitShape` hook makes instances usable as effector "unit shapes" — spread them directly into `useUnit` / `useStore` etc.

### `ModelInstanceId`

Alias `string | number`. The runtime ID type used across the model, query, and view-model layers.

### `ModelStore<T>`

Alias for the effector store type returned by a materialised store field — a `StoreWritable<T>` with additional metadata. Used in `DerivedParam` and `QueryContext` to type the store map.

### `RefManyApi`

Runtime shape for a `ref("x", "many")`:

```ts
{
  $ids: StoreWritable<ModelInstanceId[]>
  add: EventCallable<ModelInstanceId>
  remove: EventCallable<ModelInstanceId>
}
```

### `RefManyCreateData<M>`

Object form for `.create({ refName: { connect, create, connectOrCreate } })`. Each key is optional; arrays are independent.

### `RefManyElement<M>`

Element type inside `set` / `add` arrays during update. Can be a raw `ModelInstanceId` or a `{ connect | create | connectOrCreate }` object.

### `RefManyOperations<M>`

Update-time shape for a many-ref. `{ set: [...] }` is mutually exclusive with `{ add: [...], disconnect: [...] }`.

### `RefOneApi`

Runtime shape for a `ref("x", "one")`:

```ts
{
  $id: StoreWritable<ModelInstanceId | null>
  set: EventCallable<ModelInstanceId>
  clear: EventCallable<void>
}
```

### `RefOneOperation<M>`

Update-time shape for a one-ref. Exactly one of `{ connect }`, `{ create }`, `{ connectOrCreate }`, `{ disconnect: true }`.

### `UpdateData<Contract, Generics>`

Full input type for `Model.update(id, data)`: partial store fields, plus ref operations, plus FK alias fields, plus inverse operations. A loose `Record<string, unknown>` fallback applies when the contract constraint is relaxed (query-layer paths).

## Query layer

### `Operator<T>`

Descriptor for a query operator. Carries `name`, `operand` (a `Reactive<unknown>`), `predicate`, `isReactive`, and an optional `$operand` store for reactive operands.

```ts
interface Operator<T = unknown> {
  readonly name: string
  readonly operand: Reactive<unknown>
  readonly predicate: (value: T, resolvedOperand: unknown) => boolean
  readonly isReactive: boolean
  readonly $operand?: Store<unknown>
}
```

Created by operator factories (`eq`, `gt`, `contains`, etc.) and consumed by `.where()`/`.having()`.

### `QueryContext<Instance>`

The context object a `CollectionQuery` receives from its owning model — exposes `$ids`, `$idSet`, `$dataMap`, `getInstance`, `getInstanceFromData`, `getUpdated`, `handleDelete`, `handleUpdate`, `getContract`, optional `$index`, and optional `$fieldUpdated`. Used internally to wire scope-aware reads during `fork({ values })`.

### `Reactive<T>`

Alias `T | Store<T>`. The operand-accepting type used across the query layer — every operator factory accepts either a raw value or an effector store.

## View-model layer

### `ResolvedRef`

```ts
interface ResolvedRef {
  cardinality: "one" | "many"
  store: Store<ModelInstanceId[]> | Store<ModelInstanceId | null>
}
```

Returned by `resolveFrom`. Tells the caller which store to subscribe to (single ID or ID array) for `<Each from="refName">` iteration.

### `ScopeEntry`

```ts
interface ScopeEntry {
  model: { getRefMeta(field: string): { cardinality: "one" | "many"; target: unknown } | undefined }
  instance: Record<string, unknown>
}
```

One entry per `<Map>`/`<Each>` ancestor in a framework adapter's scope stack. Framework adapters push entries as they descend the component tree and pop them on unmount.

### `ViewModelInstance<Shape>`

Return type of `ViewModelDefinition.instantiate()`:

```ts
interface ViewModelInstance<Shape> {
  readonly shape: Shape
  readonly lifecycle: ViewModelLifecycle
  readonly id: number
}
```

- `shape` — the user-returned shape from `fn`, or the raw store map if no `fn`.
- `lifecycle` — an object with `mounted`, `unmounted` events and a `$mounted: Store<boolean>`.
- `id` — auto-incrementing per-definition identifier used by framework adapters.

## Notes

- Types whose phantom generics include symbol-keyed slots (`StoreMeta`, `AnyRefOrInverse`, `FinalizedContractImpl`) carry compile-time information that is invisible in structural equality checks. Do not try to construct these types by hand; use the chain builders.
- `Built`, `InferBuilt`, and `InferPkFields` are the stable way to move from a user-supplied contract object to its structural type — the phantom keys on `FinalizedContractImpl` are implementation details.
- `ContractFieldKind` is the only runtime export among these types. Everything else is erased at build time.

## Related

- [createContract](/reference/core/create-contract) — produces the phantom generics these types describe.
- [createModel](/reference/core/create-model) — consumes the finalized contract and its inferred types.
- [CollectionQuery](/reference/core/collection-query) — uses `QueryContext`, `Operator`, and `Reactive`.
- [Helpers](/reference/core/helpers) — uses `ScopeEntry` and `ResolvedRef`.
