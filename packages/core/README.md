# @kbml-tentacles/core

Type-safe dynamic model factory for [effector](https://effector.dev). Declare a contract with a fluent chain builder, then instantiate as many independent models as you like — each with reactive instances, ORM-like queries, and full SSR scope isolation.

```sh
npm install effector @kbml-tentacles/core
```

## Quick start

```ts
import { createContract, createModel, eq } from "@kbml-tentacles/core";

const todoContract = createContract()
  .store("id", (s) => s<number>().autoincrement())
  .store("title", (s) => s<string>())
  .store("done", (s) => s<boolean>().default(false))
  .event("toggle", (e) => e<void>())
  .pk("id");

const todoModel = createModel({
  contract: todoContract,
  fn: ({ $done, toggle }) => {
    $done.on(toggle, (d) => !d);
    return {};
  },
});

todoModel.create({ title: "Learn Tentacles" });
todoModel.create({ title: "Ship it" });

// Reactive ORM-like query
const $active = todoModel.query().where("done", eq(false)).$list;
```

## What's in the box

- **`createContract`** / **`createViewContract`** / **`createPropsContract`** — fluent builders for model schemas, ephemeral view-model state, and view-model props.
- **`createModel`** — turns a contract into a persistent instance manager: lazy field proxies, `create` / `update` / `delete` effects, refs (one/many, with `onDelete: "cascade" | "restrict" | "nullify"`), and inverse fields.
- **`createViewModel`** — view-models with bare stores, props normalization, and lifecycle (`mounted` / `unmounted`).
- **Reactive queries** — `model.query().where(...).orderBy(...).limit(...)` returning `$list`, `$count`, `$ids`, `$first`. Operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `oneOf`, `contains`, `includes`, `startsWith`, `endsWith`, `matches`. Incremental updates: O(1) on field mutations.
- **Contract utilities** — `pick`, `omit`, `partial`, `required`, `merge` work uniformly across model, view, props, and form chains.
- **SSR-safe by design** — deterministic SIDs, `serialize` / `fork` hydration, scope-aware `$dataMap` and autoincrement counters.

## Documentation

- Tutorials: [your first model](../../docs/tutorials/your-first-model.md)
- How-to: [define a contract](../../docs/how-to/define-a-contract.md), [relate models with refs](../../docs/how-to/relate-models-with-refs.md), [query a collection](../../docs/how-to/query-a-collection.md), [enable SSR](../../docs/how-to/enable-ssr.md), [build a view-model](../../docs/how-to/build-a-view-model.md)
- Reference: [`docs/reference/core`](../../docs/reference/core)

## Peer dependencies

- `effector ^23.0.0`

## License

[MIT](../../LICENSE) © Nikita Lumpov
