# @kbml-tentacles/forms-zod

[Zod](https://zod.dev) validation adapter for [@kbml-tentacles/forms](../forms). Plug a Zod schema straight into a field validator — error paths, codes, and messages flow through unchanged.

```sh
npm install zod @kbml-tentacles/core @kbml-tentacles/forms @kbml-tentacles/forms-zod
```

## Quick start

```ts
import { z } from "zod";
import { createFormContract } from "@kbml-tentacles/forms";
import { zod, zodAsync } from "@kbml-tentacles/forms-zod";

const contract = createFormContract()
  .field("email", (f) =>
    f<string>().default("").validate(zod(z.string().email("Invalid email"))),
  )
  .field("username", (f) =>
    f<string>().default("").validateAsync(
      zodAsync(z.string().refine(async (v) => await isAvailable(v), "Taken")),
    ),
  );
```

## API

- **`zod(schema)`** — sync validator from a `ZodType`. Maps each issue to `{ path, message, code }`. Use with `.validate(...)`, `.required(...)`, or `.custom(...)`.
- **`zodAsync(schema)`** — async validator for schemas that use `refine(async ...)` / `superRefine(async ...)`. Use with `.validateAsync(...)` for built-in debounce + `AbortController` cancellation.

## Documentation

- How-to: [use a schema validator](../../docs/how-to/use-schema-validator.md)
- Reference: [`docs/reference/validators`](../../docs/reference/validators)

## Peer dependencies

- `zod >=3.20`
- `@kbml-tentacles/core ^1.0.0`
- `@kbml-tentacles/forms ^1.0.0`

## License

[MIT](../../LICENSE) © Nikita Lumpov
