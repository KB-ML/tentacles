import { FormContractChainImpl } from "./form-contract-chain";

/**
 * Create a new form contract chain. Chain `.field()`, `.sub()`, `.array()`,
 * and `.validate()` calls to declare the form's shape.
 *
 * For recursive (self-referential) forms, pass the values type as a generic
 * and annotate the variable with `FormContract<T>`:
 *
 * ```ts
 * const commentContract: FormContract<CommentValues> =
 *   createFormContract<CommentValues>()
 *     .field("author", f => f<string>())
 *     .array("replies", () => commentContract);
 * ```
 */
export function createFormContract<
  _V extends Record<string, unknown> = {},
>(): FormContractChainImpl {
  return new FormContractChainImpl();
}
