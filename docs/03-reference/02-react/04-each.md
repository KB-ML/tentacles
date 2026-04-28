---
description: "Reference for React <Each>: render model instance lists with per-row context and memoized children."
---

# `<Each>`

Renders a list of model instances. Selects which ids to iterate over from one of four sources — `source`, `id`, `from`, or a reactive id — and provides the current instance to its children via context. Per-item render bodies are wrapped in `memo` so updates to unrelated rows do not re-render siblings.

— *Reference · React adapter · Each*

## Signature

```ts
function Each<Instance>(props: EachProps<Instance>): JSX.Element;

interface EachProps<Instance> {
  model: ModelLike<Instance>;
  source?: Store<ModelInstanceId[]>;
  id?: ModelInstanceId | Store<ModelInstanceId | null>;
  from?: string;
  children?: ReactNode | ((instance: Instance) => ReactNode);
  fallback?: ReactNode;
}
```

## Props

| Name | Type | Required | Description |
|---|---|---|---|
| `model` | `ModelLike<Instance>` | yes | The model being iterated. |
| `source` | `Store<ModelInstanceId[]>` | one of four | Reactive id array to iterate. |
| `id` | `ModelInstanceId \| Store<…>` | one of four | Single static or reactive id. |
| `from` | `string` | one of four | Name of a parent ref field to iterate through. |
| `children` | `ReactNode \| (instance) => ReactNode` | no | Render body. |
| `fallback` | `ReactNode` | no | Rendered when the resolved id list is empty. |

Exactly one of `source`, `id`, or `from` must be supplied. Passing zero or more than one throws at render time.

## Modes

### `source` — reactive id array

```tsx
<Each model={todoModel} source={query.$ids} fallback={<Empty />}>
  {(todo) => <TodoRow todo={todo} />}
</Each>
```

Each id is rendered through an internal `memo(EachItem)` boundary. Adding, removing, or reordering ids re-reconciles; within a stable id, the child only re-renders when the closure inputs change.

### `id` — static or reactive single id

```tsx
<Each model={todoModel} id="t-1">
  <Editor />
</Each>
```

```tsx
<Each model={todoModel} id={$selectedId}>
  <Editor />
</Each>
```

Renders exactly the instance referenced by the id (or `fallback` if it resolves to `null`). The single-id mode is equivalent to a one-element list.

### `from` — parent ref

```tsx
<Each model={todoModel} id="t-1">
  <Each model={tagModel} from="tags">
    <TagChip />
  </Each>
</Each>
```

`from` walks the parent `ScopeStackContext` to find the nearest owner whose contract exposes a ref field named `tags` pointing at `tagModel`, and iterates that ref's ids. `resolveFrom` returns the ref's `$ids` store; iteration then follows the `source` mode pipeline.

### reactive id (overload of `id`)

Passing `id={store}` where `store` is `Store<ModelInstanceId | null>` re-resolves as the store changes. Setting the store to `null` renders `fallback`.

## Children forms

### Function-as-children

```tsx
<Each model={todoModel} source={query.$ids}>
  {(todo) => <TodoRow todo={todo} />}
</Each>
```

The function receives the current `Instance`. The callback runs inside a memoised boundary; it is called once per id change.

### Static children

```tsx
<Each model={todoModel} source={query.$ids}>
  <TodoRow />
</Each>
```

Descendants read the current instance via `useModel(todoModel)`. Useful when several child components need the same instance without prop drilling.

## `fallback`

Rendered when the resolved id list is empty. For single-id mode, rendered when the id resolves to `null`. If omitted and the list is empty, `<Each>` renders nothing.

## `memo` boundary

Every rendered row lives inside `memo(EachItem)`. The memo keyed on id only re-renders when the id changes or the function body identity changes. Within a row, any subscribed `useUnit` store drives updates normally. Non-subscribed changes do not propagate through the boundary.

## Context

`<Each>` pushes a scope entry onto `ScopeStackContext` for each iteration, containing the current instance and the model. `useModel(model)` reads the top entry whose model matches.

```tsx
const ScopeStackContext: React.Context<readonly ScopeEntry[]>;
```

Exposed for advanced use (building custom iteration or debugging tools). Application code normally uses `useModel` instead.

## Throws

| Condition | When |
|---|---|
| None of `source`, `id`, `from` provided | render |
| More than one of `source`, `id`, `from` provided | render |
| `from` names a field that cannot be resolved in any parent | first resolution |
| `model` argument is not a `ModelLike` | render |

## Example — nested iteration

```tsx
<Each model={categoryModel} source={$categoryIds}>
  {(category) => (
    <section>
      <h2>{useUnit(category.$title)}</h2>
      <Each model={todoModel} from="todos" fallback={<em>No todos</em>}>
        {(todo) => <TodoRow todo={todo} />}
      </Each>
    </section>
  )}
</Each>
```

## Edge cases

- `source` must be a stable `Store<ID[]>`; recreating it on every render re-subscribes and defeats memoisation.
- `id="t-1"` (string) is a static lookup; `id={"t-1" as const}` is identical. `id={$store}` is reactive.
- The function-as-children form must be referentially stable to retain memoisation — declare it at module scope.
- `fallback` is not rendered *between* rows; only when the list is fully empty.

## See also

- [`useModel`](./use-model) — read the current `<Each>` instance.
- `ScopeStackContext` — scope entries.
- Core → [`CollectionQuery`](/reference/core/) for building `$ids` sources.
