import type {
  AsyncFieldValidator,
  CrossFieldValidator,
  ReValidationMode,
  SyncFieldValidator,
  ValidationMode,
} from "./types/validator";

// ─── Entity kinds ───────────────────────────────────────────────────────────

export type FormEntityKind = "field" | "sub" | "array";

// ─── Field descriptor ───────────────────────────────────────────────────────

export interface FormFieldDescriptor {
  readonly kind: "field";

  // Value shaping
  readonly defaultValue: unknown;
  readonly hasDefault: boolean;
  readonly isFactory: boolean;
  readonly isOptional: boolean;
  readonly isDisabled: boolean;

  // Sync validation
  readonly syncValidators: SyncFieldValidator[];
  readonly required: { flag: boolean; message?: string };
  readonly warnValidators: SyncFieldValidator[];

  // Async validation
  readonly asyncValidators: AsyncValidatorEntry[];

  // Mode override
  readonly validateOn: ValidationMode | null;
  readonly reValidateOn: ReValidationMode | null;

  // Dependencies
  readonly dependsOn: string[];

  // Transform
  readonly transform: { parse: Function; format: Function } | null;

  // Lifecycle
  readonly resetOn: string[];
}

export interface AsyncValidatorEntry {
  readonly fn: AsyncFieldValidator;
  readonly debounce?: number;
  readonly runOn?: ValidationMode;
}

// ─── Sub-form descriptor ────────────────────────────────────────────────────

export interface FormSubDescriptor {
  readonly kind: "sub";
  readonly contract: unknown; // FormContractChainImpl or thunk
  readonly isThunk: boolean;
}

// ─── Array descriptor ───────────────────────────────────────────────────────

export interface FormArrayDescriptor {
  readonly kind: "array";
  readonly contract: unknown; // FormContractChainImpl or thunk
  readonly isThunk: boolean;
  readonly min: number | { value: number; message: string } | null;
  readonly max: number | { value: number; message: string } | null;
}

// ─── Cross-field validator descriptor ───────────────────────────────────────

export interface CrossValidatorDescriptor {
  readonly validator: CrossFieldValidator;
}

// ─── Union entity ───────────────────────────────────────────────────────────

export type FormEntityDescriptor = FormFieldDescriptor | FormSubDescriptor | FormArrayDescriptor;
