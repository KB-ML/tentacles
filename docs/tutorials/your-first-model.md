# Your first model

In this tutorial you will build a small library of `bookModel` records using `@kbml-tentacles/core` — no UI, no framework, just the library and Node.js. By the end you will have created a contract, instantiated a model, added and queried records, wired a reactive derived field, and used SSR-safe fork isolation.

Follow the steps in order — each one builds on the previous file.

## Prerequisites

- Node.js 20 or later
- A new empty folder
- An editor with TypeScript support

## 1. Set up the project

Create the project folder and install the two packages you need — `effector` (peer dependency) and `@kbml-tentacles/core`.

::: code-group

```sh [npm]
mkdir tentacles-books && cd tentacles-books
npm init -y
npm install effector @kbml-tentacles/core
npm install -D typescript tsx @types/node
npx tsc --init
```

```sh [yarn]
mkdir tentacles-books && cd tentacles-books
yarn init -y
yarn add effector @kbml-tentacles/core
yarn add -D typescript tsx @types/node
npx tsc --init
```

```sh [pnpm]
mkdir tentacles-books && cd tentacles-books
pnpm init
pnpm add effector @kbml-tentacles/core
pnpm add -D typescript tsx @types/node
npx tsc --init
```

:::

Open `tsconfig.json` and ensure strict mode is on — Tentacles infers a lot of types, and strict mode helps you see them.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true
  }
}
```

## 2. Define your first contract

A **contract** is a schema: it declares what fields a model has and how they behave. You build contracts with a chained DSL — each method adds one field and narrows the type.

Create `src/book.ts`:

```ts
import { createContract, createModel } from "@kbml-tentacles/core"

const bookContract = createContract()
  .store("id", (s) => s<number>())
  .store("title", (s) => s<string>())
  .store("author", (s) => s<string>())
  .store("pages", (s) => s<number>())
  .pk("id")

export const bookModel = createModel({ contract: bookContract })
```

A few things worth noting:

- **`s<T>()` is a call**, not a property — you invoke `s` with a type argument to declare the value type. There is no `s.type<T>()`.
- **`.pk("id")` finalizes the chain.** Before `.pk()` you have a `ModelContractChain` you can keep building on. After `.pk()` you have a `FinalizedContractImpl` ready to pass to `createModel`.
- **`createModel({ contract })` takes a config object.** The `contract` field is required; `fn` and `name` are optional (you will meet them later).

## 3. Create and read instances

Each call to `bookModel.create(...)` materializes a new instance of the model. Add to the bottom of `src/book.ts`:

```ts
const hobbit = bookModel.create({
  id: 1,
  title: "The Hobbit",
  author: "J.R.R. Tolkien",
  pages: 310,
})

console.log(hobbit.$title.getState())  // "The Hobbit"
console.log(hobbit.$pages.getState())  // 310
console.log(bookModel.$count.getState())    // 1
console.log(bookModel.$ids.getState())      // [1]
```

Run it:

```sh
npx tsx src/book.ts
```

**What just happened?** `bookModel.create()` returned a `FullInstance` — an object whose keys match your contract, with a `$` prefix for store fields. Each `$`-field is a zero-cost proxy: calling `.getState()` reads the value directly from the model's shared `$dataMap` store. No per-instance effector stores were created.

`bookModel.$count` and `bookModel.$ids` are **built-in stores** on every model — they update reactively when you add or remove instances.

## 4. Add a default and a derived field

Let's add a `readingTime` that is computed from `pages`, and default `pages` to zero. Replace the contract:

```ts
const bookContract = createContract()
  .store("id", (s) => s<number>())
  .store("title", (s) => s<string>())
  .store("author", (s) => s<string>())
  .store("pages", (s) => s<number>().default(0))
  .derived("readingTime", (s) =>
    s.$pages.map((p) => `${Math.ceil(p / 30)} days`),
  )
  .pk("id")
```

- `.default(0)` — now `pages` is optional in `create()` and falls back to `0`.
- `.derived(name, factory)` — registers a computed store. The factory receives an object of the declared stores (prefixed with `$`) and returns any `Store<T>`.

Now you can create a book with less data:

```ts
const comet = bookModel.create({ id: 2, title: "Comet", author: "Sagan" })

console.log(comet.$pages.getState())        // 0
console.log(comet.$readingTime.getState())  // "0 days"
```

On the instance side, derived fields also appear with a `$` prefix — that's because they evaluate to stores.

## 5. Mutate fields with events

Stores are read-only by default. To mutate them, declare an **event** on the contract and wire its reducer in a `fn` builder.

Update `src/book.ts` to replace `createModel({ contract: bookContract })` with:

```ts
const bookContract = createContract()
  .store("id", (s) => s<number>())
  .store("title", (s) => s<string>())
  .store("author", (s) => s<string>())
  .store("pages", (s) => s<number>().default(0))
  .event("addPages", (e) => e<number>())
  .derived("readingTime", (s) =>
    s.$pages.map((p) => `${Math.ceil(p / 30)} days`),
  )
  .pk("id")

export const bookModel = createModel({
  contract: bookContract,
  fn: ({ $pages, addPages }) => {
    $pages.on(addPages, (prev, extra) => prev + extra)
    return {}
  },
})
```

Now try it:

```ts
const odyssey = bookModel.create({ id: 3, title: "Odyssey", author: "Homer", pages: 100 })

odyssey.addPages(50)
console.log(odyssey.$pages.getState())        // 150
console.log(odyssey.$readingTime.getState())  // "5 days"
```

**How it works internally:** `fn` runs once per model (not per instance). The `$pages.on(addPages, reducer)` call registers the reducer on a model-level **shared `on` registry**. When `addPages` fires on *any* instance, the reducer runs against *that* instance's data. Zero per-instance effector nodes are created.

Return an object from `fn` if you want to expose extra units (custom stores, effects, etc.) on every instance. Returning `{}` means "only the default shape."

## 6. Query the collection

Every model has `.query()`, which returns a reactive `CollectionQuery`. You can filter, sort, paginate, and group — and every result is a live store.

```ts
import { gte } from "@kbml-tentacles/core"

const epics = bookModel.query()
  .where("pages", gte(300))
  .orderBy("title", "asc")

console.log(epics.$list.getState().map((row) => row.title))
// ["The Hobbit"]
```

`$list` emits **plain rows** — field snapshots, not Instance objects. When you need reactive per-row access (stores, events, refs), iterate `$ids` and call `bookModel.instance(id)`.

A few things to try:

- **Add a book with `pages: 500`** — `epics.$list` updates immediately.
- **Change an existing book's `pages`** via an event (e.g., a `setPages` event) — the query re-runs incrementally for only the changed instance (O(1), not a full scan).
- **Swap `gte(300)` for `gte($threshold)`** where `$threshold` is any `Store<number>` — queries accept reactive operands.

Available operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `oneOf`, `contains`, `includes`, `startsWith`, `endsWith`, `matches`. Every operator accepts either a raw value or a `Store<T>`.

## 7. SSR: fork isolation in one file

All the code you wrote above uses the **global scope**. For SSR (or multi-tenant servers), you need *scoped* instances that do not leak between concurrent requests. Tentacles makes this trivial because every store it creates has a deterministic SID.

```ts
import { allSettled, fork, serialize } from "effector"

const scope = fork()

// The `{ scope }` form of create returns a Promise — it runs through allSettled.
await bookModel.create(
  { id: 10, title: "Scoped Classic", author: "You" },
  { scope },
)

// Inspect scoped state
console.log(scope.getState(bookModel.$count))   // 1 (in this scope)
console.log(bookModel.$count.getState())        // still whatever the global had

// Serialize for the client
const hydrate = serialize(scope)
console.log(Object.keys(hydrate).length > 0)  // true — has SIDs
```

On the client, you would call `fork({ values: hydrate })` to rehydrate. You need a babel plugin (or similar) to inject SIDs into your source code — see [Enable SSR](/how-to/enable-ssr) for the wiring.

**Why it just works:** every store Tentacles materializes (the shared `$dataMap`, the `$ids` registry, the `$count` store) carries an SID rooted at the contract. `serialize(scope)` picks them up with no manual config.

## 8. What you just built

```
tentacles-books/
└── src/
    └── book.ts   ← contract + model + events + query + SSR
```

A single file gave you:

- Type-safe CRUD with **zero boilerplate** — no `createStore`, no `createEvent`, no manual `$list`.
- **Built-in stores**: `$ids`, `$count`, `$instances`.
- **Events** wired with one `on` call, shared across all instances.
- **Derived fields** computed reactively from other stores.
- **Queries** that update incrementally as data changes.
- **SSR-ready** fork isolation out of the box.

## Where to go next

| If you want to… | Read |
|---|---|
| Build a UI on top | [React](/tutorials/react-todo-app), [Vue](/tutorials/vue-todo-app), or [Solid](/tutorials/solid-todo-app) tutorial |
| Model relationships (`hasMany`, `belongsTo`) | [How-to: Relate models with refs](/how-to/relate-models-with-refs) |
| Understand the internals | [Explanation: Contracts and runtime](/explanation/contracts-and-runtime) |
| Look up a specific API | [Reference](/reference/) |
