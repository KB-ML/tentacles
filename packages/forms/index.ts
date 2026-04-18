// ─── Contract layer ─────────────────────────────────────────────────────────

export { createFormContract } from "./src/contract/create-form-contract";
export {
  type ExtractValues,
  type FormArrayOptions,
  FormContractChainImpl,
  FormContractError,
  type InferFieldsFromChain,
} from "./src/contract/form-contract-chain";
export type { FormContract } from "./src/contract/types/form-contract";

// ─── Validator types ────────────────────────────────────────────────────────

export type {
  AsyncFieldValidator,
  CrossFieldValidator,
  CustomAsyncValidator,
  CustomValidator,
  FieldValidator,
  ReValidationMode,
  SyncFieldValidator,
  ValidationIssue,
  ValidationMode,
  ValidationResult,
  ValidatorCtx,
} from "./src/contract/types/validator";

// ─── Runtime ────────────────────────────────────────────────────────────────

export { createFormViewModel } from "./src/runtime/create-form-view-model";

// ─── Runtime types ──────────────────────────────────────────────────────────

export type { Field, SetFieldValuePayload } from "./src/types/field";
export type { FormArrayShape, FormRowShape } from "./src/types/form-array-shape";
export type {
  DeepErrors,
  DeepPartial,
  FormShape,
  KeepStateOptions,
  ResetPayload,
  SetErrorPayload,
  SetValuePayload,
} from "./src/types/form-shape";
