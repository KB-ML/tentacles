# `useModel`

Reads a view-model shape, a model instance from `<Each>`, or looks up a model instance by id. Five overloads, same shape as the React adapter. The no-argument variants (shape from `<View>`, instance from `<Each>`) return the value directly; id-based variants return a `Ref<T>` via `effector-vue/composition`'s `useUnit`.

— *Reference · Vue adapter · useModel*

## Overload 1 — read a view-model shape

```ts
function useModel<Shape>(definition: ViewModelDefinition<Shape>): Shape;
```

Reads the shape from the nearest `<View :model="definition">` ancestor.

```vue
<script setup>
import { useModel } from "@kbml-tentacles/vue";
import { useUnit } from "effector-vue/composition";
import { loginVM } from "./login-vm";

const form = useModel(loginVM);
const submitting = useUnit(form.$isSubmitting);
</script>
```

**Throws** if no matching `<View>` is found.

## Overload 2 — current `<Each>` instance

```ts
function useModel<Instance>(model: ModelLike<Instance>): Instance;
```

Returns the instance currently being rendered by the nearest `<Each :model="Model">`.

```vue
<Each :model="todoModel">
  <template #default>
    <TodoRow />
  </template>
</Each>

<!-- inside TodoRow -->
<script setup>
const todo = useModel(todoModel);
const title = useUnit(todo.$title);
</script>
```

**Throws** if no matching `<Each>` is in the tree.

## Overload 3 — static lookup

```ts
function useModel<Instance>(
  model: ModelLike<Instance>,
  id: ModelInstanceId,
): Ref<Instance | null>;
```

Looks up the instance by id. Returns `Ref<Instance | null>` — the ref re-emits `null` when the instance is destroyed.

```ts
const todo = useModel(todoModel, "t-1");
console.log(todo.value); // Instance | null
```

## Overload 4 — compound key

```ts
function useModel<Instance>(
  model: ModelLike<Instance>,
  ...key: [string | number, string | number, ...(string | number)[]]
): Ref<Instance | null>;
```

Two or more trailing scalars are treated as the primary key of a compound-PK contract. The key order must match `.pk(...)`.

```ts
const row = useModel(OrderItem, orderId, productId);
```

## Overload 5 — reactive id

```ts
function useModel<Instance>(
  model: ModelLike<Instance>,
  id: Store<ModelInstanceId | null>,
): Ref<Instance | null>;
```

Follows an effector store of ids. When the store emits a new id, the ref updates.

```ts
const selected = useModel(todoModel, $selectedId);
watchEffect(() => console.log(selected.value?.$title.getState()));
```

## Returns

| Overload | Return |
|---|---|
| 1 | `Shape` |
| 2 | `Instance` |
| 3 | `Ref<Instance \| null>` |
| 4 | `Ref<Instance \| null>` |
| 5 | `Ref<Instance \| null>` |

Reactive variants subscribe to `model.$idSet` (and the reactive id store where applicable) via `effector-vue/composition` and resolve the proxy synchronously via `model.get(id)`. Vue templates auto-unwrap: `{{ todo.$title }}` works without `.value`.

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

Accepted wherever a model is required. Core `Model<C>` satisfies this interface, as does the `modelLike` produced by form arrays.

## Throws

| Condition | Overload(s) |
|---|---|
| No matching `<View>` in the parent chain | 1 |
| No matching `<Each>` in the parent chain | 2 |
| Ambiguous compound key detected (single scalar passed where ≥ 2 expected) | falls through to overload 3 |

## Examples

### Read a compound-key instance

```vue
<script setup>
const row = useModel(OrderItem, props.orderId, props.productId);
const qty = computed(() => row.value?.$quantity.getState() ?? 0);
</script>
```

### Follow a reactive selection

```vue
<script setup>
import { selection } from "@/stores/selection";

const todo = useModel(todoModel, selection.$currentId);
</script>
<template>
  <div v-if="todo">{{ todo.$title }}</div>
</template>
```

## Edge cases

- Overloads 3–5 always return a `Ref`. Unwrap with `.value` in script, or bind directly in templates.
- If the resolved id has no matching instance, `.value` is `null`. Destroy of the instance does not error; the ref updates to `null`.
- Passing a single scalar as the second argument always selects overload 3, even for contracts with compound keys — two or more scalars are required to trigger overload 4.
- `useModel(todoModel, ref("t-1"))` does *not* work — the second argument must be a `Store<ID | null>`, not a Vue ref. Use `combine` or `createStore` to produce a store, or pass a plain id.

## See also

- [`<View>`](./view) — context provider for overload 1.
- [`<Each>`](./each) — iteration provider for overload 2.
- Core → [`Model`](/reference/core/)
