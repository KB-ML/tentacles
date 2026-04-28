---
description: "Reference for store/event field builder APIs used inside contract chains."
---

# Field builders

The `s` and `e` parameters passed to `.store()` and `.event()` are callable builders. Invoking them as `s<T>()` or `e<T>()` declares the field's payload type and returns a chainable descriptor. This page specifies the full surface of those builders — the `StoreTypedImpl` methods available inside `.store()`, the `EventFieldBuilder` shape inside `.event()`, and the `.optional()` method on prop builders.

> The builders are functions, not objects. Write `s<T>()` (with parentheses). Do not write `s.type<T>()` — that method does not exist.

## Store field builder

```ts
type StoreFieldBuilder<Prev extends Record<string, unknown> = {}> = <T>() => StoreTyped<T, Prev>
```

`s<T>()` returns a `StoreTypedImpl` instance, a fluent descriptor with chainable methods. Each method returns `this` with a widened phantom type, so method ordering is free. The final descriptor is read by the contract chain at the end of the builder call.

### `.default(value)` / `.default(factory)`

```ts
.default(value: T): this
.default(factory: (data: Record<string, unknown>) => T): this
```

Declares a default for the field, making it optional at `Model.create({})`/view-model `.create()` time.

```ts
createContract()
  .store("id",     (s) => s<number>())
  .store("status", (s) => s<"draft" | "published">().default("draft"))
  .store("tags",   (s) => s<string[]>().default(() => []))
  .store("slug",   (s) => s<string>().default((data) => `post-${data.id}`))
  .pk("id")
```

- Passing a value: every newly created instance starts with that value.
- Passing a factory: the factory is invoked with the raw create-input record; its return value is used as the default. Factories receive the caller's data before PK resolution and before ref operations.

Factory defaults are stored separately and registered on the finalized contract. They are called once per create — not reactively on subsequent updates.

### `.unique()`

```ts
.unique(): this
```

Marks the field as unique. At runtime, `Model.create({})` throws if another instance already has the same value for this field. The uniqueness index is maintained in `ModelIndexes` and survives `fork({ values })` hydration.

```ts
createContract()
  .store("id",    (s) => s<number>())
  .store("email", (s) => s<string>().unique())
  .pk("id")
```

Uniqueness is checked eagerly on create and on update (via `model.updateFx`). Attempting to violate it rejects the effect.

### `.index()`

```ts
.index(): this
```

Registers the field for fast equality lookup. The query layer consults `$index` when a `.where(field, eq(x))` operator references an indexed field, replacing the O(N) scan with an O(1) lookup.

```ts
createContract()
  .store("id",     (s) => s<number>())
  .store("status", (s) => s<string>().index())
  .pk("id")
```

Indexes are maintained alongside uniqueness in `ModelIndexes` with a reactive `$version` bump store. Under SSR the index is rebuilt per scope.

### `.autoincrement()`

```ts
.autoincrement(): this
```

Marks the field as auto-incremented. On create, if the caller did not provide a value, the model assigns the next integer (starting at 1). Also sets `hasDefault` to `true` — the field becomes optional at create time.

```ts
createContract()
  .store("id", (s) => s<number>().autoincrement())
  .store("title", (s) => s<string>())
  .pk("id")
```

The autoincrement counter lives inside the model and is bumped per create. Under `fork({ values })`, the counter is restored so subsequent creates do not reuse existing IDs.

**Type note**: at the type level, `.autoincrement()` is only available on numeric fields (`T extends number`). Calling it on a non-numeric field is a compile-time error.

### `.resetOn(...fields)`

```ts
.resetOn(...fields: string[]): this
```

Registers a list of field names that should reset this field back to its default when any of them change. Requires `.default()` to have been called first — the type system enforces this by only exposing `.resetOn` after `.default` (or `.autoincrement`).

```ts
createViewContract()
  .store("query", (s) => s<string>().default(""))
  .store("page",  (s) => s<number>().default(1).resetOn("query"))
```

Multiple `.resetOn(...)` calls accumulate. The listed field names must refer to other declared stores in the same contract; invalid names surface at runtime during instance creation.

Reset wiring is lazy — it does not materialize additional effector nodes unless the field is actually observed. See [Field proxies](/explanation/field-proxies).

### Descriptor output

Internally, `StoreTypedImpl.toDescriptor()` produces:

```ts
{
  store: {
    kind: ContractFieldKind.State,
    isUnique: boolean,
    isIndexed: boolean,
    hasDefault: boolean,
    isAutoIncrement: boolean,
    defaultValue?: T,    // only present for non-factory, non-autoincrement defaults
    resetOn?: string[],  // only present if non-empty
  },
  factoryDefault?: (data: Record<string, unknown>) => T,  // only present for factory defaults
}
```

Users do not call `toDescriptor` directly — the contract chain does it inside `.store()`.

### Ordering

All chain methods return `this`. The order in which you call them does not affect the resulting descriptor:

```ts
// These three declarations are equivalent:
s<string>().default("").unique().index()
s<string>().unique().index().default("")
s<string>().index().default("").unique()
```

A method is only omitted from the chain's type (hidden from autocomplete) after it has been called — calling `.default()` twice is a TypeScript error.

## Event field builder

```ts
type EventFieldBuilder = <T>() => EventResult<T>
```

`e<T>()` returns an `EventResult<T>` descriptor. The builder has no chainable methods beyond the payload type.

```ts
createContract()
  .store("id",    (s) => s<number>())
  .event("rename", (e) => e<string>())
  .event("toggle", (e) => e<void>())
  .pk("id")
```

Use `e<void>()` for payload-less events. The declared type becomes the event's payload type at runtime (`EventCallable<T>`), checked via effector's generics.

## Prop store builder

```ts
type PropStoreFieldBuilder = () => PropTypedImpl
```

The `s` parameter inside `createPropsContract().store(name, s => ...)` is different from the model-store builder — it only accepts `.optional()` as a chainable method.

```ts
createPropsContract()
  .store("title",   (s) => s<string>())
  .store("subtitle", (s) => s<string>().optional())
```

`.optional()` marks the prop as optional in the consumer's `CreateInput`. See [createPropsContract](/reference/core/create-props-contract) for the full surfacing behaviour.

## Prop event builder

```ts
type PropEventFieldBuilder = () => PropTypedImpl
```

The `e` parameter inside `createPropsContract().event(name, e => ...)` is symmetrical with prop-store builder — it exposes `.optional()` and nothing else.

```ts
createPropsContract()
  .event("onSubmit", (e) => e<{ query: string }>())
  .event("onCancel", (e) => e<void>().optional())
```

When an optional event prop is missing at `.create()` time, the view model wires an internal event whose watcher does nothing — you can still `sample()` from `ctx.props.onCancel` safely, but nothing observable happens.

## Notes

- Type parameters on `s<T>()` / `e<T>()` are inferred from the generic alone. There is no runtime value passed through the builder for the type argument — it is a phantom.
- The store builder is stateless *between* different `.store(...)` calls: `createStoreFieldBuilder()` returns a new `StoreTypedImpl` each invocation, so state from one field does not leak into another.
- Prop builders are simpler than store builders: they do not support `default`, `unique`, `index`, `autoincrement`, or `resetOn`. Those concepts do not apply to external inputs.

## Related

- [createContract](/reference/core/create-contract) — the consumer of `s` and `e` builders for models.
- [createViewContract](/reference/core/create-view-contract) — the same grammar in view contracts.
- [createPropsContract](/reference/core/create-props-contract) — the `.optional()`-only builders for props.
