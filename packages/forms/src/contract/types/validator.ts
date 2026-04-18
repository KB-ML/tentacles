// ─── Validator context ──────────────────────────────────────────────────────

export interface ValidatorCtx<Values = unknown> {
  readonly values: Values;
  readonly rootValues: unknown;
  readonly path: readonly (string | number)[];
  readonly signal: AbortSignal;
}

// ─── Validation results ─────────────────────────────────────────────────────

export type ValidationResult = null | string | string[] | ValidationIssue[];

export interface ValidationIssue {
  readonly path: readonly (string | number)[];
  readonly message: string;
  readonly code?: string;
}

// ─── Sync validators ────────────────────────────────────────────────────────

export type SyncFieldValidator<T = unknown> =
  | ((value: T, ctx: ValidatorCtx) => ValidationResult)
  | CustomValidator<T>;

export interface CustomValidator<T> {
  readonly __type: "form-validator";
  readonly async: false;
  validate(value: T, ctx: ValidatorCtx): ValidationResult;
}

// ─── Async validators ───────────────────────────────────────────────────────

export type AsyncFieldValidator<T = unknown> =
  | ((value: T, ctx: ValidatorCtx) => Promise<ValidationResult>)
  | CustomAsyncValidator<T>;

export interface CustomAsyncValidator<T> {
  readonly __type: "form-validator";
  readonly async: true;
  validate(value: T, ctx: ValidatorCtx): Promise<ValidationResult>;
}

// ─── Union ──────────────────────────────────────────────────────────────────

export type FieldValidator<T = unknown> = SyncFieldValidator<T> | AsyncFieldValidator<T>;

// ─── Validation modes ───────────────────────────────────────────────────────

export type ValidationMode = "submit" | "blur" | "change" | "touched" | "all";
export type ReValidationMode = "change" | "blur" | "submit";

// ─── Cross-field validator ──────────────────────────────────────────────────

export type CrossFieldValidator<Values = unknown> = (
  values: Values,
  ctx: ValidatorCtx<Values>,
) => ValidationResult;
