# Handle field constraints

Store field builders expose a small set of modifiers that attach constraints and defaults to a field. Each modifier returns the same builder (typed to hide already-called methods), so they compose freely.

| Modifier | Effect at runtime |
|---|---|
| `.default(value)` or `.default(factory)` | Field becomes optional at `create`; missing input uses the default |
| `.unique()` | Duplicate values throw on create / update |
| `.index()` | Field is hashed into `ModelIndexes`; powers fast equality lookups |
| `.autoincrement()` | Numeric PK auto-assigned on create |
| `.resetOn(...fields)` | Field reverts to its default when any listed field changes |

All modifiers must be chained inside the `.store()` builder callback before the descriptor is returned. Order does not matter — every modifier returns `this`, and the type system forbids calling the same modifier twice.

## Set a static default

Pass a value to `.default()` to make the field optional at create time:

```ts
import { createContract } from "@kbml-tentacles/core"

const todoContract = createContract()
  .store("id",    (s) => s<number>())
  .store("title", (s) => s<string>())
  .store("done",  (s) => s<boolean>().default(false))
  .store("order", (s) => s<number>().default(0))
  .pk("id")
```

At runtime the omitted field is filled with the default:

```ts
const todoModel = createModel({ contract: todoContract })

todoModel.create({ id: 1, title: "Buy milk" })
// { id: 1, title: "Buy milk", done: false, order: 0 }

todoModel.create({ id: 2, title: "Walk dog", done: true })
// { id: 2, title: "Walk dog", done: true, order: 0 }
```

The default value is captured by reference. For mutable defaults (objects, arrays, maps) use a factory — see below — otherwise every instance would share the same reference.

## Set a factory default

Pass a function to `.default()` to compute the default from fields that have already been resolved:

```ts
createContract()
  .store("id",    (s) => s<number>())
  .store("name",  (s) => s<string>())
  .store("slug",  (s) => s<string>().default((d) => d.name.toLowerCase().replace(/\s+/g, "-")))
  .store("tags",  (s) => s<string[]>().default(() => []))
  .pk("id")
```

The factory receives an object `d` containing every store field declared **before** the current one (plus values supplied in the create payload). Because store fields are resolved top-to-bottom, you can chain dependent defaults:

```ts
createContract()
  .store("id",        (s) => s<number>())
  .store("firstName", (s) => s<string>())
  .store("lastName",  (s) => s<string>())
  .store("fullName",  (s) => s<string>().default((d) => `${d.firstName} ${d.lastName}`))
  .store("initials",  (s) => s<string>().default((d) => d.fullName.split(" ").map((w) => w[0]).join("")))
  .pk("id")
```

Use factory defaults for:

- Generating derived values at create time (slugs, initials, timestamps)
- Fresh mutable containers (`() => []`, `() => new Map()`)
- Time-based values (`() => Date.now()`, `() => crypto.randomUUID()`)

Static defaults compute once; factory defaults run once per `create` call. Neither is reactive — if `firstName` changes later, `fullName` does not re-derive. For reactive computations, use `.derived(...)` instead.

## Enforce uniqueness

`.unique()` registers the field with `ModelIndexes`. Attempting to create or update an instance that produces a duplicate value throws immediately:

```ts
const userContract = createContract()
  .store("id",    (s) => s<number>())
  .store("email", (s) => s<string>().unique())
  .store("name",  (s) => s<string>())
  .pk("id")

const userModel = createModel({ contract: userContract })

userModel.create({ id: 1, email: "a@example.com", name: "Alice" })
userModel.create({ id: 2, email: "a@example.com", name: "Anna" })
// throws TentaclesError: "email" already exists: a@example.com
```

Unique fields also enable fast reverse lookups. Use `Model.byPartialKey(value)` to find an instance by a unique field (O(1) hash lookup instead of O(N) scan).

Uniqueness is enforced per model — every instance uses the same underlying `$dataMap` and `ModelIndexes`. Deleting an instance frees its unique keys so the same value can be reused.

## Add an index

`.index()` does the same registration as `.unique()` but without the duplicate check. Indexed fields power fast equality queries (`eq`) in the query layer:

```ts
const postContract = createContract()
  .store("id",     (s) => s<string>())
  .store("title",  (s) => s<string>())
  .store("status", (s) => s<"draft" | "published">().default("draft").index())
  .store("tag",    (s) => s<string>().index())
  .pk("id")
```

At query time, `where("status", eq("published"))` consults the index directly rather than scanning `$ids`. Non-equality operators (`gt`, `startsWith`, `matches`) still need a scan — indexes help only for equality lookups.

Index a field when:

- It is used frequently in `.where(field, eq(...))` or `.where(field, oneOf(...))` clauses
- Many instances exist (thousands+) and filtered lists are typically small
- The field's value space is not dense (indexes add little value for booleans or tight enums)

Combine `.index()` with `.unique()` if a field must both be unique and support fast lookups:

```ts
createContract()
  .store("id",    (s) => s<number>())
  .store("email", (s) => s<string>().unique().index())
  .pk("id")
```

## Autoincrement a numeric PK

`.autoincrement()` is only valid on number-valued stores. It tells the model to assign the next integer when the field is omitted at create time:

```ts
const messageContract = createContract()
  .store("id",   (s) => s<number>().autoincrement())
  .store("body", (s) => s<string>())
  .pk("id")

const messageModel = createModel({ contract: messageContract })

messageModel.create({ body: "hello" })  // id: 1
messageModel.create({ body: "world" })  // id: 2
messageModel.create({ body: "again" })  // id: 3
```

The autoincrementing counter is model-wide and monotonic. Deleting an instance does not free its id — the counter keeps climbing.

`.autoincrement()` acts as a default — the field becomes optional at create time. If you pass an explicit numeric id that is greater than the counter, the counter jumps:

```ts
messageModel.create({ id: 100, body: "explicit" })  // id: 100
messageModel.create({ body: "next" })                // id: 101
```

Autoincrement can only be declared on one field per model when that field is also the primary key. Combine it with `.pk("id")`:

```ts
createContract()
  .store("id",   (s) => s<number>().autoincrement())
  .store("body", (s) => s<string>())
  .pk("id")
```

The type of the field must be `number`. For UUID-style ids use a factory default:

```ts
createContract()
  .store("id",   (s) => s<string>().default(() => crypto.randomUUID()))
  .store("body", (s) => s<string>())
  .pk("id")
```

## Reset on event

`.resetOn(...fields)` is only available after `.default()` has been called. It wires the field back to its default value whenever any of the listed fields (stores or events) change:

```ts
const filterContract = createContract()
  .store("id",     (s) => s<number>())
  .store("query",  (s) => s<string>().default(""))
  .store("filter", (s) => s<string>().default("all"))
  .store("page",   (s) => s<number>().default(0).resetOn("query", "filter"))
  .pk("id")
```

Whenever `query` or `filter` is written, `page` snaps back to `0`. The reset is reactive — it fires automatically, without you dispatching an event. This is exactly the "reset pagination when filters change" pattern that would otherwise need a manual watcher.

`.resetOn` accepts any sibling store or event name. Use it for:

- Pagination state tied to filter changes
- Ephemeral selection that must clear when the underlying data shifts
- Form steps that reset when inputs are edited

The reset uses the field's default — static value or factory — so factory defaults re-run on every reset.

```ts
createContract()
  .store("id",    (s) => s<number>())
  .store("query", (s) => s<string>().default(""))
  .store("touched", (s) =>
    s<{ at: number; by: string }>()
      .default(() => ({ at: Date.now(), by: "system" }))
      .resetOn("query"),
  )
  .pk("id")
```

Each `query` write produces a fresh `{ at, by }` object via the factory.

## Combining constraints

Modifiers compose in any order — each one returns the builder so you can chain them. Only their side effects matter; the type system tracks which modifiers have been called and hides them to prevent duplicates.

```ts
createContract()
  .store("id",    (s) => s<number>().autoincrement())
  .store("email", (s) => s<string>().unique().index())
  .store("tag",   (s) => s<string>().default("general").index())
  .store("page",  (s) => s<number>().default(0).resetOn("email"))
  .pk("id")
```

A few rules to remember:

- `.autoincrement()` requires the field to be `number` and implies a default — you cannot also call `.default(...)` on the same field.
- `.resetOn(...)` requires `.default(...)` to have been called first — it has nothing to reset to otherwise.
- `.unique()` and `.index()` can be mixed; the unique check runs first, then the field is registered in the index.
- All modifiers can be applied only once — calling `.unique().unique()` is a type error.

If you reorder modifiers (say, `.default(0).index().resetOn("x")`) the behaviour is identical. The constraints are descriptive, not positional — the order they appear in the chain is not the order they run at runtime.
