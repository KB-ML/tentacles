# ModelInstance

A `ModelInstance` is the object returned from `Model.create` (or read through `Model.getSync`, `Model.instance`, etc.). Fields are exposed as zero-cost proxies under `$`-prefixed keys for stores and derived, raw names for events, and typed ref APIs for relationships. Metadata lives under `@@instanceId` and `@@meta`. This page documents what each accessor supports and when a proxy materialises into a real effector store.

## Shape overview

For a contract with:

```ts
createContract()
  .store("title",  (s) => s<string>())
  .event("rename", (e) => e<string>())
  .ref("author",   "one")
  .derived("upper", (s) => s.$title.map((v) => v.toUpperCase()))
  .inverse("posts", "author")
  .pk("id")
```

an instance carries:

```ts
interface TodoInstance {
  $title:  StoreProxy<string>
  rename:  EventCallable<string>
  author:  RefOneApi<UserInstance>
  $upper:  Store<string>            // derived → real Store
  $posts:  Store<ModelInstanceId[]> // inverse → ids only; resolve via postModel.get(id)

  readonly "@@instanceId": string
  readonly "@@meta":       InstanceMeta
}
```

Any extension returned by `fn` is spread in alongside these keys.

## Field proxies (`$field` for stores)

Contract stores become `StoreProxy<T>` — a proxy object that *looks* like an effector `StoreWritable<T>` but carries no graph node until one is needed. This is the default for every `.store()` declaration on a model contract.

### `.getState`

```ts
$title.getState(): T
```

O(1) read against `$dataMap[instanceId][field]`. No effector subscription — safe to call often.

```ts
const title = todo.$title.getState()
```

### `.set`

```ts
$title.set: EventCallable<T>
```

Callable as a function (`$title.set("New")`) and usable as an event (`sample({ clock: fx.doneData, target: $title.set })`). Internally it is a lazy `prepend` on the model-level field-set event — one real effector event per model, not per instance.

```ts
todo.$title.set("Shipping")
sample({ clock: fx.doneData, target: todo.$title.set })
```

### `.on`

```ts
$title.on<E>(clock: EventCallable<E>, reducer: (state: T, payload: E) => T): StoreProxy<T>
```

Registers a reducer. When `clock` is a contract event exposed on the same proxy's model (typical — `$title.on(rename, fn)`), the reducer is stored in the `SharedOnRegistry` and a single model-level `$dataMap.on` handler applies it to every instance. When `clock` is an external event, the proxy materialises and falls back to a standard effector `.on`.

```ts
$title.on(rename, (_prev, next) => next)  // shared — no per-instance node
$title.on(fx.doneData, (_prev, r) => r.title) // materialises $title
```

### `.map`

```ts
$title.map<U>(fn: (state: T) => U): Store<U>
```

Triggers **materialisation** — the proxy creates its own `StoreWritable<T>` wired to `$dataMap`, then calls `.map` on the real store. Returns a standard effector `Store<U>`. Use only when you need a derived store; prefer a contract `.derived(...)` for anything declared up-front.

### `.watch`

```ts
$title.watch(cb: (state: T) => void): () => void
```

Accessible, but requires materialisation. Every frontend library binding already takes care of subscription; calling `.watch` directly in library code is almost never needed.

### `.updates`

```ts
$title.updates: Event<T>
```

Lazy. Accessing the property materialises the proxy and returns `updates` on the underlying store.

### `.graphite`

Internal effector property. Accessing it — directly or indirectly through `combine`, `sample`, `is.store`, framework bindings — forces materialisation. `is.store($title)` returns `true` either way because the proxy reports `kind: "store"`.

### Materialisation cost

A proxy that never materialises costs ~0.1 KB (the proxy object + `$dataMap` entry). Once materialised, it allocates one `StoreWritable<T>` node wired by `sample` to `$dataMap`. Materialisation is permanent for the lifetime of the instance.

## Event fields (raw name)

Contract events become `EventCallable<T>` on every instance. Each is a lazy `prepend` on the model-level event:

```ts
todo.rename("New title")           // calls model-level event with { id, payload }
sample({ clock: save, target: todo.rename })
```

The prepend is created on first access, not at instance creation. A model with 10 000 instances and one contract event has exactly one effector event; the first time each instance's `.rename` is touched a prepend is added.

## Derived fields (`$field`)

`.derived(name, (s) => s.$other.map(...))` declarations become **real** effector stores — the builder runs at model creation and returns a `Store<U>` that the instance simply exposes. No materialisation needed; they are already live.

```ts
todo.$upper            // Store<string>
todo.$upper.getState() // "SHIPPING"
```

## Ref fields (raw name)

`.ref("author", "one")` → `RefOneApi<UserInstance>`. `.ref("tags", "many")` → `RefManyApi<TagInstance>`. See [`Ref APIs`](./ref-api.md) for the complete surface. All ref stores and events are backed by `$dataMap` so they survive SSR serialization without special handling.

## Inverse fields (`$field`)

`.inverse("posts", "author")` — no per-instance storage. `instance.$posts` is a derived `Store<ModelInstanceId[]>` that reads the shared `InverseIndex.$byTarget` map. Resolve ids to instances with `postModel.get(id)`. Mutating a post's `author` ref reactively updates every affected user's `$posts`. The ids-not-instances shape avoids a cross-model type inference cycle (typing it as `Store<PostInstance[]>` would require `workflowModel` to know `typeof logModel` and vice-versa, which TypeScript cannot resolve).

## Metadata

### `@@instanceId`

```ts
instance["@@instanceId"]: string
```

The canonical id as a string. For single PKs this is `String(pkValue)`; for compound PKs it is the parts joined with the cache's compound-PK delimiter. Use this for logging, debugging, keying React lists, etc.

### `@@meta`

```ts
instance["@@meta"]: {
  id: string
  pkeys: Record<string, string | number>
  ...
}
```

Structural data about the instance — the id, the destructured PK field values, and internal markers used by framework bindings. Treat this as read-only. Fields may be added in future versions.

## Extensions

Whatever `fn` returns is merged on top of the default shape:

```ts
createModel({
  contract,
  fn: () => ({ $globalTick: createStore(0) }),
})

todo.$globalTick       // Store<number>
```

Extensions are **shared** across all instances by default (the `fn` runs once). To attach per-instance state, declare a contract store instead.

## Proxies are not effector stores

A key distinction: a `$field` accessor is **not** a `StoreWritable<T>` — it is a proxy that responds to the same method surface. The difference is observable:

| Operation | Proxy behaviour |
|---|---|
| `combine([todo.$title])` | Materialises the proxy. |
| `sample({ source: todo.$title })` | Materialises the proxy. |
| `scope.getState(todo.$title)` | Materialises the proxy. |
| `todo.$title.getState()` | Reads `$dataMap` directly, no materialisation. |
| `todo.$title.set(v)` | Uses shared model-level event, no materialisation. |
| `todo.$title.on(e, fn)` | Uses `SharedOnRegistry`, no materialisation (for contract events). |

For high-count collections — rendering a 10 000-row table — use `Model.$ids` + per-row `Model.get(id)` and read field values through `.getState()` or bind them through the framework adapter, which avoids materialisation for fields that are only displayed. Reach for `combine` / `sample` only when you genuinely need cross-field reactivity outside the framework render path.

## See also

- [`Model`](./model.md) — producer of instances.
- [`Ref APIs`](./ref-api.md) — `RefOneApi` / `RefManyApi`.
- [Explanation — Field proxies](../../explanation/field-proxies.md) — design rationale.
