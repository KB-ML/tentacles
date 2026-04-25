---
"@kbml-tentacles/core": patch
---

Anchor query-derived stores in the **model's** region instead of
inheriting whatever region was active on first access. Cached
`CollectionQuery` instances no longer get torn down when an unrelated
`<View>` (whose region happened to be active when the query first
materialised) unmounts.

`QueryContext` gains a `region: Node` field that lazy `$filtered` /
`$sorted` / `$list` / `$count` / `QueryField` builders wrap with
`withRegion(...)`. Functionally this matches what `model.$ids` /
`$dataMap` already do — query outputs share the lifetime of the model
they query, not the lifetime of the first subscriber.

No public API change; this is purely a fix for a teardown bug that
showed up when a query was created inside a view-model `fn` and then
read from a different view's render scope.
