import type { CustomAsyncValidator, CustomValidator, ValidationIssue } from "@kbml-tentacles/forms";

/**
 * Sync adapter for valibot schemas.
 */
export function valibot<T>(schema: any): CustomValidator<T> {
  return {
    __type: "form-validator",
    async: false,
    validate(value) {
      // Uses valibot's safeParse
      const { safeParse } = require("valibot") as any;
      const result = safeParse(schema, value);
      if (result.success) return null;
      return result.issues.map(
        (issue: any): ValidationIssue => ({
          path: issue.path?.map((p: any) => p.key as string | number) ?? [],
          message: issue.message,
        }),
      );
    },
  };
}

/**
 * Async adapter for valibot schemas with async pipes.
 */
export function valibotAsync<T>(schema: any): CustomAsyncValidator<T> {
  return {
    __type: "form-validator",
    async: true,
    async validate(value, ctx) {
      const { safeParseAsync } = require("valibot") as any;
      const result = await safeParseAsync(schema, value);
      if (ctx.signal.aborted) return null;
      if (result.success) return null;
      return result.issues.map(
        (issue: any): ValidationIssue => ({
          path: issue.path?.map((p: any) => p.key as string | number) ?? [],
          message: issue.message,
        }),
      );
    },
  };
}
