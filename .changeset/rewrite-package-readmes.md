---
"@kbml-tentacles/core": patch
"@kbml-tentacles/forms": patch
"@kbml-tentacles/react": patch
"@kbml-tentacles/vue": patch
"@kbml-tentacles/solid": patch
"@kbml-tentacles/forms-react": patch
"@kbml-tentacles/forms-vue": patch
"@kbml-tentacles/forms-solid": patch
"@kbml-tentacles/forms-zod": patch
"@kbml-tentacles/forms-yup": patch
"@kbml-tentacles/forms-valibot": patch
"@kbml-tentacles/forms-arktype": patch
"@kbml-tentacles/forms-joi": patch
---

Replace the placeholder package READMEs with proper, package-specific
documentation. Every package now ships with:

- a one-line summary of what it provides,
- a copy-pasteable install command including peer dependencies,
- a quick-start example using the **current** API (the previous READMEs
  were stubs in Russian referencing an old `createContract((builder) => ...)`
  signature that no longer exists),
- a short API rundown of the public exports,
- cross-links to the relevant tutorial / how-to / reference pages in the
  monorepo's `docs/` site.

No code changes — this is purely the package-page content npm and the
GitHub package directory listings render. Bumped as patch so the next
publish refreshes the npm landing page for each package.
