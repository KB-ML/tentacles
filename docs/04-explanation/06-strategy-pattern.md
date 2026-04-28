---
description: "Strategy pattern: Tentacles ships five contract utilities that work on any chain type: pick, omit, partial, required, and merge."
---

# Strategy pattern

Tentacles ships five contract utilities that work on any chain type: `pick`, `omit`, `partial`, `required`, and `merge`.

Each one takes one or more contracts and produces a new contract.

Each one has to work on `ModelContractChain`, `ViewContractChain`, `PropsContractChainImpl`, and — crucially — on chain types the core library does not know about, like the `FormContractChainImpl` that ships in `@kbml-tentacles/forms`.

The obvious implementation would be a chain of `instanceof` checks. The less obvious implementation, and the one the library actually uses, is a strategy pattern keyed by a well-known symbol.

This page is about why that second choice was the right one.

## The problem with `instanceof`

An `instanceof`-based implementation of `pick` would look something like this:

```ts
function pick<C, K extends string>(contract: C, keys: K[]): C {
  if (contract instanceof ModelContractChain) {
    // build a new ModelContractChain with a subset of fields
  } else if (contract instanceof ViewContractChain) {
    // build a new ViewContractChain with a subset of fields
  } else if (contract instanceof PropsContractChainImpl) {
    // build a new PropsContractChainImpl with a subset of fields
  } else {
    throw new Error("Unknown contract type")
  }
}
```

This works at the scale of the core package. It does not scale to the package system.

### Cross-package recognition

The first problem is that `@kbml-tentacles/forms` defines its own chain type, `FormContractChainImpl`.

The core package does not know about it and cannot know about it — the dependency goes the other way.

If `pick` used `instanceof` against core's types, it would not recognize form contracts, and users would have to import form-specific versions of every utility.

That is a poor developer experience: the utilities should work on any contract shape, not just the core ones.

### Module identity

The second problem is module identity.

If two parts of the same application load different copies of the core package (say, because `forms` pulls in its own `core` as a dependency and the user's app has its own), then `ModelContractChain` is actually two distinct classes at runtime, each with its own identity.

An `instanceof` check against one class fails against the other, even though the objects are structurally identical.

This is an unfortunate reality of Node's module resolution: dedupe is best-effort, not guaranteed.

### Coupling to concrete classes

The third problem is that `instanceof` couples the utility to the concrete classes, which means extending the library with new chain types requires modifying the utilities.

Every new chain type needs a new branch in `pick`, another in `omit`, another in `partial`, and so on.

That is not a friendly shape for extension.

## The strategy

The library solves all three problems by making every chain expose a strategy object under a well-known symbol: `CONTRACT_CHAIN_STRATEGY`, defined as `Symbol.for("tentacles:contractChainStrategy")`.

### Implementing the strategy

A chain's strategy implements the `ContractChainStrategy<C>` interface.

The interface has a handful of methods the utilities need: `entityNames`, `createEmpty`, `copyEntities`, `copyAll`, `applyPartial`, `applyRequired`, `validateRefs`.

Each method answers a question the utilities would otherwise have to ask via `instanceof`.

### Dispatching through the strategy

The utilities read the strategy from the input contract and dispatch through it.

`pick(contract, keys)` reaches for `contract[CONTRACT_CHAIN_STRATEGY]`, uses its `createEmpty` to start a new chain of the right kind, and uses `copyEntities` to copy the selected fields.

There is no `instanceof` check anywhere.

### Plugging in new chains

A new chain type — like `FormContractChainImpl` — implements the strategy, exposes it under the symbol, and automatically participates in the utilities.

The core package does not have to know about it.

The forms package does not have to ship its own `pick`, `omit`, or `partial`.

Both packages agree on the strategy interface and the symbol, and that is enough.

## Why `Symbol.for` matters

`Symbol.for("tentacles:contractChainStrategy")` returns the same symbol object for any call with the same key, across module boundaries.

This is the key difference between `Symbol.for` and `Symbol()`: the latter produces a new symbol each call, so two modules calling `Symbol()` with the same description end up with different symbols and cannot communicate via the property they name.

### The global registry

`Symbol.for` uses a global registry keyed by the string.

Even if `@kbml-tentacles/core` is loaded twice — once as the user's dependency, once as a transitive dependency of `@kbml-tentacles/forms` — both copies call `Symbol.for("tentacles:contractChainStrategy")` and get the same symbol.

An object created by one copy has a strategy property that the other copy can read.

### Surviving duplication

This is the mechanism that survives the module-identity problem described earlier.

Two `ModelContractChain` classes (from two loaded copies of core) are distinct classes with distinct identities, but an instance of either class exposes a strategy under the same symbol because the symbol lookup is global.

The utility from one copy can read the strategy set by the other.

### Why `Symbol.for` is non-negotiable

Without `Symbol.for`, the strategy pattern would be fragile.

With it, the pattern is robust across the kinds of duplication that package managers can introduce.

We picked the namespaced string `"tentacles:contractChainStrategy"` to make collisions with other libraries unlikely. The global registry is shared across all packages in the process, so naming matters.

## What the interface looks like

The `ContractChainStrategy<C>` interface has seven methods.

Each answers a narrow question.

### `entityNames`

`entityNames(contract): string[]` returns the names of the fields in the contract.

Used by `pick` and `omit` to validate that the requested keys exist and to iterate without hard-coding field shapes.

### `createEmpty`

`createEmpty(contract): C` returns a fresh, empty chain of the same kind as the input.

Used by every utility that produces a new contract.

`pick` uses it to start fresh and then copies the selected entities.

`merge` uses it to start the output contract.

### `copyEntities`

`copyEntities(source, target, names): C` copies the listed entities from one contract to another, preserving their descriptors.

Used by `pick` (copy the ones you wanted), `omit` (copy all except the ones you excluded), and `merge` (copy from both sources).

### `copyAll`

`copyAll(source, target): C` copies every entity from one contract to another.

Used by `partial` and `required` as the starting point for applying modifications.

### `applyPartial`

`applyPartial(contract): C` returns a new contract where every store is optional.

Used by `partial`.

### `applyRequired`

`applyRequired(contract): C` returns a new contract where every store is required.

Used by `required`.

### `validateRefs`

`validateRefs(contract): void` checks that all ref targets are resolvable.

Used by utilities that produce contracts whose ref integrity may have changed — `pick` and `omit` may produce contracts with dangling refs, and the validator is how the library refuses to let that happen silently.

### What the interface promises

The interface has a clear invariant: it does not leak runtime effector units.

It deals only in descriptors.

That keeps the utilities as lightweight as the underlying contracts.

## What a new chain implements

Adding a new chain type is a well-defined exercise.

The new type needs to:

1. Extend `BaseContractChain` (or produce a class that exposes the same descriptor shape).
2. Expose `[CONTRACT_CHAIN_STRATEGY]` as a property, whose value implements `ContractChainStrategy<C>`.
3. Implement the seven methods of the strategy in terms of the chain's own constructor and copy semantics.

### The result of implementing it

Once that is done, `pick(chain, keys)`, `omit(chain, keys)`, `partial(chain)`, `required(chain)`, and `merge(a, b)` all work on the new type without the core package needing to change.

### The forms package as example

The forms package is the canonical example.

`FormContractChainImpl` is not a subclass of anything in core, but it implements the strategy interface and exposes the symbol.

Users can write `pick(myFormContract, ["name", "email"])` and get a form contract with just those fields.

The core package's utility dispatched through the strategy and never needed to know about forms.

## The alternative: visitor pattern

We considered a visitor pattern as an alternative.

In a visitor, the utility would hand itself to the contract, and the contract would dispatch to the correct method based on its own type.

The call shape would be something like `contract.acceptPickVisitor(pick, keys)`.

### Why visitor was wrong here

The problem with visitor is that adding a new utility requires every chain type to implement a new method.

If we added a hypothetical `flatten` utility, every chain type would need `acceptFlattenVisitor`.

That is backward: we want new utilities to be easy, because users might want to add their own.

### How strategy inverts the direction

Strategy inverts the direction.

The strategy interface is fixed; adding a utility means writing a new function that dispatches through the existing interface.

The chain types do not need to change.

Adding a new chain type means implementing the existing interface.

The utilities do not need to change.

### The trade-off of strategy

The trade-off is that the strategy interface has to be comprehensive enough to cover all the utilities.

If a new utility needs an operation the interface does not expose, we have to extend the interface, and every chain type's implementation has to update.

So far, the seven-method surface has been enough.

## The alternative: a registry

Another alternative is a runtime registry where chain constructors are registered with their strategies.

The utility would look up the registry by the chain's constructor, find the strategy, and dispatch through it.

This avoids `instanceof` but keeps the registration centralized.

### Why a registry was wrong

The problem with a registry is that it introduces a registration order.

Whoever loads first wins.

If two packages try to register the same constructor with different strategies (say, because of version drift), the behavior depends on import order, which is fragile.

And a registry still suffers from the module-identity problem: two loaded copies of core would have two constructor identities, and the registry would have to key by something deeper than the constructor.

### Why the strategy-on-the-instance is simpler

The strategy-on-the-instance approach is simpler.

The contract carries its own strategy.

The utility does not need to know where the strategy was registered; it just reads it off the contract.

There is no registration order, no central table, no module-identity problem beyond the symbol's well-known name, which `Symbol.for` solves.

## The alternative: structural ducktyping

A third alternative is to ducktype the chain's shape and dispatch based on the presence of certain properties.

If the contract has a `_pkFields` phantom key, it is a model contract; if it has a `_pcProps`, it is a props contract; and so on.

### Why ducktyping was wrong

The problem with structural duck-typing is that it relies on the shape of phantom keys, which are compile-time constructs.

They do not appear at runtime.

The library would have to either expose them as real runtime properties (which defeats the phantom-key design) or use fingerprinting tricks (which are hard to maintain).

### What strategy gives us instead

The strategy pattern explicitly marks the chain's kind with the symbol-backed strategy object.

The marking is deliberate, not inferred, which means it is robust against changes to the contract's shape.

Add a new phantom key tomorrow, and the strategy still works.

## The shape of the code

The dispatching code in `pick` looks approximately like this:

```ts
export function pick<C extends BaseContractChain, K extends string>(
  contract: C,
  keys: K[],
): C {
  const strategy = contract[CONTRACT_CHAIN_STRATEGY]
  if (!strategy) {
    throw new TentaclesError("Contract has no strategy")
  }

  const names = strategy.entityNames(contract)
  validateKeys(names, keys)

  const empty = strategy.createEmpty(contract)
  const picked = strategy.copyEntities(contract, empty, keys)
  strategy.validateRefs(picked)
  return picked
}
```

### What the code is doing

The code is small because the strategy does the real work.

`pick` is a thin orchestration that reads the strategy, validates inputs, calls the strategy's methods in the right order, and returns the result.

Every chain type shapes its own behavior by implementing the strategy; the utility does not care about the details.

### Classic strategy discipline

This is classic strategy pattern discipline: keep the client dumb and put the variation in the strategy.

The client is easy to read and to audit.

The variation is localized in the strategy implementations, where the chain type's details are.

## Trade-offs

The strategy pattern adds a level of indirection.

Instead of reading `pick`'s code and seeing the full implementation, you see the outline and have to chase into the strategy to see the detail.

For readers unfamiliar with the pattern, this is a learning cost.

### Designing the interface

The strategy interface has to be designed carefully.

If it is too narrow, utilities cannot be built on top of it.

If it is too wide, every new chain type has to implement a lot of surface.

The seven-method surface we have now is the result of several rounds of pruning, and we expect it to stabilize rather than grow.

### The `Symbol.for` global

Separately, the `Symbol.for` trick does leave a global registry entry.

If another library uses the string `"tentacles:contractChainStrategy"` by accident, the symbols would collide.

The string includes the project's name as a prefix precisely to avoid that kind of collision.

Still, it is a small concern, and the benefit of cross-module compatibility outweighs it.

### What we get in return

The gain is significant.

The library works on any chain type, known or unknown, as long as the chain implements the strategy and exposes it under the well-known symbol.

Third-party packages can ship their own chain types without coordinating with the core maintainers.

The core utilities stay small, readable, and closed to modification.

That is the promise of the open/closed principle in action — open to extension, closed to modification — and the strategy pattern is how we got there.

## Why this matters for users of the library

Most users do not care about the strategy pattern. They write contracts, they call utilities, they get new contracts.

The pattern matters in two ways.

### Transparent extension

The first is when you build on top of Tentacles.

If you write a library that defines its own chain type — a domain-specific contract for your project, a wrapper around `ModelContractChain` with extra methods, a brand new kind of contract for your needs — implementing the strategy gives you the full power of the contract utilities.

`pick` works on your contracts. `omit` works. `partial` works. The whole toolkit composes with whatever you build.

### Cross-package safety

The second is when you integrate multiple Tentacles packages.

If you mix `@kbml-tentacles/core` with `@kbml-tentacles/forms`, the strategy pattern is what lets the utilities you import from core work on the contracts you create with forms.

You do not have to think about this; it just works. But the reason it works is the strategy.

## A mental model

The mental model that helps is this.

Every contract carries a recipe for how to manipulate it, attached as a property under a well-known key.

The library's utilities read the recipe and follow it.

Contracts of different kinds — model, view, props, form, your-custom-kind — can have different recipes.

The utilities do not care about the kind, only about the recipe.

This is what lets the same `pick` work on every kind. The `pick` does not know what `FormContractChainImpl` is; it just finds the recipe and follows it.

## Summary

The contract utilities are open to extension, closed to modification, because they dispatch through a strategy object under a well-known symbol.

The symbol is `Symbol.for("tentacles:contractChainStrategy")`, which guarantees the same identity across module loads.

The strategy interface has seven narrow methods, each answering a specific question the utilities need answered.

New chain types implement the strategy and gain support for all the utilities. Existing chain types do not have to change for new utilities to be added.

The pattern's cost is a level of indirection and a fixed interface; the benefit is a library that scales to chain types nobody imagined when the utility code was written.
