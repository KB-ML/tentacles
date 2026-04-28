---
layout: home
hero:
  name: Tentacles
  text: Dynamic Model Factory for Effector
  image:
    light: /tentacles-light.svg
    dark: /tentacles-dark.svg
    alt: Tentacles
  tagline: Type-safe contracts, reactive instances, and ORM-like queries — with full SSR support
  actions:
    - theme: brand
      text: Get Started
      link: /01-tutorials/01-your-first-model
    - theme: alt
      text: How-to guides
      link: /02-how-to/
    - theme: alt
      text: API Reference
      link: /03-reference/

features:
  - title: Contract-First Design
    icon: "\U0001F4DD"
    details: "Chained builder DSL: .store() .event() .ref() — full TypeScript inference with zero manual type annotations. Add a field? Add one line."
  - title: Dynamic Instances
    icon: "\U0001F4E6"
    details: "Create hundreds of independent instances from one model. Each gets isolated stores, events, and deterministic SIDs. Same ID? Auto-replaces."
  - title: Refs & Relationships
    icon: "\U0001F517"
    details: "one-to-one, one-to-many, inverse refs, self-references, compound FKs. Inline create, cascade delete, and many-to-many via junction models."
  - title: ORM-Like Queries
    icon: "\U0001F50D"
    details: "WHERE, ORDER BY, LIMIT, OFFSET, GROUP BY, HAVING — all reactive. Pass Store values as parameters. Staged pipeline reruns only what changed."
  - title: SSR Ready
    icon: "\U0001F310"
    details: "Deterministic SIDs enable serialize/fork hydration out of the box. Scope-isolated creation with zero state leaks between concurrent requests."
  - title: Zero Boilerplate
    icon: "\U000026A1"
    details: "No manual createStore/createEvent. No ID management. No serialization config. Built-in $ids, $count, instances(), createFx, deleteFx, updateFx."
description: "Documentation page."
---

<div class="badge-row">
  <img src="https://img.shields.io/npm/v/%40kbml-tentacles%2Fcore?label=npm&color=22c55e" alt="npm version" />
  <img src="https://img.shields.io/bundlephobia/minzip/%40kbml-tentacles%2Fcore?label=min%2Bgzip&color=22c55e" alt="min+gzip size" />
  <img src="https://img.shields.io/npm/dm/%40kbml-tentacles%2Fcore?label=downloads&color=64748b" alt="npm downloads" />
</div>

<div class="landing-section">
  <h2 class="section-title">Quick Start</h2>
  <p class="section-subtitle">Install and explore the full API at a glance</p>

  <div class="install-row">

  ::: code-group
  ```sh [npm]
  npm install @kbml-tentacles/core
  ```
  ```sh [yarn]
  yarn add @kbml-tentacles/core
  ```
  ```sh [pnpm]
  pnpm add @kbml-tentacles/core
  ```
  :::

  </div>

  <div class="landing-section">
    <h2 class="section-title">Feature Showcase</h2>
    <p class="section-subtitle">Key API surfaces — in one glance</p>

::::tabs
== Contracts
```ts
const userContract = createContract()
  .store("name", (s) => s<string>())
  .store("age", (s) => s<number>().default(0))
  .event("rename", (e) => e<string>())
  .derived("isAdult", (s) =>
    s.$age.map((a) => a >= 18)
  )
  .ref("posts", "many")
  .pk("name")
```
== Models
```ts
const userModel = createModel({
  contract: userContract,
  name: "user",
  fn: ({ $name, rename, $age }, _) => {
    $name.on(rename, (_, next) => next)
    return { $name, rename, $age }
  },
})

userModel.create({ name: "Alice", age: 25 })
userModel.create({ name: "Bob" }) // age defaults to 0

userModel.$count     // Store<number> → 2
userModel.$ids       // Store<string[]>
userModel.get(id)    // Instance | null
```
== Queries
```ts
import { gte, eq } from "@kbml-tentacles/core"

const adults = userModel.query()
  .where("age", gte(18))
  .where("role", eq("admin"))
  .orderBy("name", "asc")
  .limit($pageSize)

adults.$ids        // Store<ModelInstanceId[]>
adults.$list       // Store<Row[]> — plain data rows
adults.$count      // Store<number>
adults.$totalCount // Store<number> — before pagination

const byRole = userModel.query().groupBy("role")
byRole.$groups     // Store<Map<string, Row[]>>
```
== ViewModels
```ts
const todoViewContract = createViewContract()
  .store("search", (s) => s<string>().default(""))
  .store("page", (s) => s<number>()
    .default(0).resetOn("search"))

const todoViewProps = createPropsContract()
  .store("pageSize", (s) => s<number>().optional())
  .event("onDelete", (e) => e<string>())

const todoView = createViewModel({
  contract: todoViewContract,
  props: todoViewProps,
  fn: (stores, { mounted, props }) => {
    sample({ clock: mounted, target: loadFx })
    return { ...stores, onDelete: props.onDelete }
  },
})
```
== Frameworks
```tsx
// React
function TodoApp(props) {
  const { $search, $page } = useView(todoView, props)
  return <SearchInput />
}

// Vue — emit events are auto-wired
const { $search, $page } = useView(
  todoView, () => props, emit
)

// Solid
const { $search, $page } = useView(
  todoView, () => props
)

// Iterate model instances
<Each model={userModel} source={userModel.$ids}>
  {(user) => <Card />}
</Each>
```
::::
  </div>
</div>

<div class="landing-section">
  <h2 class="section-title">See the Difference</h2>
  <p class="section-subtitle">A simple todo-list — pure effector vs Tentacles</p>

  <div class="comparison-grid">
    <div class="comparison-card">
      <div class="card-header before">
        <span>Pure Effector</span>
        <span class="line-count">~40 lines</span>
      </div>

::: code-group

```ts [todo.ts]
import { createStore, createEvent, combine } from "effector"

type Todo = { id: string; title: string; done: boolean }

const $todos = createStore<Record<string, Todo>>({})
const $ids = createStore<string[]>([])
const addTodo = createEvent<{ id: string; title: string }>()
const toggleTodo = createEvent<string>()
const removeTodo = createEvent<string>()

$todos.on(addTodo, (map, { id, title }) => ({
  ...map, [id]: { id, title, done: false },
}))
$ids.on(addTodo, (ids, { id }) => [...ids, id])

$todos.on(toggleTodo, (map, id) => ({
  ...map, [id]: { ...map[id]!, done: !map[id]!.done },
}))

$todos.on(removeTodo, (map, id) => {
  const { [id]: _, ...rest } = map
  return rest
})
$ids.on(removeTodo, (ids, id) =>
  ids.filter((i) => i !== id)
)

const $list = combine($ids, $todos, (ids, m) =>
  ids.map((id) => m[id]!)
)
const $doneCount = $list.map(
  (l) => l.filter((t) => t.done).length
)
const $active = $list.map(
  (l) => l.filter((t) => !t.done)
)

// ⚠ No SSR SIDs — manual serialize config needed
// ⚠ No instance isolation — all state in one store
// ⚠ No reactive queries — manual filtering
// ⚠ New field? Update type, store, events, handlers
```

:::

  </div>
    <div class="comparison-card">
      <div class="card-header after">
        <span>Tentacles</span>
        <span class="line-count">~25 lines</span>
      </div>

::: code-group

```ts [todo.ts]
import { createContract, createModel, eq } from "@kbml-tentacles/core"

const contract = createContract()
  .store("title", (s) => s<string>())
  .store("done", (s) => s<boolean>().default(false))
  .event("toggle", (e) => e<void>())
  .pk("title")

const todoModel = createModel({
  contract,
  fn: ({ $done, toggle }) => {
    $done.on(toggle, (d) => !d)
    return {}
  },
})

todoModel.create({ title: "Learn Tentacles" })
todoModel.create({ title: "Build App" })

todoModel.$ids      // Store<string[]> — built-in
todoModel.$count    // Store<number> — built-in

const active = todoModel.query().where("done", eq(false))
active.$list   // Store<Row[]> — plain data, auto-updates

// ✓ SSR — deterministic SIDs, zero config
// ✓ Each instance has independent stores
// ✓ New field? Add one line to the contract
```

:::

  </div>
  </div>
</div>

<div class="landing-section">
  <h2 class="section-title">Scales with Your App</h2>
  <p class="section-subtitle">Each feature adds one line to the contract — not twenty</p>

:::tabs
== Contract
```ts
// Define the shape — types are inferred from the chain
const userContract = createContract()
  .store("name", (s) => s<string>())
  .store("age",  (s) => s<number>())
  .pk("name")
```
== + Defaults & Events
```ts
const userContract = createContract()
  .store("name", (s) => s<string>())
  .store("age",  (s) => s<number>().default(0))              // [!code ++]
  .store("slug", (s) => s<string>().default((d) => d.name.toLowerCase())) // [!code ++]
  .event("birthday", (e) => e<void>())                        // [!code ++]
  .pk("name")
```
== + Refs
```ts
const userContract = createContract()
  .store("name", (s) => s<string>())
  .store("age",  (s) => s<number>().default(0))
  .store("slug", (s) => s<string>().default((d) => d.name.toLowerCase()))
  .event("birthday", (e) => e<void>())
  .ref("posts", "many")                                       // [!code ++]
  .ref("avatar", "one")                                       // [!code ++]
  .pk("name")
```
== + Queries
```ts
import { gte, includes } from "@kbml-tentacles/core"

// All built-in, all reactive, all SSR-safe
const adults = userModel.query()
  .where("age", gte(18))
  .orderBy("name", "asc")
  .limit(10)

adults.$ids        // Store<ModelInstanceId[]>
adults.$list       // Store<Row[]> — plain data for rendering
adults.$count      // Store<number>
adults.$totalCount // Store<number> — before pagination
```
== + SSR
```ts
import { fork, serialize, allSettled } from "effector"

const scope = fork()
await userModel.create({ name: "Alice", age: 25 }, { scope })

// Deterministic SIDs — serialize just works
const data = serialize(scope)

// Client: hydrate from server state
const clientScope = fork({ values: data })
```
:::

</div>
