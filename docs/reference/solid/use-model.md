# `useModel`

Reads a view-model shape, a model instance from `<Each>`, or looks up a model instance by id. Five overloads, same argument shape as the React and Vue adapters. Context-based overloads (shape from `<View>`, instance from `<Each>`) return the value directly; id-based overloads return an `Accessor<Instance | null>` you call in JSX or in tracking scopes.

— *Reference · Solid adapter · useModel*

## Overload 1 — read a view-model shape

```ts
function useModel<Shape>(definition: ViewModelDefinition<Shape>): Shape;
```

Reads the shape from the nearest `<View model={definition}>` ancestor. Returned directly, not wrapped in an accessor.

```tsx
function SubmitButton() {
  const form = useModel(loginVM);
  const submitting = useUnit(form.$isSubmitting);
  return <button disabled={submitting()}>Save</button>;
}
```

**Throws** if no matching `<View>` is present in the component tree.

## Overload 2 — current `<Each>` instance

```ts
function useModel<Instance>(model: ModelLike<Instance>): Instance;
```

Returns the instance currently being rendered by the nearest `<Each model={model}>`. Returned directly — the instance itself is stable; reading mutable fields still requires `useUnit`.

```tsx
<Each model={todoModel} source={query.$ids}>
  {() => {
    const todo = useModel(todoModel);
    const title = useUnit(todo.$title);
    return <span>{title()}</span>;
  }}
</Each>
```

**Throws** if no matching `<Each>` is in the tree.

## Overload 3 — static lookup by id

```ts
function useModel<Instance>(
  model: ModelLike<Instance>,
  id: ModelInstanceId,
): Accessor<Instance | null>;
```

Looks up the instance with the given id. The returned accessor re-emits `null` when the instance is destroyed.

```tsx
const todo = useModel(todoModel, "t-1");
return <Show when={todo()}>{(t) => <Row todo={t()} />}</Show>;
```

## Overload 4 — compound key lookup

```ts
function useModel<Instance>(
  model: ModelLike<Instance>,
  ...key: [string | number, string | number, ...(string | number)[]]
): Accessor<Instance | null>;
```

Two or more trailing scalar arguments are treated as a compound primary key. Key order must match `.pk(...)` from the contract.

```tsx
const row = useModel(OrderItem, orderId, productId);
```

## Overload 5 — reactive id

```ts
function useModel<Instance>(
  model: ModelLike<Instance>,
  id: Store<ModelInstanceId | null>,
): Accessor<Instance | null>;
```

Follows an effector store of ids. When the store emits a new id, the accessor re-emits the new instance (or `null`).

```tsx
const selected = useModel(todoModel, $selectedId);
return <Show when={selected()}>{(t) => <Editor todo={t()} />}</Show>;
```

## Returns

| Overload | Return |
|---|---|
| 1 | `Shape` |
| 2 | `Instance` |
| 3 | `Accessor<Instance \| null>` |
| 4 | `Accessor<Instance \| null>` |
| 5 | `Accessor<Instance \| null>` |

Overloads 3–5 wrap the underlying `Store<Instance | null>` via `useUnit` from `effector-solid`, yielding an accessor. Call it in JSX, inside `createEffect`, or inside any reactive context.

## `ModelLike<Instance>`

```ts
interface ModelLike<Instance> {
  name: string;
  instance: (idOrKey: ModelInstanceId | ModelInstanceId[] | Store<ModelInstanceId | null>)
    => Store<Instance | null>;
}
```

Any object satisfying the interface is accepted.

## Throws

| Condition | Overload(s) |
|---|---|
| No matching `<View>` in the tree | 1 |
| No matching `<Each>` in the tree | 2 |
| Invalid model argument | any |

## Examples

### Static lookup with fallback

```tsx
const todo = useModel(todoModel, "t-1");

return (
  <Show when={todo()} fallback={<em>Deleted</em>}>
    {(t) => <Row todo={t()} />}
  </Show>
);
```

### Reactive selection

```tsx
const [selectedId] = createSignal<string | null>("t-1");
const sel = useModel(todoModel, /* Store<ID | null> from effector */ $selectedId);

createEffect(() => {
  const current = sel();
  if (current) console.log("current:", current.$title.getState());
});
```

## Edge cases

- Overloads 3–5 return an `Accessor`, not the value itself. Call the accessor (`todo()`) to read it.
- Single scalars always route through overload 3 — compound keys need two or more scalars.
- Solid signals cannot be passed to overload 5; the id must be a `Store<ID | null>`. Bridge a signal into a store with `createStore` and `createEffect` if needed.
- An accessor's returned `null` signals *no such instance* (missing id), not "loading". Loading is a separate responsibility.

## See also

- [`<View>`](./view) — context provider for overload 1.
- [`<Each>`](./each) — iteration provider for overload 2.
- Core → [`Model`](/reference/core/)
