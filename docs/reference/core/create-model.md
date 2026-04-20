# createModel

`createModel` materialises a finalized contract into a persistent `Model` — the runtime factory that owns `$dataMap`, emits CRUD effects, and hands out instance objects. The function takes a single config object, returns a strongly-typed `Model<Contract, Generics, Ext, PkFields>`, and is the only way to obtain a model instance at runtime.

## Signature

```ts
function createModel<
  FC extends FinalizedContractImpl<any, any, any, any, any>,
  R,
>(config: {
  contract: FC
  refs?: RefsConfig<InferBuilt<FC>>
  fn?: (model: ContractModel<InferBuilt<FC>, {}>) => R
  name?: string
}): Model<
  InferBuilt<FC>,
  {},
  ExtractExtensions<ContractModel<InferBuilt<FC>, {}>, R>,
  InferPkFields<FC>
>
```

Only `contract` is required. The contract **must** come from a chain closed with `.pk(...)` — `createContract().store(...).pk("id")`. Passing an un-finalized chain is a compile-time error.

## Config

| Key | Type | Default | Purpose |
|---|---|---|---|
| `contract` | `FinalizedContractImpl` | — | Finalized model contract from `.pk()`. Required. |
| `refs` | `{ [field]: () => TargetModel }` | `undefined` | Resolves ref/inverse target models via lazy thunks. Required when the contract declares ref or inverse fields that point to other models. |
| `fn` | `(model) => R` | `undefined` | Runs once per model. Wires reducers, returns extensions. |
| `name` | `string` | `"unnamed"` | Label folded into SIDs and debug output. |

The contract carries all field descriptors — stores, events, derived, refs, inverses, and the PK. `createModel` inspects them, pre-computes field categories, and decides whether the model is **lightweight** (no `fn`, refs, computed, resetOn, unique/indexed) — in which case per-instance regions are skipped.

## The `fn` builder

`fn` receives a single object — the model unit map. For each contract field it contains:

| Contract kind | Unit key | Type |
|---|---|---|
| `.store("title", ...)` | `$title` | `StoreProxy<string>` (proxy, not store) |
| `.event("rename", ...)` | `rename` | `EventCallable<string>` |
| `.derived("upper", ...)` | `$upper` | `Store<string>` |
| `.ref("author", "one")` | `author` | `RefOneApi` |
| `.ref("tags", "many")` | `tags` | `RefManyApi` |
| `.inverse("posts", ...)` | `$posts` | `Store<ID[]>` |

Crucially, `fn` runs **once** — not per instance. Calls like `$title.on(rename, ...)` register a single model-level reducer in the `SharedOnRegistry`; all current and future instances share that handler. Creating a new effector store inside `fn` (e.g. `createStore(0)`) produces one store for the whole model, not one per instance.

```ts
import { createModel } from "@kbml-tentacles/core"

const todoModel = createModel({
  contract: todoContract,
  name: "todo",
  fn: ({ $title, $done, rename, toggle }) => {
    $title.on(rename, (_prev, next) => next)
    $done.on(toggle, (prev) => !prev)
    return {}
  },
})
```

## Returning `{}`

Returning `{}` means "use the default instance shape — no extras." The model's instance type is `ContractModel<Contract, {}>` unchanged.

```ts
const plainModel = createModel({
  contract: userContract,
  fn: () => ({}),
})
```

This form is the common case for contracts that only need `.on()` wiring. Omitting `fn` entirely is equivalent and marks the model as eligible for the lightweight path.

## Returning extensions

Whatever keys `fn` returns are merged into every instance's shape via the `Ext` generic.

```ts
const timerModel = createModel({
  contract: timerContract,
  fn: ({ $elapsed, tick }) => {
    const $isRunning = createStore(false)
    return { $isRunning }
  },
})

// each instance: { $elapsed, tick, $isRunning, ... }
```

Extensions are shared across all instances — they are created once in `fn`. To give each instance its own state, use a contract store or a ref, not an extension.

## Events are pre-wired inside `fn`

Events accessed from the `fn` argument are the model-level effector events, not fresh ones. Calling `$title.on(rename, ...)` inside `fn` wires the shared handler; calling `.on(createEvent(), ...)` on a proxy instead materialises the proxy (external event path — rarely needed).

Every contract event already exists as a model-level `EventCallable` before `fn` runs. Per-instance event callables are lazy prepends on these model events — created only when accessed on an instance.

## Name and SIDs

The `name` field affects SSR SID generation. Each `$dataMap`, `$ids`, and effect gets a SID shaped like `tentacles:<name>:__dataMap__` so that fork values survive serialization. Distinct models must have distinct names; duplicates produce colliding SIDs and unpredictable hydration.

```ts
createModel({ contract, name: "user" })   // SIDs use "user"
createModel({ contract, name: "todo" })   // SIDs use "todo"
```

## Inference behaviour

- `InferBuilt<FC>` extracts the contract field map at the type level.
- `InferPkFields<FC>` extracts the PK field names.
- `ExtractExtensions<ContractModel<...>, R>` subtracts the default shape from `R` to avoid double-typing the built-in units.

The resulting `Model` type carries all four generics so downstream consumers (`Model.create`, `Model.instance`, `Model.query`) get full inference on field names, payload types, and PK shape without manual type arguments.

## Refs

When a contract declares `ref` or `inverse` fields that point to other models, pass the target models through the `refs` option. Each value is a thunk — invoked lazily on first resolution — which lets bidirectional and circular relationships forward-reference each other without ordering gymnastics.

```ts
const userModel = createModel({
  contract: userContract,
  refs: { posts: () => postModel },
})

const postModel = createModel({
  contract: postContract,
  refs: { author: () => userModel },
})
```

Self-refs (`.ref("parent", "one")` on a model that targets itself) don't require an entry — the runtime falls back to `this`. Missing or unbound targets throw a clear `TentaclesError` at first resolution.

## Common patterns

### Pure state model (no fn)

```ts
const counterModel = createModel({ contract: counterContract })
counterModel.create({ id: 1, value: 0 })
```

Skipping `fn` makes the model lightweight — zero per-instance effector nodes.

### Reducers only

```ts
createModel({
  contract,
  fn: ({ $value, increment }) => {
    $value.on(increment, (n) => n + 1)
    return {}
  },
})
```

### Shared state extension

```ts
createModel({
  contract,
  fn: () => ({ $globalTick: createStore(0) }),
})
```

`instance.$globalTick` is the same `Store` across every instance.

### External event wiring

```ts
const saved = createEvent<void>()

createModel({
  contract,
  fn: ({ $dirty }) => {
    $dirty.on(saved, () => false) // materialises $dirty — external event
    return {}
  },
})
```

External events (events not declared on the contract) trigger field-proxy materialisation, which creates a per-model mapped store. Keep this in mind if memory is critical — declare the event on the contract where possible.

## Errors

- Calling `createModel` with a non-finalized chain is a **compile-time** error.
- Passing `contract: undefined` at runtime throws `TentaclesError`.
- Any `fn` that creates two entries with the same key as a contract field silently wins — the contract field is overwritten on the unit map. Avoid name collisions.

## See also

- [`Model`](./model.md) — the returned object's public surface.
- [`ModelInstance`](./model-instance.md) — the shape of individual records.
- [`createContract`](./create-contract.md) — building the `FC` passed here.
