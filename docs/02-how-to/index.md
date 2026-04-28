---
description: "Problem-oriented guides for integrating Tentacles and solving common modeling and form tasks."
---

# How-to guides

Problem-oriented recipes. Each guide assumes you have a working Tentacles setup and want to solve a specific problem. Unlike [tutorials](/tutorials/), these do not build up step-by-step — they go straight to the task.

## Contracts

| Guide | Solves |
|---|---|
| [Define a contract](/how-to/define-a-contract) | "How do I declare fields and finalize a model?" |
| [Handle field constraints](/how-to/handle-field-constraints) | "How do I make a field unique / indexed / autoincrement / default?" |
| [Compose contracts](/how-to/compose-contracts) | "How do I share fields across contracts with `pick` / `omit` / `merge`?" |

## Models

| Guide | Solves |
|---|---|
| [Relate models with refs](/how-to/relate-models-with-refs) | "How do I model `hasMany` / `belongsTo` / many-to-many?" |
| [Query a collection](/how-to/query-a-collection) | "How do I filter, sort, paginate, and group instances reactively?" |
| [Build a view model](/how-to/build-a-view-model) | "How do I create a component-scoped view with props?" |

## Runtime

| Guide | Solves |
|---|---|
| [Enable SSR](/how-to/enable-ssr) | "How do I fork, serialize, and hydrate?" |

## Framework integration

| Guide | Solves |
|---|---|
| [Integrate with React](/how-to/integrate-with-react) | "How do I wire Tentacles into a React app?" |
| [Integrate with Vue](/how-to/integrate-with-vue) | "How do I wire Tentacles into a Vue 3 app?" |
| [Integrate with Solid](/how-to/integrate-with-solid) | "How do I wire Tentacles into a SolidJS app?" |

## Forms

| Guide | Solves |
|---|---|
| [Define a form contract](/how-to/define-a-form-contract) | "How do I declare fields, sub-forms, and arrays?" |
| [Add sync validation](/how-to/add-sync-validation) | "How do I validate a field on blur or change?" |
| [Add async validation](/how-to/add-async-validation) | "How do I check a field against the server with debounce?" |
| [Use a schema validator](/how-to/use-schema-validator) | "How do I plug in Zod / Yup / Joi / Valibot / Arktype?" |
| [Work with form arrays](/how-to/work-with-form-arrays) | "How do I append, remove, reorder rows?" |
| [Cross-field validation](/how-to/cross-field-validation) | "How do I validate 'passwords match' or 'endDate > startDate'?" |
| [Handle submission](/how-to/handle-submission) | "How do I wire submit → effect → success/error?" |
| [Reset and keep state](/how-to/reset-and-keep-state) | "How do I reset the form but keep some fields?" |

## When to use how-to guides

| If… | Go to |
|---|---|
| You are new to Tentacles | [Tutorials](/tutorials/) — learn by building |
| You want to know what an API returns | [Reference](/reference/) — look up the signature |
| You want to understand why the library is shaped this way | [Explanation](/explanation/) |
| You know roughly what you want, just not how to spell it | You are in the right place — pick a guide above |
