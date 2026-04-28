---
description: "Reference for @kbml-tentacles/core: contracts, models, queries, view models, and shared utilities."
---

# `@kbml-tentacles/core`

The framework-agnostic core of Tentacles. Provides contract builders for declaring schemas, model factories that materialise schemas into reactive instance managers, a chainable query layer for filtering and grouping, and view-model factories for ephemeral component state. Built on top of [effector](https://effector.dev); peer dependency `effector ^23.0.0`.

> Bundle: ESM + CJS + `.d.ts`. `sideEffects: false`. No runtime configuration — every export is pure.

## Install

```bash
npm install @kbml-tentacles/core effector
```

```bash
yarn add @kbml-tentacles/core effector
```

```bash
pnpm add @kbml-tentacles/core effector
```

`effector ^23.0.0` is a peer dependency. Install it explicitly if your project does not already depend on it.

## Exports

### Contract layer

| Export | Kind | Description |
|---|---|---|
| [`createContract`](/reference/core/create-contract) | function | Start a new model contract chain. |
| [`createViewContract`](/reference/core/create-view-contract) | function | Start a new view contract chain (no refs/pk). |
| [`createPropsContract`](/reference/core/create-props-contract) | function | Start a new props contract chain. |
| `ModelContractChain` | class | Type returned by `createContract()`. |
| `ViewContractChain` | class | Type returned by `createViewContract()`. |
| `PropsContractChainImpl` | class | Type returned by `createPropsContract()`. |
| `BaseContractChain` | class | Shared base for model and view chains. |
| `FinalizedContractImpl` | class | Sealed contract returned by `.pk()`. |
| [`pick`](/reference/core/contract-utilities) | function | Derive a new chain keeping selected fields. |
| [`omit`](/reference/core/contract-utilities) | function | Derive a new chain dropping selected fields. |
| [`partial`](/reference/core/contract-utilities) | function | Make every field optional. |
| [`required`](/reference/core/contract-utilities) | function | Make every field required. |
| [`merge`](/reference/core/contract-utilities) | function | Combine two chains; throws on collision. |
| [`registerChainOps`](/reference/core/contract-utilities) | function | Register strategy ops for a custom chain type. |
| `ContractFieldKind` | enum | `State`, `Event`, `Computed`, `Ref`, `Inverse`. |

### Model layer

| Export | Kind | Description |
|---|---|---|
| [`createModel`](/reference/core/create-model) | function | Materialise a finalized contract into a `Model`. |

### Query layer

| Export | Kind | Description |
|---|---|---|
| [`CollectionQuery`](/reference/core/collection-query) | class | Chainable reactive query produced by `model.query()`. |
| [`GroupedQuery`](/reference/core/grouped-query) | class | Result of `.groupBy()` on a `CollectionQuery`. |
| [`QueryField`](/reference/core/query-field) | class | Single-field projection produced by `.field()`. |
| `QueryDescriptor` | class | Immutable description of a query (used internally). |
| `QueryRegistry` | class | Memoizes `CollectionQuery` instances by descriptor. |
| [`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `oneOf`, `contains`, `includes`, `startsWith`, `endsWith`, `matches`](/reference/core/operators) | functions | Query operators returned by the operator factories. |

### View-model layer

| Export | Kind | Description |
|---|---|---|
| [`createViewModel`](/reference/core/create-view-model) | function | Build a `ViewModelDefinition` from a contract, props, and `fn`. |
| `ViewModelDefinition` | class | The instance factory returned by `createViewModel`. |
| [`resolveFrom`](/reference/core/helpers) | function | Walk a `ScopeEntry[]` stack to resolve a ref by field name. |

### Shared

| Export | Kind | Description |
|---|---|---|
| [`detectSidRoot`](/reference/core/helpers) | function | Probe the SID context to extract a prefix for SSR. |
| [`TentaclesError`](/reference/core/helpers) | class | Library-internal error class. |

### Type exports

See [Types](/reference/core/types) for descriptions of every exported type, including:

- Contract: `ContractEntity`, `ContractStore`, `ContractRef`, `ContractInverse`, `BuildContract`, `StoreMeta`, `AnyRefOrInverse`.
- Finalization: `Built<S, E, D, R>`, `InferBuilt<FC>`, `InferPkFields<FC>`.
- Model: `ModelInstance`, `ModelInstanceId`, `ModelStore`, `ModelCreateInput`, `UpdateData`, `ApplyRefs`, `BindableFieldNames`, `RefsConfig`, `CompoundKey`, `PkResult`, `ContractModelRefData`, `ContractModelRefOperations`, `ContractPkInput`, `InstanceMeta`.
- Refs: `RefManyApi`, `RefManyCreateData`, `RefManyElement`, `RefManyOperations`, `RefOneApi`, `RefOneOperation`.
- Query: `Operator<T>`, `QueryContext`, `Reactive<T>`.
- View-model: `ResolvedRef`, `ScopeEntry`, `ViewModelInstance`.

## Versioning

`@kbml-tentacles/core` follows semantic versioning. The library is currently in `0.x` — minor versions may include breaking changes. The peer-dependency range on `effector` is bounded by major; upgrading effector across major versions may require waiting for a matching tentacles release.

## Notes

- All exports are tree-shakeable. Unused operators (`gt`, `oneOf`, etc.) are dropped at bundle time.
- The library never reads `process.env` at runtime and has no global configuration. Every behaviour is selected by the contract you pass in.
- SSR support is built in. See [SSR and SIDs](/explanation/ssr-and-sids) for the model.
