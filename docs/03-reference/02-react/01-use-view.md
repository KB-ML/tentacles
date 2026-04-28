---
description: "Reference for React useView: mount a view model within one component and return its shape."
---

# `useView`

**Single-component alternative to [`<View>`](./view).** Instantiates a `ViewModelDefinition` once for the lifetime of a React component and returns its shape. Prop synchronisation runs in `useLayoutEffect`; `lifecycle.mount()` runs in `useEffect`; `lifecycle.destroy()` runs on cleanup.

Prefer `<View>` — it is StrictMode-safe (calls `lifecycle.unmount` instead of `destroy`) and it provides the shape to descendants via context so children can pull it with `useModel`. Reach for `useView` only when a single component owns the instance and has no descendants that need `useModel`.

— *Reference · React adapter · useView*

## Signature

```ts
function useView<Shape>(
  definition: ViewModelDefinition<Shape>,
  rawProps?: Record<string, unknown>,
): Shape;
```

## Parameters

| Name | Type | Required | Description |
|---|---|---|---|
| `definition` | `ViewModelDefinition<Shape>` | yes | Result of `createViewModel({...})`. |
| `rawProps` | `Record<string, unknown>` | no | Plain object whose keys match contract prop names. Stores and events are normalised. |

## Return

`Shape` — the materialised view-model shape: contract stores, events, derived stores, plus any units added in `fn`. Stores are returned as-is (`Store<T>`), so values are read with `useUnit` inside components.

## Instantiation

The instance is created via `useMemo([definition])`. Passing the same definition across renders keeps the same instance; passing a new definition creates a new one (the old instance is destroyed on cleanup).

```tsx
const counter = useView(counterViewModel);
const [value] = useUnit([counter.$value]);
```

## Prop sync

`rawProps` is applied in `useLayoutEffect` so the view-model sees updated props before the DOM commits. Each entry is normalised:

```tsx
useView(searchViewModel, {
  query,              // plain string → wrapped in a writable store
  $minLength,         // Store<number> → passed through
  onSubmit,           // function → wrapped as effector event (latest ref)
  onClear: submitFx,  // EventCallable → passed through
});
```

## Callback pattern

Callbacks passed as event-prop replacements are tracked via `useRef`. A parent that creates a new `onSubmit` closure on every render does not rebind the underlying event; the effector event calls the current ref on every fire.

```tsx
function Parent({ items }) {
  const counter = useView(counterViewModel, {
    onChange: (n) => console.log(n, items.length),
  });
  // `items` in the closure is always the latest.
}
```

## Lifecycle

| Phase | Effect |
|---|---|
| First render | `definition.create(rawProps)` — instance created, region allocated. |
| Every render | `rawProps` re-applied in `useLayoutEffect`. |
| After first commit | `lifecycle.mount()` fires once. |
| Unmount | `lifecycle.destroy()` fires, region is torn down, SIDs are released. |

In StrictMode, React runs `useEffect` twice on mount. The adapter guards mount so only the second (real) mount fires `lifecycle.mount`; the same applies to destroy. If you need the region itself to survive StrictMode's simulated unmount, use [`<View>`](./view) instead (it calls `unmount` rather than `destroy`).

## Example

```tsx
const loginViewModel = createViewModel({ contract: loginContract, fn });

function LoginForm() {
  const form = useView(loginViewModel);
  const [values, submit] = useUnit([form.$values, form.submit]);
  return <form onSubmit={submit}>{/* … */}</form>;
}
```

## Edge cases

- Passing a new `definition` on every render creates and destroys instances on every render. Memoise definitions at module scope.
- `rawProps` may be `undefined`; the hook is safe to call without the second argument for contracts with no props.
- The return value is the *same object identity* across renders — do not include it in `useMemo` or `useEffect` dependency arrays expecting it to change.
- If `definition` is swapped, the previous instance's cleanup runs before the new instance is created — the two never coexist in the same hook slot.

## See also

- [`<View>`](./view) — same behaviour plus context provision and StrictMode-safe cleanup.
- [`useModel`](./use-model) — read a shape provided by an ancestor `<View>`.
- Core → [`createViewModel`](/reference/core/)
