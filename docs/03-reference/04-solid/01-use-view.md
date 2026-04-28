---
description: "Reference for Solid useView: mount a view model in one component and return its shape."
---

# `useView`

**Single-component alternative to [`<View>`](./view).** Instantiates a `ViewModelDefinition` for the lifetime of a Solid component. Accepts `rawProps` as a **getter function**, synced via `createEffect`. `onMount` fires `lifecycle.mount`; `onCleanup` fires `lifecycle.destroy`. The return value is the view-model shape — stores and events exactly as materialised by core.

Prefer `<View>` — it provides the shape to descendants via Solid context so children can pull it with `useModel`. Reach for `useView` only when a single component owns the instance and has no descendants that need `useModel`.

— *Reference · Solid adapter · useView*

## Signature

```ts
function useView<Shape>(
  definition: ViewModelDefinition<Shape>,
  rawProps?: () => Record<string, unknown>,
): Shape;
```

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `definition` | `ViewModelDefinition<Shape>` | yes | Result of `createViewModel({...})`. |
| `rawProps` | `() => Record<string, unknown>` | no | Getter returning the current prop snapshot. Re-evaluated inside `createEffect`. |

## Return

`Shape` — the view-model shape with stores, events, derived stores, plus any units declared in `fn`. Pass stores through `useUnit` to read values reactively:

```tsx
import { useUnit } from "effector-solid";
const vm = useView(counterViewModel);
const count = useUnit(vm.$count);
return <div>{count()}</div>;
```

## Getter form

`rawProps` is a function, not an object. The adapter registers:

```ts
createEffect(() => {
  definition.applyProps(rawProps?.());
});
```

Signals and accessors read inside the getter establish dependencies; re-reads trigger a re-apply.

```tsx
const [query, setQuery] = createSignal("");

const vm = useView(searchViewModel, () => ({
  query: query(),           // tracked signal read
  $minLength,               // Store<number> — passed through
  onClear: handleClear,     // function — wrapped as effector event
}));
```

A non-tracking getter (returning a constant object) applies once when first evaluated.

## Prop normalisation

Same rules as the other adapters:

| Prop kind | Plain value | Reactive value |
|---|---|---|
| Store prop | wrapped in a writable store synced each effect | `Store<T>` → passed through |
| Event prop | wrapped in an effector event whose body forwards to the latest callback | `EventCallable<T>` → passed through |

Callbacks are captured by reference inside the effect; re-entering the effect with a new closure updates the reference so the latest function is always called.

## Lifecycle

| Solid primitive | Behaviour |
|---|---|
| Primitive body | `definition.create(rawProps?.())` |
| `createEffect(() => rawProps?.())` | `definition.applyProps(...)` on every tracked change |
| `onMount` | `lifecycle.mount()` |
| `onCleanup` | `lifecycle.destroy()` — region torn down, SIDs released |

Solid components run once; there is no double-invoke cycle. `useView` is therefore always instance-stable for the mounted lifetime.

## Example — composed shape

```tsx
import { useView } from "@kbml-tentacles/solid";
import { useUnit } from "effector-solid";
import { searchViewModel } from "./search-vm";

function Search(props: { placeholder: string }) {
  const vm = useView(searchViewModel, () => ({
    placeholder: props.placeholder,
    onResultsLoaded: (n: number) => console.log("loaded", n),
  }));
  const query = useUnit(vm.$query);
  return (
    <input
      placeholder={props.placeholder}
      value={query()}
      onInput={(e) => vm.setQuery(e.currentTarget.value)}
    />
  );
}
```

## Edge cases

- If `rawProps` is omitted, the definition's contract must have no required props. Optional props retain their defaults.
- Returning a brand-new object from the getter on every tick is safe; the effect only re-runs when tracked reads change.
- `useView` never destroys-and-recreates within the same lifetime; passing a different `definition` between renders is not supported (Solid components do not re-run).
- The return value is a stable reference for the component's lifetime.
- Consuming a store without `useUnit` (e.g. calling `.getState()` inline) is non-reactive; always go through `useUnit`.

## See also

- [`<View>`](./view) — component form that also provides shape via Solid context.
- [`useModel`](./use-model) — read the shape from a parent `<View>`.
- Core → [`createViewModel`](/reference/core/)
