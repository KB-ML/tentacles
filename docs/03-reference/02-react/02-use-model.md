---
description: "Reference for React useModel: read view-model shapes and model instances via context or id."
---

# `useModel`

Reads a view-model shape, a model instance inside `<Each>`, or looks up a model instance by id. The hook has five overloads selected by argument shape. Throws if called outside the expected parent for context-based overloads.

— *Reference · React adapter · useModel*

## Overload 1 — read a view-model shape

```ts
function useModel<Shape>(definition: ViewModelDefinition<Shape>): Shape;
```

Reads the shape from the nearest `<View model={definition}>` ancestor.

```tsx
function Submit() {
  const form = useModel(loginVM);
  const [submitting] = useUnit([form.$isSubmitting]);
  return <button disabled={submitting}>Save</button>;
}
```

**Throws** if no matching `<View>` is present in the tree, or if the nearest `<View>` holds a different definition.

## Overload 2 — current `<Each>` instance

```ts
function useModel<Instance>(model: ModelLike<Instance>): Instance;
```

Reads the current instance from the nearest `<Each model={model}>` ancestor. Used inside `<Each>` children to access the iteration target.

```tsx
<Each model={todoModel}>
  {() => {
    const todo = useModel(todoModel);
    const [title] = useUnit([todo.$title]);
    return <span>{title}</span>;
  }}
</Each>
```

**Throws** if no `<Each model={model}>` ancestor exists.

## Overload 3 — static lookup by id

```ts
function useModel<Instance>(
  model: ModelLike<Instance>,
  id: ModelInstanceId,
): Instance | null;
```

Looks up the instance with the given id. Returns `null` if the instance does not exist at the time of the call.

```tsx
const todo = useModel(todoModel, "t-1");
```

The returned instance identity changes only when the id appears or disappears from the model's store.

## Overload 4 — compound key lookup

```ts
function useModel<Instance>(
  model: ModelLike<Instance>,
  ...key: [string | number, string | number, ...(string | number)[]]
): Instance | null;
```

Two or more trailing positional arguments are treated as a compound primary key. The key order must match the order of `.pk(...)` in the contract.

```tsx
const row = useModel(OrderItem, orderId, productId);
```

Returns `null` if the compound key has no matching instance.

## Overload 5 — reactive id

```ts
function useModel<Instance>(
  model: ModelLike<Instance>,
  id: Store<ModelInstanceId | null>,
): Instance | null;
```

Follows an effector store of ids. When the store value changes, the hook resolves to the new instance (or `null` if the store emits `null` or a non-existent id).

```tsx
const { $selectedId } = useModel(todoViewModel);
const selected = useModel(todoModel, $selectedId);
```

## Parameters summary

| Overload | First | Remainder | Returns |
|---|---|---|---|
| 1 | `ViewModelDefinition<S>` | — | `S` |
| 2 | `ModelLike<I>` | — | `I` |
| 3 | `ModelLike<I>` | `ModelInstanceId` | `I \| null` |
| 4 | `ModelLike<I>` | `...key` (≥ 2 scalars) | `I \| null` |
| 5 | `ModelLike<I>` | `Store<ModelInstanceId \| null>` | `I \| null` |

## `ModelLike<Instance>`

```ts
interface ModelLike<Instance> {
  readonly name: string;
  readonly $ids: Store<ModelInstanceId[]>;
  readonly $idSet: Store<Set<ModelInstanceId>>;
  get(
    idOrParts: ModelInstanceId | readonly (string | number)[],
    scope?: Scope,
  ): Instance | null;
  getRefMeta(field: string): { cardinality: "one" | "many"; target: unknown } | undefined;
}
```

Reactive membership flows through `$idSet` (O(1)); instance access is synchronous via `get`. There is no `Store<Instance>` wrapper — `useModel` internally pairs `useUnit($idSet)` with `model.get(id)`.

Any object satisfying this shape is accepted — both `Model<C>` from core and the `modelLike` produced by form arrays work.

## Throws

| Condition | Overload(s) |
|---|---|
| No matching `<View>` in the tree | 1 |
| No matching `<Each>` in the tree | 2 |
| First argument is not a view-model definition or a `ModelLike` | any |
| Overload 4 called with a single scalar key (ambiguous with overload 3) | 4 — single scalars go through overload 3 |

## Edge cases

- Overload 3 and overload 5 differ only in whether the id is a value or a store. Strings and numbers go through overload 3.
- `useModel(todoModel, "a", "b")` is unambiguously overload 4 (compound key). `useModel(todoModel, "a")` is overload 3 (single id).
- A reactive id that transitions to `null` immediately resolves to `null` without unmounting subscriptions.
- The returned instance identity from overloads 3–5 is stable while the underlying id is unchanged, even if unrelated fields of the instance mutate.

## See also

- [`<View>`](./view) — context provider read by overload 1.
- [`<Each>`](./each) — iteration provider read by overload 2.
- Core → [`Model`](/reference/core/)
