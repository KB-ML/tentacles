# @kbml-tentacles/forms-arktype

[ArkType](https://arktype.io) validation adapter for [@kbml-tentacles/forms](../forms). Plug an ArkType schema into a field validator — error paths, codes, and messages flow through unchanged.

```sh
npm install arktype @kbml-tentacles/core @kbml-tentacles/forms @kbml-tentacles/forms-arktype
```

## Quick start

```ts
import { type } from "arktype";
import { createFormContract } from "@kbml-tentacles/forms";
import { arktype } from "@kbml-tentacles/forms-arktype";

const contract = createFormContract()
  .field("email", (f) =>
    f<string>().default("").validate(arktype(type("string.email"))),
  )
  .field("age", (f) =>
    f<number>().default(0).validate(arktype(type("number>=18"))),
  );
```

## API

- **`arktype(schema)`** — sync validator from any ArkType schema (the function returned by `type(...)`). ArkType is sync-first, so no async variant is needed; use a plain `.validateAsync(async (v) => ...)` if you need to combine with an async check.

## Documentation

- How-to: [use a schema validator](../../docs/how-to/use-schema-validator.md)
- Reference: [`docs/reference/validators`](../../docs/reference/validators)

## Peer dependencies

- `arktype >=2.0`
- `@kbml-tentacles/core ^1.0.0`
- `@kbml-tentacles/forms ^1.0.0`

## License

[MIT](../../LICENSE) © Nikita Lumpov
