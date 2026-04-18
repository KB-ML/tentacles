import type { FormContractChainImpl } from "../form-contract-chain";

/**
 * Branded type for recursive form contract annotations.
 * Use this to break TypeScript's circular inference:
 *
 * ```ts
 * const commentContract: FormContract<CommentValues> = createFormContract<CommentValues>()
 *   .field("author", f => f<string>())
 *   .array("replies", () => commentContract);
 * ```
 */
export type FormContract<V extends Record<string, unknown>> = FormContractChainImpl<V, any>;
