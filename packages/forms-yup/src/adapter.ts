import type { CustomAsyncValidator, CustomValidator, ValidationIssue } from "@kbml-tentacles/forms";

interface YupValidationError {
  inner: Array<{ path?: string; message: string; type?: string }>;
  path?: string;
  message: string;
  type?: string;
}

function mapYupError(err: YupValidationError): ValidationIssue[] {
  const inner = err.inner;
  if (inner && inner.length > 0) {
    return inner.map(
      (e): ValidationIssue => ({
        path: e.path ? e.path.split(".") : [],
        message: e.message,
        code: e.type,
      }),
    );
  }
  return [
    {
      path: err.path ? err.path.split(".") : [],
      message: err.message,
      code: err.type,
    },
  ];
}

/**
 * Sync adapter for yup schemas.
 * Uses `schema.validateSync`.
 *
 * @example
 * .field("email", f => f<string>().validate(yup(yupString().email().required())))
 */
export function yup<T>(schema: any, opts?: { abortEarly?: boolean }): CustomValidator<T> {
  return {
    __type: "form-validator",
    async: false,
    validate(value) {
      try {
        schema.validateSync(value, { abortEarly: opts?.abortEarly ?? false });
        return null;
      } catch (err: unknown) {
        const { ValidationError } = require("yup") as any;
        if (err instanceof ValidationError) {
          return mapYupError(err as unknown as YupValidationError);
        }
        throw err;
      }
    },
  };
}

/**
 * Async adapter for yup schemas.
 * Uses `schema.validate` (returns a promise).
 *
 * @example
 * .field("username", f => f<string>().validateAsync(yupAsync(yupString().test(...))))
 */
export function yupAsync<T>(schema: any, opts?: { abortEarly?: boolean }): CustomAsyncValidator<T> {
  return {
    __type: "form-validator",
    async: true,
    async validate(value, ctx) {
      try {
        await schema.validate(value, { abortEarly: opts?.abortEarly ?? false });
        return null;
      } catch (err: unknown) {
        if (ctx.signal.aborted) return null;
        const { ValidationError } = require("yup") as any;
        if (err instanceof ValidationError) {
          return mapYupError(err as unknown as YupValidationError);
        }
        throw err;
      }
    },
  };
}
