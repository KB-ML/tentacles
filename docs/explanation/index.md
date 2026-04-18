# Explanation

The pages in this section are essays. They do not teach you how to do anything specific, and they do not walk you through building a project.

Their job is to help you understand why Tentacles is shaped the way it is — the trade-offs behind its decisions, the invariants that hold its parts together, and the mental model you need to reason about it when things get subtle.

## Explanation in the Diataxis framework

In the Diataxis framework, explanation sits apart from tutorials, how-to guides, and reference. Each has its own purpose, its own audience, and its own way of delivering value.

A tutorial teaches a beginner by doing. It picks a path and marches you down it. You come out the other side with a working piece of code and an intuition for the steps you took.

A how-to guide solves a specific problem for someone who already knows what they want. It assumes competence and takes shortcuts. Its value is practical: you came in with a question, you leave with an answer.

A reference is a look-up table. It does not try to argue; it just catalogs. You open it when you want to know the exact signature of a function, the exact set of options an object takes, the exact contract a method promises.

Explanation is the reading you do at your desk when you want to understand, not act — the thinking that prepares you to apply the rest of the documentation confidently rather than mechanically.

It is closer to an essay than to a manual. The goal is to leave you with a better mental model, not with a script you can run.

## How these pages are structured

Each essay in this section follows roughly the same shape. It introduces a piece of the library, explains the problem the piece is solving, considers alternatives, and settles on a rationale.

Where it is useful, the essay shows you the trade-offs — what you gain, what you give up, and what residual cost stays with you.

The essays are written for the reader who has finished the [first tutorial](/tutorials/your-first-model) and is now trying to understand what happened inside the library while they were typing.

If you have not built a model yet, some of the terms will feel abstract. If you have, they will ground into real objects you have seen.

You can read these pages in any order, though some build on each other. The architecture overview introduces names that later pages use without ceremony. The strategy pattern page assumes you are comfortable with the contract layer. Everything else is pretty independent.

## The pages

[Architecture](/explanation/architecture) — A layer-by-layer tour of the five packages inside `@kbml-tentacles/core`: contract, model, query, view-model, and shared. What each layer owns, what it deliberately does not own, and how the contract-to-runtime pipeline holds them together.

[Contracts and runtime](/explanation/contracts-and-runtime) — Why contracts are declarative descriptors rather than live objects, and why models are separate. The fluent chain builder, phantom-key generics, and the handoff from `ModelContractChain` to `FinalizedContractImpl` to `Model`.

[Field proxies](/explanation/field-proxies) — Why `instance.$title` is a Proxy rather than an effector store. The read, write, and subscribe paths through the shared `$dataMap`. When real stores do materialize, why it is rare, and what you pay when it happens.

[Lightweight instances](/explanation/lightweight-instances) — Models without `fn`, refs, computed fields, `resetOn`, or indexes skip `withRegion` entirely. How Tentacles detects that, the spectrum from zero effector nodes to user-created extensions, and when you would want to leave the lightweight path on purpose.

[Incremental queries](/explanation/incremental-queries) — The two update paths in the filter stage: full scan for structural changes, incremental sample for single-field mutations. The `$lastField` optimization in the sort stage, the plain-row projection of `$list`, and why `QueryField` derives directly from `$ids` and `$dataMap`.

[Strategy pattern](/explanation/strategy-pattern) — Why the `CONTRACT_CHAIN_STRATEGY` symbol exists. How `pick`, `omit`, `partial`, `required`, and `merge` work across all chain types without `instanceof` checks, and why `Symbol.for` makes the strategy survive duplicate module copies.

[SSR and SIDs](/explanation/ssr-and-sids) — Why effector stores need SIDs, how `detectSidRoot` and the babel plugin cooperate to produce stable ones, and what `fork`, `serialize`, and `allSettled` mean in practice. Why `Model.create(data, { scope })` returns a Promise.

[Design decisions](/explanation/design-decisions) — A curated list of notable choices, each with context, alternatives considered, and rationale. The kind of appendix you skim when you want to know why something is the way it is and whether you are about to walk into a known trade-off.

## A note on tone

The essays are intentionally conversational. They prefer prose to bullet lists.

They use "we" when describing choices the library's authors made, and "you" when addressing you as the reader. They take their time.

If you are used to terse reference documentation, the style may feel slow. That is a feature, not an accident.

Explanation is the kind of documentation you read when you want to understand the why, and the why does not fit comfortably into bullets.

The essays do not try to be exhaustive. They try to be honest.

When a design has a residual cost, the essay names it. When we considered an alternative and rejected it, the essay says what the alternative was and why we moved on.

You should come away knowing where the bodies are buried, not just where the shiny parts are polished.

## How to read these

Explanation pages are long on purpose. They are meant to be read slowly, on a second cup of tea, and they assume you have at least finished the [first tutorial](/tutorials/your-first-model).

If you find yourself lost in a reference to an internal class or event, check the [architecture](/explanation/architecture) page first — it gives names to things the other essays use without ceremony.

If you are reading because you are about to make a technical decision in your own code — whether to reach for Tentacles for a particular problem, how to structure a model, whether to use a view model or a regular model for some piece of state — then skim the essay most relevant to the decision and come back to the rest when you have time.

The essays are designed to reward depth but to tolerate skimming.

If you are reading to understand the library itself — because you are extending it, contributing to it, or just trying to understand how reactive libraries can be built — then read them in order, and read them closely.

The internal detail is consistent across the set, and the later essays rely on the framing the earlier ones introduce.

## When to open an issue

If something in these essays surprises you, or contradicts what the library actually does in a version you are using, we would rather hear about it than leave you guessing.

Open an issue. The explanations are meant to be honest, and honesty in a library means matching the code.

If you think a page is missing an essay — a design decision that deserves its own page, a question that keeps coming up — open an issue about that, too.

This section will grow as the library grows. Our rule is that explanation should cover the parts users most need to understand, not the parts the authors found most interesting to write.

## What is not in this section

The explanation section does not try to replace the other kinds of documentation.

If you want to learn by doing, start with the [tutorials](/tutorials/your-first-model).

If you want to solve a specific problem, the [how-to guides](/how-to/) are where to look.

If you want the exact signatures of every function, type, and method, the [reference](/reference/) has them all.

These essays complement the others; they do not replace them. Read an essay when you want to understand why something is the way it is. Read a tutorial when you want to practice doing it. Read a how-to when you want to solve a specific problem. Read the reference when you need the precise details.

## Where to go next

If you are new to the explanation section, start with [Architecture](/explanation/architecture). It is the map that the rest of the territory fits into.

If you are already familiar with the basics and want to understand a specific corner of the library, jump straight to the page that covers it. The pages are self-contained enough that you will not miss critical framing by skipping ahead.

If you are trying to make a technical call and want the short version, the [Design decisions](/explanation/design-decisions) page is the closest thing to a summary. Every choice has context, alternatives, and residual cost in a few paragraphs each.

## A final note on trust

Documentation is a contract with the reader.

When an essay says "the library does X for this reason," you are trusting that the statement is true.

We try to keep it true.

When the code changes, the essays get updated. When we realize an old justification no longer applies, the rationale gets rewritten. When a design we chose turns out to be wrong, we say so and explain what we learned.

This is easier to promise than to deliver. We ask you to help us keep it honest: when you see a mismatch between what an essay says and what the library does, open an issue. The documentation should never drift away from reality, and your eyes are the best tool we have for catching drift before it compounds.
