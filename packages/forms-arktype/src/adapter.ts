import type { CustomValidator, ValidationIssue } from "@kbml-tentacles/forms";

/**
 * Sync adapter for arktype schemas.
 * Arktype is sync-first — no async variant needed.
 *
 * @example
 * .field("email", f => f<string>().validate(arktype(type("string.email"))))
 */
export function arktype<T>(schema: any): CustomValidator<T> {
  return {
    __type: "form-validator",
    async: false,
    validate(value) {
      const result = schema(value);
      if (result?.[" arkKind"] === "errors") {
        return (result as unknown as any[]).map(
          (err: any): ValidationIssue => ({
            path: Array.from(err.path ?? []) as (string | number)[],
            message: err.message,
            code: err.code,
          }),
        );
      }
      return null;
    },
  };
}
