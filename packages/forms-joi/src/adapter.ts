import type { CustomAsyncValidator, CustomValidator, ValidationIssue } from "@kbml-tentacles/forms";

interface JoiValidationDetail {
  path: (string | number)[];
  message: string;
  type: string;
}

function mapJoiDetails(details: JoiValidationDetail[]): ValidationIssue[] {
  return details.map(
    (d): ValidationIssue => ({
      path: d.path,
      message: d.message,
      code: d.type,
    }),
  );
}

/**
 * Sync adapter for joi schemas.
 * Uses `schema.validate` with `{ abortEarly: false }`.
 *
 * @example
 * .field("email", f => f<string>().validate(joi(Joi.string().email().required())))
 */
export function joi<T>(schema: any): CustomValidator<T> {
  return {
    __type: "form-validator",
    async: false,
    validate(value) {
      const result = schema.validate(value, { abortEarly: false });
      if (result.error) {
        return mapJoiDetails(result.error.details);
      }
      return null;
    },
  };
}

/**
 * Async adapter for joi schemas.
 * Uses `schema.validateAsync` with `{ abortEarly: false }`.
 *
 * @example
 * .field("email", f => f<string>().validateAsync(joiAsync(Joi.string().email().external(...))))
 */
export function joiAsync<T>(schema: any): CustomAsyncValidator<T> {
  return {
    __type: "form-validator",
    async: true,
    async validate(value, ctx) {
      try {
        await schema.validateAsync(value, { abortEarly: false });
        return null;
      } catch (err: any) {
        if (ctx.signal.aborted) return null;
        if (err.details) {
          return mapJoiDetails(err.details);
        }
        throw err;
      }
    },
  };
}
