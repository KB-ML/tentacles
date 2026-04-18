# Tentacles

Type-safe dynamic model factory for [effector](https://effector.dev). Define contracts (schemas) with stores, events, and refs via a chained builder, then instantiate models with full TypeScript inference and SSR scope isolation.

## Core rules

1. NEVER create new runtime effector units if it is possible
2. Pass to developer minimalistic API
3. ALWAYS use lazy approach to create mapped units, if user not using it, it must not be created
4. ALWAYS use OOP style and use design patterns like builder, factory, adapter etc
5. NEVER pass something to class methods if it can be passed to class constructor on class creation
6. NEVER use getState or watch in library code
7. Each task MUST be tested in three cases: default tests, SSR, memory leaking
8. NEVER use `as any`, `as unknown as`, or `as never` — use proper types, `as Function` for callback boundaries, `as` for same-hierarchy widening only

## Project structure

Yarn v1 monorepo with workspaces:

- `packages/core` (`@kbml-tentacles/core`) — library: contract builders, model instantiation, type system, tests
- `packages/forms` (`@kbml-tentacles/forms`) — form management: contract-driven forms with validation, arrays, submission
- `packages/examples` (`@kbml-tentacles/examples`) — demo apps (Next.js SSR)

Build: `tsup` (ESM + CJS + .d.ts), peer dependency on `effector ^23.0.0`.

---

## Architecture overview

Both packages follow a **contract → runtime** pipeline: declare a schema with a fluent builder, then materialize it into reactive Effector units.

### @kbml-tentacles/core

Five layers, each in `packages/core/layers/<name>/`:

#### Contract layer (`contract/`)

Fluent chain builders that accumulate field descriptors via phantom-key generics.

| Chain class | Created by | Purpose |
|---|---|---|
| `ModelContractChain` | `createContract()` | `.store()`, `.event()`, `.derived()`, `.ref()`, `.inverse()`, `.pk()` → `FinalizedContractImpl` |
| `ViewContractChain` | `createViewContract()` | `.store()`, `.event()`, `.derived()` — ephemeral component state, no refs/pk |
| `PropsContractChainImpl` | `createPropsContract()` | `.store()`, `.event()` with `.optional()` — external prop inputs for view models |

All model/view chains extend `BaseContractChain` (holds `fields`, `factoryDefaults`, `sidRoot`).

**Strategy pattern for extensibility**: All chain classes expose a `[CONTRACT_CHAIN_STRATEGY]` property (using `Symbol.for("tentacles:contractChainStrategy")`) implementing the `ContractChainStrategy<C>` interface. Contract utilities (`pick`, `omit`, `partial`, `required`, `merge`) dispatch through this strategy instead of `instanceof` checks, so any chain type — including `FormContractChainImpl` from `@kbml-tentacles/forms` — works automatically.

Field builders: `StoreTypedImpl` (`.default()`, `.unique()`, `.index()`, `.autoincrement()`, `.resetOn()`), `EventTypedImpl`, `PropStoreTypedImpl` / `PropEventTypedImpl` (`.optional()`).

Contract utilities: `pick()`, `omit()`, `partial()`, `required()`, `merge()` — work on all chain types via strategy dispatch.

#### Model layer (`model/`)

`createModel(contract)` → `Model` — persistent instance manager.

Key internals:
- **`$dataMap`** — single `StoreWritable<Record<id, Record>>`, the source of truth for all instance data. ONE store per model, shared by all instances.
- **Field proxies** (`field-proxy.ts`) — per-instance `$field` accessors are zero-cost proxy objects, NOT effector stores. `.getState()` reads `$dataMap[id][field]` directly. `.set()` fires a model-level event (lazy prepend). `.on()` wires a shared model-level `$dataMap` handler via `SharedOnRegistry`. Effector stores are only materialized when `.map()`, `.graphite`, or `combine(it)` is accessed (rare — only for focused/selected items, not bulk rendering).
- **`SharedOnRegistry`** (`field-proxy.ts`) — accumulates `event → field → reducer` mappings at model level. When `fn` does `$count.on(increment, n => n + 1)`, ONE `$dataMap.on(modelEvent, handler)` is wired, shared by ALL instances. Zero per-instance effector nodes for `.on()` wiring.
- **Model-level events** — ONE `createEvent` per contract event field, created in `createModel()`. Per-instance events are lazy prepends on these model events (prepend created on first call, not at creation).
- **Lazy `$instanceSlice`** — standalone `createStore` per instance, only created when a field materializes (for `combine`/`sample`/`scope.getState` usage). Models with no materialized fields create ZERO per-instance stores.
- **Lightweight instances** — models without fn, refs, computed, resetOn, or indexes skip `withRegion` entirely. The `region` field in the cache entry is `null`.
- **`ModelRegistry`** — `$ids`, `$idSet` (O(1) membership), lazy `$instances`, `$pkeys`, `$count`. Memoized `.instance()` and `.byPartialKey()`.
- **`ModelIndexes`** — unique/indexed field constraints, `$version` bumps.
- **`InverseIndex`** — imperative `Map<targetId, Set<sourceIds>>` with bump event for scoped reactivity.
- **`RefApiFactory`** — creates `RefManyApi` (`$ids`, `add`, `remove`, `$resolved`) and `RefOneApi` (`$id`, `set`, `clear`, `$resolved`) per instance/field, backed by `$dataMap`.
- **`PrimaryKeyResolver`** — PK extraction, FK remapping, nested ref data resolution (connect/create/connectOrCreate).
- **`ModelEffects`** — `createFx`, `deleteFx`, `updateFx`, `created`, `deleted`, `cleared` events.
- **`InstanceCache`** — `OrderedMap<ID, Entry>` (doubly-linked list, O(1) ops).
- **`SidRegistry`** — global + per-scope SID deduplication for SSR.
- **`ScopeManager`** — scope/fork isolation.

Instance entry: `{ model: FullInstance, units: Record, region: Node | null, registeredSids: string[] }`.

Creation flow: validate data → resolve PK → `createUnits()` (field proxies + lazy event prepends) → wire into `$dataMap` → run `fn` builder → wire inverse/computed → return `FullInstance` with `$`-prefixed proxy stores.

Per-instance cost:
- **No fn, no refs**: 0 effector nodes, ~0.1KB (proxy objects + $dataMap entry)
- **fn with `.on()` only**: 0 effector nodes (shared model-level handler), ~12KB (region + proxy objects)
- **fn with `createStore`/`combine`**: N extension nodes (user's explicit choice)
- **Field materialization** (rare, on `combine`/`scope.getState`): +1 `.map()` store per field

#### Query layer (`query/`)

`CollectionQuery` — chainable reactive in-memory queries on a Model.

Chain: `.where(field, operator)` → `.when($condition, fn)` → `.orderBy(field, dir)` → `.limit(n)` / `.offset(n)` → `.distinct(field)` → `.groupBy(field)` (→ `GroupedQuery`).

Reactive outputs: `$filtered` → `$sorted` → `$list`, plus `$count`, `$totalCount`, `$ids`, `$first`.

**Incremental query updates**: `$filtered` uses a full-scan `.map()` from `combine([$ids, $dataMap, ...operands])` for structural changes ($ids add/remove, operand changes). Field mutations trigger an incremental `sample` from `_dataMapFieldUpdated` that checks only the changed instance — O(1) instead of O(N). `$sorted` skips re-sort when the changed field is not a sort field (tracked via `$lastField` store).

`QueryField` — `.field(name)` → `$values`, `.update(value)`, `.updated` event. Derived from `$ids` + `$dataMap` (avoids circular deps with `$list`).

`QueryDescriptor` — immutable, returns new instance per builder call. `QueryRegistry` memoizes `CollectionQuery` by descriptor.

Operators (15): `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `oneOf`, `contains`, `includes`, `startsWith`, `endsWith`, `matches`. Each is `Reactive<T>` (accepts `Store<T>` or raw value).

#### View-model layer (`view-model/`)

`createViewModel({ contract, props?, fn? })` → `ViewModelDefinition`.

`.create(props?)` / `.instantiate()`:
- Creates per-instance Effector region (nestable).
- Creates **bare stores** (not virtual — VMs are ephemeral, no `$dataMap` backing).
- Wires `resetOn`, applies `userFn`.
- Returns `ViewModelInstance` with `.shape`, `.lifecycle` (`mounted`, `unmounted`, `$mounted`), `.id`.

Props normalization: store props accept `T | Store<T>`, event props accept `EventCallable<T> | (T) => void`.

`resolveFrom()` — maps shared stores for `<Each>` rendering.

#### Shared layer (`shared/`)

- `detectSidRoot()` — probes SID context via a test store, extracts prefix for SSR SID generation.
- `TentaclesError` / `tentaclesWarn()` — error/warning utilities.

#### Type inference system

Phantom keys (`_bcStores`, `_bcEvents`, `_bcDerived`, `_ccRefs`, `_pcProps`, `_built`, `_pkFields`) carry type info at compile time with zero runtime cost.

Prefix mapping: stores/computed/inverse fields get `$` prefix on instances (`PrefixedKey<K, Entity>`).

Extractor types: `BCStores<T>`, `BCEvents<T>`, `InferBuilt<FC>`, `InferPkFields<FC>`.

Store chaining uses conditional intersection types to hide already-called methods.

---

### @kbml-tentacles/forms

Four layers in `packages/forms/src/`:

#### Form contract layer (`contract/`)

`createFormContract()` → `FormContractChainImpl` — declarative form schema builder.

Chain: `.field(name, builder)`, `.sub(name, contract)`, `.array(name, contract, opts?)`, `.validate(crossFieldValidator)`, `.merge(other)`.

`FormFieldBuilder` / `FormFieldTypedImpl` — per-field configuration:
- Value: `.default()`, `.optional()`, `.disabled()`
- Sync validation: `.validate()`, `.required()`, `.custom()`, `.warn()`
- Async validation: `.validateAsync(fn, { debounce?, runOn? })`
- Triggers: `.validateOn(mode)`, `.reValidateOn(mode)` — modes: `submit | blur | change | touched | all`
- Advanced: `.dependsOn(paths)`, `.transform({ parse, format })`, `.resetOn(events)`

Descriptors: `FormFieldDescriptor` (kind "field"), `FormSubDescriptor` (kind "sub"), `FormArrayDescriptor` (kind "array" with min/max).

#### Form runtime layer (`runtime/`)

`createFormViewModel({ contract, props?, validate?, resetOptions?, preventDoubleSubmit?, initialValues?, fn? })` — returns a `ViewModelDefinition<FormShape>` from `@kbml-tentacles/core`.

Internals:
- **`buildField()`** — materializes `Field<T>` from descriptor: `$value`, `$default`, `$initial`, `$error`, `$warning`, `$dirty`, `$touched`, `$validating`, `$disabled` + events (`changed`, `blurred`, `setValue`, `setError`, `reset`, `validate`). `$dirty` = `!deepEqual($value, $initial)`.
- **`buildFormShape()`** — lazy `Proxy` materializing fields/subs/arrays on first access, cached. Aggregate stores: `$values`, `$errors`, `$errorPaths`, `$isValid`, `$isDirty`, `$isTouched`, `$isValidating`, `$dirtyFields`, `$touchedFields`, `$formError`, `$disabled`, `$isSubmitting`, `$isSubmitted`, `$isSubmitSuccessful`, `$submitCount`. Control events: `submit`, `reset`, `resetTo`, `setValues`, `setValue`, `setError`, `setErrors`, `clearErrors`, `setFormError`, `validate`, `disable`. Lifecycle events: `submitted`, `rejected`, `resetCompleted`.
- **`buildFormArray()`** — form arrays backed by `@kbml-tentacles/core` Model. Each row = model instance with `FormRowShape` (has `key`, `index`, `arrayRef`, `remove()`). Array operations: `append`, `prepend`, `insert`, `remove`, `move`, `swap`, `update`, `replace`, `clear`. Per-row state registry (`$rowStates`). Array aggregates: `$values`, `$errors`, `$isValid`, `$isDirty`, etc. Min/max constraints. `$at(index)` for positional access.
- **`formContractToModelContract()`** — converts form array contract → `@kbml-tentacles/core` model contract with synthetic `__rowId` autoincrement PK.

#### Validation system (`validation/`)

- **`ValidationRunner`** — wires per-field validations with Effector `sample()`. Maintains `$hiddenError` (actual result) + `$visible` (display toggle) split for deferred error display. Inverted dependency graph (one sample per unique dependency). Methods: `validateField(path)`, `validateAll()`, `showAllErrors()`.
- **`AsyncRunner`** — async validator scheduling with per-validator debounce, `AbortController` cancellation, `flushAll()` for SSR. Tracks `$validatingPaths`.
- **Validation modes** — `ValidationMode`: submit (default) | blur | change | touched | all. `ReValidationMode`: change (default) | blur | submit.

Validation flow: field change → sync validators → async validators (debounced) → `$hiddenError` updated → `$visible` gate → `$error` displayed. On submit: `showAllErrors()` → `validateAll()` → route to `submitted` or `rejected`.

#### Orchestrators (`orchestrators/`)

- **`SubmitOrchestrator`** — double-submit guard → set `$isSubmitting` → `showAllErrors()` + `validateAll()` → route to `submitted`/`rejected` → update `$isSubmitSuccessful`.
- **`ResetOrchestrator`** — `reset()` / `resetTo(values)` with `KeepStateOptions` (keepDirty, keepErrors, keepValues, keepTouched, keepSubmitCount, etc.) → fires `resetCompleted`.
- **`SetErrorOrchestrator`** — `setError(path, error)`, `setErrors(pathMap)`, `clearErrors(paths?)`, `setFormError(msg)`.

#### Form types (`types/`)

- `Field<T>` — reactive field unit (stores + events + metadata).
- `FormShape<Values>` — full form surface (aggregates + controls + lifecycle + field access).
- `FormArrayShape<Row>` / `FormRowShape<Row>` — array form with model-backed rows.

---

## Key design patterns

1. **Contract-first** — all schemas declared as descriptors, then materialized into Effector units at runtime.
2. **Strategy pattern for contract utilities** — `ContractChainStrategy<C>` interface + `CONTRACT_CHAIN_STRATEGY` symbol (`Symbol.for`) enables `pick`/`omit`/`partial`/`required`/`merge` to work across all chain types (model, view, props, forms) without `instanceof` checks. New chain types implement the strategy and get utility support automatically.
3. **Lazy Proxy materialization** — form fields/aggregates and model field stores created on first access, cached.
4. **Zero-cost field proxies** — model instance `$field` accessors are proxy objects (not effector stores). `.getState()` reads `$dataMap` directly. `.set()` fires model-level event. Effector stores materialized only when needed for `combine`/`sample`/`scope.getState`.
5. **Shared model-level `.on()` handlers** — `SharedOnRegistry` wires ONE `$dataMap.on(modelEvent)` per event-field combination, shared by all instances. Per-instance `.on()` calls in `fn` are no-ops after the first registration.
6. **Incremental query updates** — field mutations trigger O(1) incremental `$filtered` update via `_dataMapFieldUpdated` event instead of O(N) full-scan. Sort skips re-evaluation when non-sort fields change.
7. **Phantom-key generics** — unique symbols carry type info at compile time, zero runtime cost.
8. **Hidden + visibility split** — validation errors computed eagerly but displayed based on mode/trigger.
9. **Model-backed arrays** — form arrays are real `@kbml-tentacles/core` Model instances, rows = instances.
10. **Chain builder pattern** — fluent API with conditional intersection types hiding already-called methods.
11. **Per-row state registry** — avoids `getState()` in array aggregates; reactive `$rowStates` store.
12. **Inverted dependency graph** — validation dependencies optimized to one sample per unique dep, not per edge.
13. **SSR safety** — SID detection, scope isolation, serializable `$dataMap` + `$instanceSlice` stores with SIDs.
14. **Lightweight instances** — models without fn/refs/computed/indexes skip `withRegion` + `createNode`, reducing per-instance overhead to near zero.

## Tests

Located in `packages/core/tests/` and `packages/forms/tests/`. Each feature tested in three modes: default, SSR (fork/serialize), memory leaking. Key test files cover: creation, fork isolation, refs (create/connect/cascade delete), inverses, queries, compound PKs, autoincrement, indexes, resetOn, view models, stress (10k instances), and contract utilities (pick/omit/partial/required on all chain types).
