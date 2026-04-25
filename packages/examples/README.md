# examples

Next.js 16 SSR demo app for [Tentacles](../../README.md). Each route under `src/app/<NN>-<name>` is a self-contained example focused on one set of features.

This package is private and is not published to npm.

## Run locally

From the repo root:

```sh
yarn install
yarn build       # build all library packages once
yarn example     # serve the demo at http://localhost:3000
```

Or from this directory:

```sh
yarn dev
```

Library packages are linked via the workspace, so changes in `packages/core`, `packages/forms`, etc. are picked up after a rebuild (`yarn build` from the repo root).

## Examples

| Route | What it demonstrates |
|---|---|
| [`/01-todo`](./src/app/01-todo) | Single model, query, view-model basics, SSR fetch + hydrate |
| [`/02-food-order`](./src/app/02-food-order) | Nested `createMany` across multiple models, refs, per-page view-models, in-page routing |
| [`/03-tickets-order`](./src/app/03-tickets-order) | Forms + form arrays (passenger documents), schema validation |
| [`/04-tree-todo-list`](./src/app/04-tree-todo-list) | Self-referencing model with `inverse("children", "parent")` and SQL-style `onDelete: "cascade"` |

## Stack

- [Next.js 16](https://nextjs.org) (App Router, webpack mode)
- [`@effector/next`](https://github.com/effector/next) for SSR scope hydration
- [`@radix-ui/themes`](https://radix-ui.com/themes) for UI primitives
- All Tentacles workspace packages
