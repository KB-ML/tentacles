# @kbml-tentacles/forms-yup

[Yup](https://github.com/jquense/yup) validation adapter for [@kbml-tentacles/forms](../forms). Plug a Yup schema into a field validator — error paths, types, and messages flow through unchanged.

```sh
npm install yup @kbml-tentacles/core @kbml-tentacles/forms @kbml-tentacles/forms-yup
```

## Quick start

```ts
import * as y from "yup";
import { createFormContract } from "@kbml-tentacles/forms";
import { yup, yupAsync } from "@kbml-tentacles/forms-yup";

const contract = createFormContract()
  .field("email", (f) =>
    f<string>().default("").validate(yup(y.string().email("Invalid").required("Required"))),
  )
  .field("username", (f) =>
    f<string>().default("").validateAsync(
      yupAsync(y.string().test("avail", "Taken", async (v) => await isAvailable(v ?? ""))),
    ),
  );
```

## API

- **`yup(schema, opts?)`** — sync validator using `schema.validateSync({ abortEarly: false })`. Each Yup issue maps to `{ path, message, code }`.
- **`yupAsync(schema)`** — async validator using `schema.validate({ abortEarly: false })`. Pair with `.validateAsync(...)` for debounce + cancellation.

## Documentation

- How-to: [use a schema validator](../../docs/how-to/use-schema-validator.md)
- Reference: [`docs/reference/validators`](../../docs/reference/validators)

## Peer dependencies

- `yup >=1.0`
- `@kbml-tentacles/core ^1.0.0`
- `@kbml-tentacles/forms ^1.0.0`

## License

[MIT](../../LICENSE) © Nikita Lumpov
