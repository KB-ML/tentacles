---
description: "Reference for Solid <View>: mount a view model and provide its shape to descendants via context."
---

# `<View>`

**Primary way to mount a view-model.** Instantiates a `ViewModelDefinition` and provides its shape to every descendant via a Solid context keyed by the definition. Prefer `<View>` over [`useView`](./use-view) — it lets children pull the shape with `useModel` instead of threading it through props. Reach for `useView` only when a single component owns the instance and has no descendants that need `useModel`.

— *Reference · Solid adapter · View*

## Signature

```ts
function View<Shape>(props: ViewProps<Shape>): JSX.Element;

interface ViewProps<Shape> {
  model: ViewModelDefinition<Shape>;
  props?: Record<string, unknown>;
  children?: JSX.Element;
}
```

## Props

| Name | Type | Required | Description |
|---|---|---|---|
| `model` | `ViewModelDefinition<Shape>` | yes | Definition to instantiate. |
| `props` | `Record<string, unknown>` | no | Prop snapshot. May be a reactive object expression — Solid's JSX binding evaluates it in a tracking scope. |
| `children` | `JSX.Element` | no | Subtree with access to the shape via `useModel`. |

`<View>` accepts `props` as either a plain object expression (Solid's JSX binding evaluates it in a tracking scope each render) or, equivalently, a getter function `() => ({ ... })`. Whichever form reads more naturally at the call site is fine.

## Behaviour

The component:

1. Instantiates the view-model on first body execution.
2. Wraps the subtree in a Solid `Provider` keyed by the `ViewModelDefinition`.
3. Syncs `props` through `createEffect`.
4. Fires `lifecycle.mount` on `onMount`.
5. Fires `lifecycle.destroy` on `onCleanup`.

```tsx
<View model={loginViewModel} props={{ onSubmit: handleSubmit }}>
  <EmailField />
  <PasswordField />
  <SubmitButton />
</View>
```

## Lifecycle

| Solid primitive | Effect |
|---|---|
| Component body | `definition.create(props)` |
| `createEffect(() => props)` | `definition.applyProps(...)` |
| `onMount` | `lifecycle.mount()` |
| `onCleanup` | `lifecycle.destroy()` |

Solid does not simulate mount/unmount cycles, so there is no StrictMode-style divergence between `useView` and `<View>` cleanup. Both call `destroy`.

## Context

`<View>` provides the shape through a Solid context. The provider is keyed by `ViewModelDefinition` identity; `useModel(definition)` reads the nearest matching provider.

```tsx
<View model={outerViewModel}>
  <View model={innerViewModel}>
    <Consumer /> {/* useModel(innerViewModel) → inner shape; useModel(outerViewModel) → outer shape */}
  </View>
</View>
```

## Shape provision

The shape is provided as-is (not as an accessor). Descendants receive the same object reference for the component's lifetime; reactive reads are mediated by `useUnit` against the individual stores on the shape.

```tsx
function SubmitButton() {
  const form = useModel(loginViewModel);
  const isSubmitting = useUnit(form.$isSubmitting);
  return <button disabled={isSubmitting()}>Save</button>;
}
```

## Example — composed form

```tsx
import { View } from "@kbml-tentacles/solid";
import { loginViewModel } from "./login-vm";
import EmailField from "./EmailField";
import PasswordField from "./PasswordField";
import SubmitButton from "./SubmitButton";

function LoginPage() {
  return (
    <View model={loginViewModel} props={{ onSuccess: navigate }}>
      <EmailField />
      <PasswordField />
      <SubmitButton />
    </View>
  );
}
```

Descendants call `useModel(loginViewModel)` to read the shape.

## Edge cases

- Swapping `model` destroys the previous instance and creates a new one.
- Two `<View>`s with the same definition create two independent instances; `useModel(vm)` reads the innermost.
- When no descendant reads the shape, the context provider still exists but incurs only one context allocation per mount.
- Rendering without `children` still mounts the view-model — useful for lifecycle-only effects.
- Avoid wrapping the shape in `createStore`/`createSignal`; stores live in effector and are bridged through `useUnit`.

## See also

- [`useView`](./use-view) — primitive equivalent without context.
- [`useModel`](./use-model) — overload 1 reads `<View>` context.
- [`<Each>`](./each) — iteration counterpart for models.
