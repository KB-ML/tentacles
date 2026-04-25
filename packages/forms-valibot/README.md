# @kbml-tentacles/forms-valibot

[Valibot](https://valibot.dev) validation adapter for [@kbml-tentacles/forms](../forms). Plug a Valibot schema into a field validator — issues with their full path flow through unchanged.

```sh
npm install valibot @kbml-tentacles/core @kbml-tentacles/forms @kbml-tentacles/forms-valibot
```

## Quick start

```ts
import * as v from "valibot";
import { createFormContract } from "@kbml-tentacles/forms";
import { valibot, valibotAsync } from "@kbml-tentacles/forms-valibot";

const contract = createFormContract()
  .field("email", (f) =>
    f<string>().default("").validate(valibot(v.pipe(v.string(), v.email("Invalid")))),
  )
  .field("username", (f) =>
    f<string>().default("").validateAsync(
      valibotAsync(
        v.pipeAsync(
          v.string(),
          v.checkAsync(async (val) => await isAvailable(val), "Taken"),
        ),
      ),
    ),
  );
```

## API

- **`valibot(schema)`** — sync validator using `safeParse`. Each issue maps to `{ path, message }`.
- **`valibotAsync(schema)`** — async validator using `safeParseAsync` for schemas built with `pipeAsync` / `checkAsync`. Pair with `.validateAsync(...)` for debounce + cancellation.

## Documentation

- How-to: [use a schema validator](../../docs/how-to/use-schema-validator.md)
- Reference: [`docs/reference/validators`](../../docs/reference/validators)

## Peer dependencies

- `valibot >=0.30`
- `@kbml-tentacles/core ^1.0.0`
- `@kbml-tentacles/forms ^1.0.0`

## License

[MIT](../../LICENSE) © Nikita Lumpov
