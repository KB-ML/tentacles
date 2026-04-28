---
description: "Reference for Vue useView: mount a view model in one component and return its shape."
---

# `useView`

**Single-component alternative to [`<View>`](./view).** Instantiates a `ViewModelDefinition` for the lifetime of a Vue component. Accepts a **getter** for `rawProps` so reactive inputs are tracked, and an optional `emit` function that re-routes event-prop callbacks to Vue `emits`. `onMounted` fires `lifecycle.mount`; `onUnmounted` fires `lifecycle.destroy`.

Prefer `<View>` — it provides the shape to descendants via `provide`/`inject` so children can pull it with `useModel`. Reach for `useView` only when a single component owns the instance and has no descendants that need `useModel`.

— *Reference · Vue adapter · useView*

## Signature

```ts
function useView<Shape>(
  definition: ViewModelDefinition<Shape>,
  rawProps?: () => Record<string, unknown>,
  emit?: (event: string, ...args: unknown[]) => void,
): Shape;
```

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `definition` | `ViewModelDefinition<Shape>` | yes | The result of `createViewModel({...})`. |
| `rawProps` | `() => Record<string, unknown>` | no | Getter returning the current prop snapshot. Re-run on every tracked dependency change. |
| `emit` | `EmitFn` | no | The component's emit function (from `defineEmits()` or `setup` context). |

## Return

`Shape` — the view-model shape with stores/events, returned verbatim. Stores are consumed with `useUnit` from `effector-vue/composition`:

```ts
import { useUnit } from "effector-vue/composition";

const vm = useView(counterViewModel);
const count = useUnit(vm.$count); // Ref<number>
```

## Prop getter

`rawProps` is a **function**, not an object. The adapter registers `watch(getProps, apply, { deep: true })`. Any reactive source referenced inside the getter (Vue props, refs, computed) re-runs the watcher and re-applies props.

```ts
const props = defineProps<{ query: string }>();
const vm = useView(searchViewModel, () => ({
  query: props.query,           // plain string
  $minLength,                   // Store<number>
  onClear: () => props.onClear?.(),
}));
```

A getter that closes over non-reactive values produces a one-time apply at setup time and does not react.

## `emit` routing

When `emit` is supplied, event-prop callbacks whose names begin with `on` are intercepted and routed to Vue emits, converting camelCase to kebab-case.

| Prop name | Emit call |
|---|---|
| `onClear` | `emit("clear")` |
| `onSaveItem` | `emit("save-item", payload)` |
| `onSubmitForm` | `emit("submit-form", payload)` |

Payloads from the view-model's event are forwarded verbatim as the emit arguments. The mapping is applied only to prop names present in the contract's event props.

```ts
const emit = defineEmits<{ (e: "clear"): void; (e: "save-item", id: string): void }>();
useView(listViewModel, () => ({ items: props.items }), emit);
```

## Lifecycle

| Vue hook | Behaviour |
|---|---|
| `setup()` | `definition.create(getProps?.())` — instance is created, region allocated. |
| `watch(getProps, …, { deep: true })` | `definition.applyProps(props)` on every reactive change. |
| `onMounted` | `lifecycle.mount()` fires. |
| `onUnmounted` | `lifecycle.destroy()` fires; region torn down; SIDs released. |

There is no intermediate `unmount` call as in React's `<View>` — Vue does not simulate an unmount/remount cycle.

## Example — composed view-model with props

```vue
<script setup lang="ts">
import { useView } from "@kbml-tentacles/vue";
import { useUnit } from "effector-vue/composition";
import { searchViewModel } from "./search-vm";

const props = defineProps<{ placeholder: string }>();
const emit = defineEmits<{ (e: "results-loaded", n: number): void }>();

const vm = useView(
  searchViewModel,
  () => ({ placeholder: props.placeholder, onResultsLoaded: (n: number) => emit("results-loaded", n) }),
  emit,
);

const query = useUnit(vm.$query);
</script>

<template>
  <input :value="query" @input="vm.setQuery(($event.target as HTMLInputElement).value)" />
</template>
```

## Edge cases

- Passing a plain object instead of a getter: the props are applied once at setup. Reactivity is lost.
- The shape is returned raw; do not wrap it in `reactive()`. Effector units are marked with `markRaw`.
- Emit routing only applies to contract event props. Store props and non-prefixed events fall through.
- `rawProps` can return `undefined` (the whole getter) or a partial object; missing keys are not re-applied.
- Hot reload: on module re-evaluation the definition identity changes, triggering a destroy/create. State is lost.

## See also

- [`<View>`](./view) — component form that also provides shape via a scoped slot.
- [`useModel`](./use-model) — read the shape from a parent `<View>`.
- Core → [`createViewModel`](/reference/core/)
