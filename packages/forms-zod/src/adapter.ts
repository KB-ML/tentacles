import type { CustomAsyncValidator, CustomValidator, ValidationIssue } from "@kbml-tentacles/forms";
import type { z } from "zod";

/**
 * Sync adapter for zod schemas.
 * Use for schemas without async refinements.
 *
 * @example
 * .field("email", f => f<string>().validate(zod(z.string().email())))
 */
export function zod<T>(schema: z.ZodType<T>): CustomValidator<T> {
  return {
    __type: "form-validator",
    async: false,
    validate(value) {
      const result = (schema as any).safeParse(value);
      if (result.success) return null;
      const issues = result.error?.issues ?? result.issues ?? [];
      return issues.map(
        (issue: any): ValidationIssue => ({
          path: issue.path ?? [],
          message: issue.message,
          code: issue.code,
        }),
      );
    },
  };
}

/**
 * Async adapter for zod schemas with async refinements.
 * Use for schemas with `.refine(async ...)` or `.superRefine(async ...)`.
 *
 * @example
 * .field("username", f => f<string>().validateAsync(zodAsync(z.string().refine(async v => ...))))
 */
export function zodAsync<T>(schema: z.ZodType<T>): CustomAsyncValidator<T> {
  return {
    __type: "form-validator",
    async: true,
    async validate(value, ctx) {
      const result = await (schema as any).safeParseAsync(value);
      if (ctx.signal.aborted) return null;
      if (result.success) return null;
      const issues = result.error?.issues ?? result.issues ?? [];
      return issues.map(
        (issue: any): ValidationIssue => ({
          path: issue.path ?? [],
          message: issue.message,
          code: issue.code,
        }),
      );
    },
  };
}
