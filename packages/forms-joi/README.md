# @kbml-tentacles/forms-joi

[Joi](https://joi.dev) validation adapter for [@kbml-tentacles/forms](../forms). Plug a Joi schema into a field validator — every error detail (path, message, type) flows through unchanged.

```sh
npm install joi @kbml-tentacles/core @kbml-tentacles/forms @kbml-tentacles/forms-joi
```

## Quick start

```ts
import Joi from "joi";
import { createFormContract } from "@kbml-tentacles/forms";
import { joi, joiAsync } from "@kbml-tentacles/forms-joi";

const contract = createFormContract()
  .field("email", (f) =>
    f<string>().default("").validate(joi(Joi.string().email().required())),
  )
  .field("username", (f) =>
    f<string>().default("").validateAsync(
      joiAsync(
        Joi.string().external(async (val) => {
          if (!(await isAvailable(val))) throw new Error("Taken");
        }),
      ),
    ),
  );
```

## API

- **`joi(schema)`** — sync validator using `schema.validate(value, { abortEarly: false })`. Each Joi detail maps to `{ path, message, code }`.
- **`joiAsync(schema)`** — async validator using `schema.validateAsync(...)`. Pair with `.validateAsync(...)` for debounce + cancellation. Required if the schema uses `.external(...)` rules.

## Documentation

- How-to: [use a schema validator](../../docs/how-to/use-schema-validator.md)
- Reference: [`docs/reference/validators`](../../docs/reference/validators)

## Peer dependencies

- `joi >=17.0`
- `@kbml-tentacles/core ^1.0.0`
- `@kbml-tentacles/forms ^1.0.0`

## License

[MIT](../../LICENSE) © Nikita Lumpov
