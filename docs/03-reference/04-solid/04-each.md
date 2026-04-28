---
description: "Reference for Solid <Each>: render model instance lists from ids, queries, or reactive sources."
---

# `<Each>`

Renders a list of model instances, wrapping Solid's `<For>` for list sources and `<Show>` for single-id sources. One of `source`, `id`, or `from` selects the id source; children may be static (`JSX.Element`) or a function receiving the current `Instance`. `fallback` is rendered when the list is empty.

— *Reference · Solid adapter · Each*

## Signature

```ts
function Each<Instance>(props: EachProps<Instance>): JSX.Element;

interface EachProps<Instance> {
  model: ModelLike<Instance>;
  source?: Store<ModelInstanceId[]>;
  id?: ModelInstanceId | Store<ModelInstanceId | null>;
  from?: string;
  children?: JSX.Element | ((instance: Instance) => JSX.Element);
  fallback?: JSX.Element;
}
```

## Props

| Name | Type | Required | Description |
|---|---|---|---|
| `model` | `ModelLike<Instance>` | yes | Model to iterate. |
| `source` | `Store<ModelInstanceId[]>` | one of four | Reactive id array. |
| `id` | `ModelInstanceId \| Store<ModelInstanceId \| null>` | one of four | Static or reactive single id. |
| `from` | `string` | one of four | Parent ref field name. |
| `children` | `JSX.Element \| (instance) => JSX.Element` | no | Row body. |
| `fallback` | `JSX.Element` | no | Rendered when the id source is empty or `null`. |

Exactly one of `source`, `id`, `from` must be supplied. Passing zero or more than one throws at setup.

## Modes

### `source` — reactive id array

Wraps Solid's `<For>`. Each row renders in its own owner scope.

```tsx
<Each model={todoModel} source={query.$ids} fallback={<Empty />}>
  {(todo) => <TodoRow todo={todo} />}
</Each>
```

### `id` — static or reactive single id

Wraps Solid's `<Show>`. Renders the referenced instance, or `fallback` if the id resolves to `null`.

```tsx
<Each model={todoModel} id="t-1">
  {(todo) => <Editor todo={todo} />}
</Each>
```

```tsx
<Each model={todoModel} id={$selectedId} fallback={<em>None</em>}>
  {(todo) => <Editor todo={todo} />}
</Each>
```

### `from` — parent ref

```tsx
<Each model={todoModel} id="t-1">
  {() => (
    <Each model={tagModel} from="tags">
      {(tag) => <TagChip tag={tag} />}
    </Each>
  )}
</Each>
```

`from` walks the `ScopeStackContext` to find the nearest ancestor whose contract exposes a ref field named `tags` pointing at `tagModel`. The ref's `$ids` store is then iterated as in `source` mode.

### reactive id (overload of `id`)

Passing `id={store}` where `store` is `Store<ModelInstanceId | null>` re-resolves as the store updates. A `null` value renders `fallback`.

## Children forms

### Function-as-children

```tsx
<Each model={todoModel} source={query.$ids}>
  {(todo) => <TodoRow todo={todo} />}
</Each>
```

The function receives the `Instance` directly (not an accessor — the instance identity is stable per id, its fields are reactive via their own stores). The function is invoked once per id; field reactivity is handled inside by `useUnit`.

### Static children

```tsx
<Each model={todoModel} source={query.$ids}>
  <TodoRow />
</Each>
```

Descendants read the current instance via `useModel(todoModel)`. The same JSX is instantiated in each row's owner scope.

## `fallback`

Rendered through Solid's `<Show fallback={...}>` when the resolved list is empty, or the resolved single id is `null`. Omitting `fallback` leaves the empty slot unrendered.

## `<For>` / `<Show>` internals

The adapter selects between Solid's built-in control primitives based on the mode:

| Mode | Primitive |
|---|---|
| `source` | `<For each={ids()}>` |
| `id` (static or reactive) | `<Show when={instance()}>` |
| `from` | resolves to `source`-like id store, then `<For>` |

Keyed-by-id reconciliation is Solid's default for `<For>`; rows are preserved across reorderings.

## Context — `ScopeStackContext`

```ts
import type { ScopeStackContext } from "@kbml-tentacles/solid";
// Context<Accessor<readonly ScopeEntry[]>>
```

`<Each>` pushes a new scope entry (current instance + model) for each rendered row. `useModel(model)` reads the context and picks the top matching entry. Exposed for advanced debugging and custom iteration wrappers.

## Throws

| Condition | When |
|---|---|
| None of `source`, `id`, `from` | setup |
| More than one of `source`, `id`, `from` | setup |
| `from` not resolvable in any parent | first resolution |
| `model` is not a `ModelLike` | setup |

## Example — nested iteration

```tsx
<Each model={categoryModel} source={$categoryIds} fallback={<p>No categories</p>}>
  {(category) => {
    const title = useUnit(category.$title);
    return (
      <section>
        <h2>{title()}</h2>
        <Each model={todoModel} from="todos" fallback={<em>No todos</em>}>
          {(todo) => <TodoRow todo={todo} />}
        </Each>
      </section>
    );
  }}
</Each>
```

## Edge cases

- `source` must be a stable store; do not rebuild on every render.
- The function-as-children form's closure is part of the reactive owner for that row; closing over non-signal values works but does not re-run on changes.
- `id={$store}` is reactive; `id="t-1"` is static. The two forms do not mix.
- `fallback` is a single element (or `null`), not a function — there is no per-row fallback.

## See also

- [`useModel`](./use-model) — read the current `<Each>` instance.
- `ScopeStackContext` — scope entries.
- Core → [`CollectionQuery`](/reference/core/) for building `$ids` sources.
