# Reference

Reference documentation for the Tentacles packages. Each page is a specification: it lists the inputs a function accepts, the value it returns, the side effects it performs, and the conditions under which it throws. There is no narrative, no project setup, no problem-solving advice. Use these pages when you already know what you want to call and need to confirm exactly how to call it.

> Reference is one of the four documentation modes in the [Diataxis](https://diataxis.fr) framework. It exists to be looked up, not read. If you are learning Tentacles for the first time, start with the [tutorials](/tutorials/). If you are trying to solve a specific problem, the [how-to guides](/how-to/) are organised by task. If you want to understand the design choices, see [explanation](/explanation/).

## Packages

| Package | Purpose |
|---|---|
| [`@kbml-tentacles/core`](/reference/core/) | Contracts, models, queries, view models. The library itself, framework-agnostic. |
| [`@kbml-tentacles/react`](/reference/react/) | React hooks and components: `<View>`, `<Each>`, `useModel`, `useView`. |
| [`@kbml-tentacles/vue`](/reference/vue/) | Vue 3 composables and components: `<View>`, `<Each>`, `useModel`, `useView`. |
| [`@kbml-tentacles/solid`](/reference/solid/) | SolidJS primitives and components: `<View>`, `<Each>`, `useModel`, `useView`. |

The framework packages are thin adapters. Everything reactive lives in `@kbml-tentacles/core`; the adapters wire its outputs into a host framework's reactivity system.

## How to read a reference page

Every page in this section follows the same structure:

1. A short paragraph naming the construct and its role.
2. Method or function signatures in TypeScript, with parameters and return types annotated.
3. A minimal example showing the construct in use.
4. Notes on edge cases — when the function throws, returns `undefined`, or behaves differently in SSR.

Signatures are the source of truth. Examples are illustrative. Edge-case notes describe behaviour you may not have anticipated; absence of a note does not imply absence of behaviour, only that nothing is unusual.

## Conventions

- Type parameters are written with their compile-time names (`T`, `K`, `Stores`, `Events`). When a parameter has a phantom-key generic in the source, the page describes its observable effect rather than reproducing the symbol.
- Method chains return `this` with widened phantom types. The page lists the wider type so subsequent calls are checkable.
- Effector primitives (`Store<T>`, `EventCallable<T>`, `Scope`) are used as-is — see [the effector docs](https://effector.dev) for their semantics.
- All examples assume `import { ... } from "@kbml-tentacles/core"` (or the equivalent framework package) unless stated otherwise.

## Reference structure per package

Every package has a parallel layout:

- **Package overview** (`/reference/<pkg>/`) — install command, export table, version notes.
- **One page per primary export** — factory, class, or standalone helper. The page's filename mirrors the export name (`create-contract`, `use-view`, etc.).
- **Supporting pages** — helpers and types grouped together (`helpers`, `types`) when they are too small to warrant individual pages.

The left sidebar expands under the package you are reading. Pages are ordered roughly by conceptual dependency: contracts → field builders → contract utilities → model → query → view model → helpers → types.

## How stable is this?

- Signatures listed in reference pages are the public API. Breaking changes follow semantic versioning (currently `0.x`, so minor-version breaks are permitted).
- Types marked `@internal` in the source are not listed here — they may change without notice.
- Helper functions used by custom chains and framework adapters (see [Helpers](/reference/core/helpers)) are public but niche.

## When this is not the right section

| You want to… | Go to |
|---|---|
| Build something end-to-end | [Tutorials](/tutorials/) |
| Solve a specific problem | [How-to guides](/how-to/) |
| Understand a design decision | [Explanation](/explanation/) |
| Look up a method signature | You are in the right place |
