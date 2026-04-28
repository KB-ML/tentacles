---
description: "Reference for Vue <Each>: render model instance lists via slots from ids, queries, or reactive sources."
---

# `<Each>`

Renders a list of model instances. One of `:source`, `:id`, or `:from` selects the id source; children receive the current instance through the default scoped slot (`<template #default="instance">`). An optional `#fallback` slot is rendered when the list is empty. Internally the component uses `markRaw`/`toRaw` to keep Vue's reactivity system away from effector unit internals.

— *Reference · Vue adapter · Each*

## Signature

```ts
const Each: DefineComponent<{
  model: ModelLike<Instance>;
  source?: Store<ModelInstanceId[]>;
  id?: ModelInstanceId | Store<ModelInstanceId | null>;
  from?: string;
}>;
```

## Props

| Name | Type | Required | Description |
|---|---|---|---|
| `model` | `ModelLike<Instance>` | yes | Model to iterate. |
| `source` | `Store<ModelInstanceId[]>` | one of four | Reactive id array. |
| `id` | `ModelInstanceId \| Store<…>` | one of four | Static or reactive single id. |
| `from` | `string` | one of four | Parent ref field name. |

Exactly one of `source`, `id`, `from` must be supplied. Passing zero or more than one throws during setup.

## Slots

| Slot | Argument | When |
|---|---|---|
| `default` | `Instance` | Per-row render body. Invoked once per id. |
| `fallback` | — | Rendered when the resolved id list is empty (or when single-id mode resolves to `null`). |

```vue
<Each :model="todoModel" :source="query.$ids">
  <template #default="todo">
    <TodoRow :todo="todo" />
  </template>
  <template #fallback>
    <Empty />
  </template>
</Each>
```

## Modes

### `source` — reactive id array

```vue
<Each :model="todoModel" :source="query.$ids">
  <template #default="todo">
    <li>{{ useUnit(todo.$title) }}</li>
  </template>
</Each>
```

Each row renders in an isolated slot scope so unrelated rows do not re-render on field changes within a single instance.

### `id` — single static or reactive id

```vue
<Each :model="todoModel" id="t-1">
  <template #default="todo">
    <Editor :todo="todo" />
  </template>
</Each>
```

```vue
<Each :model="todoModel" :id="$selectedId">
  <template #default="todo">
    <Editor :todo="todo" />
  </template>
</Each>
```

Single-id mode renders exactly the referenced instance, or `#fallback` if the id resolves to `null`.

### `from` — parent ref

```vue
<Each :model="todoModel" id="t-1">
  <template #default>
    <Each :model="tagModel" from="tags">
      <template #default="tag">
        <TagChip :tag="tag" />
      </template>
    </Each>
  </template>
</Each>
```

`from` walks the scope stack (`ScopeStackKey`) to find the nearest instance whose contract exposes a `tags` ref to `tagModel`. The ref's `$ids` store is then used as the iteration source.

### reactive id

The same as `:id` with a `Store<ModelInstanceId | null>`. Following the store to `null` renders `#fallback`.

## `markRaw` / `toRaw` internals

Vue attempts to proxy any object it sees in reactive contexts. Effector units (`Store`, `EventCallable`) have internal mutable graphs that must not be proxied. `<Each>`:

1. flags the current instance with `markRaw` before exposing it to the slot scope;
2. calls `toRaw` on `model` and `source` props to strip any reactive wrappers the caller may have introduced.

If you see `target is readonly` warnings, ensure that `:model` is the raw model object (not a `reactive()` wrapper).

## Context — `ScopeStackKey`

`<Each>` pushes a scope entry via `provide(ScopeStackKey, …)` for each rendered row. `useModel(model)` inside a row reads the stack via `inject(ScopeStackKey)` and picks the top entry whose model matches.

```ts
import type { ScopeStackKey } from "@kbml-tentacles/vue";
// InjectionKey<Ref<readonly ScopeEntry[]>>
```

Exposed for advanced users; normal code uses `useModel` instead.

## Throws

| Condition | When |
|---|---|
| None of `source`, `id`, `from` provided | setup |
| More than one of `source`, `id`, `from` provided | setup |
| `from` cannot be resolved through the parent stack | first resolution |
| `model` is not a `ModelLike` | setup |

## Example — nested iteration with fallback

```vue
<Each :model="categoryModel" :source="$categoryIds">
  <template #default="category">
    <section>
      <h2>{{ useUnit(category.$title) }}</h2>
      <Each :model="todoModel" from="todos">
        <template #default="todo">
          <TodoRow :todo="todo" />
        </template>
        <template #fallback>
          <em>No todos</em>
        </template>
      </Each>
    </section>
  </template>
  <template #fallback>
    <p>No categories</p>
  </template>
</Each>
```

## Edge cases

- `:source` must be a stable store; do not recompute on every render.
- Implicit-default slots (no `#default`) still receive the instance via `useModel(model)` from descendants.
- `#fallback` is only rendered when the list is fully empty (or the single id is `null`); it is not interleaved between rows.
- `:model` and `:source` are internally `toRaw`-ed; passing the same store through `reactive({...})` is harmless but unnecessary.

## See also

- [`useModel`](./use-model) — read the current `<Each>` instance.
- `ScopeStackKey` — injection key for the scope stack.
- Core → [`CollectionQuery`](/reference/core/) to build `$ids` stores.
