# FormArrayShape

The reactive surface of an array field declared with `.array(name, rowContract, opts?)`. Under the hood a `FormArrayShape` is implemented on top of a `@kbml-tentacles/core` Model — each row is a model instance with a synthetic `__rowId` autoincrement primary key.

```ts
interface FormArrayShape<Row> {
  // Aggregates
  $values: Store<Row[]>
  $errors: Store<ReadonlyArray<DeepErrors<Row> | null>>
  $isValid: Store<boolean>
  $isDirty: Store<boolean>
  $isTouched: Store<boolean>
  $isValidating: Store<boolean>
  $arrayError: Store<string | null>

  // Operations
  append: EventCallable<DeepPartial<Row> | DeepPartial<Row>[] | undefined>
  prepend: EventCallable<DeepPartial<Row> | DeepPartial<Row>[] | undefined>
  insert: EventCallable<{ index: number; value: DeepPartial<Row> | DeepPartial<Row>[] }>
  remove: EventCallable<number | number[] | undefined>
  removeKey: EventCallable<string | number>
  move: EventCallable<{ from: number; to: number }>
  swap: EventCallable<{ a: number; b: number }>
  update: EventCallable<{ index: number; value: DeepPartial<Row> }>
  replace: EventCallable<DeepPartial<Row>[]>
  clear: EventCallable<void>

  // Positional access
  $at(index: number): Store<FormRowShape<Row> | null>

  // Metadata
  readonly __path: readonly (string | number)[]
  readonly kind: "array"

  // Model APIs (spread at runtime — not typed)
  // $ids, $count, $idSet, get(), instances(), query(), createFx, deleteFx, updateFx
}
```

## Aggregates

| Store | Description |
|---|---|
| `$values` | `Store<Row[]>` — flat value array, aligned with row order |
| `$errors` | `Store<ReadonlyArray<DeepErrors<Row> \| null>>` — one entry per row; `null` if the row is valid |
| `$isValid` | `true` when every row validates AND `$arrayError` is `null` |
| `$isDirty` | `true` when any row is dirty OR the array itself was edited |
| `$isTouched` | `true` when any row is touched |
| `$isValidating` | `true` while any row has async validators pending |
| `$arrayError` | Array-level violations (e.g., min/max count) |

## Operations

### `append(row | rows | undefined)`

Adds to the end. With `undefined` or no argument, appends one row using contract defaults.

```ts
form.contacts.append()                     // default row
form.contacts.append({ name: "Alice" })    // partial row; missing fields use defaults
form.contacts.append([row1, row2, row3])   // bulk
```

### `prepend(row | rows | undefined)`

Adds to the start.

### `insert({ index, value })`

Insert at a specific position.

```ts
form.contacts.insert({ index: 2, value: { name: "Bob" } })
```

### `remove(index | indices | undefined)`

Remove by position. With `undefined` or no argument, removes every row.

```ts
form.contacts.remove(0)              // remove first
form.contacts.remove([1, 3])         // remove multiple
form.contacts.remove()               // clear all
```

### `removeKey(key)`

Remove by stable identifier. Uses the `key` option from `FormArrayOptions`, or the synthetic `__rowId` if no key was declared.

```ts
form.contacts.removeKey("contact-123")
```

### `move({ from, to })` / `swap({ a, b })`

Reorder without recreating rows — preserves per-row state (dirty/touched/errors).

```ts
form.contacts.move({ from: 0, to: 5 })
form.contacts.swap({ a: 1, b: 4 })
```

### `update({ index, value })`

Patch fields on a row (deep merge).

```ts
form.contacts.update({ index: 2, value: { phone: "+1-555-0100" } })
```

### `replace(rows)`

Replace the entire list. Each existing row is destroyed; new rows are created from defaults.

```ts
form.contacts.replace([{ name: "Alice" }, { name: "Bob" }])
```

### `clear()`

Remove all rows.

## Positional access

### `$at(index: number): Store<FormRowShape<Row> | null>`

Returns a reactive store that tracks which row is currently at that index. Returns `null` when out of bounds.

```ts
const $first = form.contacts.$at(0)
useUnit($first)?.email       // Field<string> for the first row's email
```

`$at` is reactive across reorders — `$at(0)` keeps pointing at whatever is at index 0, not the row that originally occupied it.

## Model APIs (spread at runtime)

Because each row is a model instance, the core `Model` API is spread onto `FormArrayShape` via `Object.assign`. These are not declared in the `FormArrayShape` interface (to avoid a circular dependency with `@kbml-tentacles/core`), but they exist at runtime:

- `$ids: Store<number[]>` — row `__rowId` values in order
- `$count: Store<number>`
- `instances(): FormRowShape<Row>[]` — synchronous snapshot
- `get(id): FormRowShape<Row> | null` — sync lookup by `__rowId`
- `query()` — full [CollectionQuery](/reference/core/collection-query) API
- `createFx` / `updateFx` / `deleteFx` — model-level effects

This lets you iterate with `<Each>` from `@kbml-tentacles/react`/`vue`/`solid`:

```tsx
<Each model={form.contacts} source={form.contacts.$ids}>
  {(row) => <ContactEditor row={row} />}
</Each>
```

Or filter rows reactively:

```ts
const active = form.contacts.query().where("active", eq(true))
active.$ids     // Store<ModelInstanceId[]>  — driver for <Each>
active.$list    // Store<Row[]>              — plain row data
```

`$list` emits **plain data rows** (field snapshots, no `FormRowShape`). Use `$ids` to drive `<Each>` or call `form.contacts.get(id)` for the full row shape.

TypeScript will not see these methods on `FormArrayShape` directly — cast to `Model<…>` if you need the types, or use the `<Each>` components which handle this internally.

## Array options

Set via `.array(name, rowContract, opts?)` on the contract:

```ts
interface FormArrayOptions {
  min?: number                           // minimum row count
  max?: number                           // maximum row count
  key?: string | ((row: unknown) => string)  // stable row identifier
}
```

`min` / `max` violations populate `$arrayError`. `key` is used by `removeKey` and by `<Each>` for stable React/Vue/Solid list keys across reorders.

## Metadata

- `__path: readonly (string | number)[]` — array location within the form
- `kind: "array"` — discriminator

## See also

| Topic | Link |
|---|---|
| Per-row shape | [FormRowShape](/reference/forms/form-row-shape) |
| How arrays work internally | [Explanation: Form arrays as models](/explanation/form-arrays-as-models) |
| Iterating rows in UI | [Each (React)](/reference/react/each), [Each (Vue)](/reference/vue/each), [Each (Solid)](/reference/solid/each) |
| Practical patterns | [How-to: Work with form arrays](/how-to/work-with-form-arrays) |
