import type { AsyncValidatorEntry, FormFieldDescriptor } from "./form-contract-descriptors";
import type {
  AsyncFieldValidator,
  ReValidationMode,
  SyncFieldValidator,
  ValidationMode,
  ValidationResult,
  ValidatorCtx,
} from "./types/validator";

// ─── Type-level phantom keys ────────────────────────────────────────────────

declare const _ffValue: unique symbol;
declare const _ffHasDefault: unique symbol;
declare const _ffIsRequired: unique symbol;
declare const _ffHasWarn: unique symbol;

export interface FormFieldMeta<
  T = unknown,
  HD extends boolean = false,
  R extends boolean = false,
  W extends boolean = false,
> {
  readonly [_ffValue]: T;
  readonly [_ffHasDefault]: HD;
  readonly [_ffIsRequired]: R;
  readonly [_ffHasWarn]: W;
}

// ─── Public types ───────────────────────────────────────────────────────────

export type FormFieldBuilder<Fields = unknown> = <T>() => FormFieldTypedImpl<
  T,
  false,
  false,
  false,
  Fields
>;

export type FormFieldTyped<
  T,
  HD extends boolean,
  R extends boolean,
  W extends boolean,
  Fields = unknown,
> = FormFieldTypedImpl<T, HD, R, W, Fields>;

// ─── Implementation ─────────────────────────────────────────────────────────

export class FormFieldTypedImpl<
  T,
  HD extends boolean,
  R extends boolean,
  W extends boolean,
  Fields = unknown,
> {
  // Phantom for type accumulator
  declare readonly [_ffValue]: T;
  declare readonly [_ffHasDefault]: HD;
  declare readonly [_ffIsRequired]: R;
  declare readonly [_ffHasWarn]: W;

  private _defaultValue: unknown = undefined;
  private _hasDefault = false;
  private _isFactory = false;
  private _isOptional = false;
  private _isDisabled = false;

  private _syncValidators: SyncFieldValidator[] = [];
  private _required: { flag: boolean; message?: string } = { flag: false };
  private _warnValidators: SyncFieldValidator[] = [];

  private _asyncValidators: AsyncValidatorEntry[] = [];

  private _validateOn: ValidationMode | null = null;
  private _reValidateOn: ReValidationMode | null = null;

  private _dependsOn: string[] = [];
  private _transform: { parse: Function; format: Function } | null = null;
  private _resetOn: string[] = [];

  // ─── Value shaping ──────────────────────────────────────────────────────

  default(
    value: T | ((ctx: Record<string, unknown>) => T),
  ): FormFieldTypedImpl<T, true, R, W, Fields> {
    this._hasDefault = true;
    if (typeof value === "function") {
      this._isFactory = true;
      this._defaultValue = value;
    } else {
      this._defaultValue = value;
    }
    return this as unknown as FormFieldTypedImpl<T, true, R, W, Fields>;
  }

  optional(): FormFieldTypedImpl<T | undefined, HD, R, W, Fields> {
    this._isOptional = true;
    return this as unknown as FormFieldTypedImpl<T | undefined, HD, R, W, Fields>;
  }

  disabled(initial = false): FormFieldTypedImpl<T, HD, R, W, Fields> {
    this._isDisabled = initial;
    return this;
  }

  // ─── Sync validation ───────────────────────────────────────────────────

  validate(v: SyncFieldValidator<T>): FormFieldTypedImpl<T, HD, R, W, Fields> {
    this._syncValidators.push(v as SyncFieldValidator);
    return this;
  }

  required(message?: string): FormFieldTypedImpl<T, HD, true, W, Fields> {
    this._required = { flag: true, message };
    return this as unknown as FormFieldTypedImpl<T, HD, true, W, Fields>;
  }

  custom(
    fn: (value: T, ctx: ValidatorCtx<Fields>) => ValidationResult,
  ): FormFieldTypedImpl<T, HD, R, W, Fields> {
    this._syncValidators.push(fn as SyncFieldValidator);
    return this;
  }

  warn(v: SyncFieldValidator<T>): FormFieldTypedImpl<T, HD, R, true, Fields> {
    this._warnValidators.push(v as SyncFieldValidator);
    return this as unknown as FormFieldTypedImpl<T, HD, R, true, Fields>;
  }

  // ─── Async validation ─────────────────────────────────────────────────

  validateAsync(
    fn: AsyncFieldValidator<T>,
    opts?: { debounce?: number; runOn?: ValidationMode },
  ): FormFieldTypedImpl<T, HD, R, W, Fields> {
    this._asyncValidators.push({
      fn: fn as AsyncFieldValidator,
      debounce: opts?.debounce,
      runOn: opts?.runOn,
    });
    return this;
  }

  // ─── Mode override ────────────────────────────────────────────────────

  validateOn(mode: ValidationMode): FormFieldTypedImpl<T, HD, R, W, Fields> {
    this._validateOn = mode;
    return this;
  }

  reValidateOn(mode: ReValidationMode): FormFieldTypedImpl<T, HD, R, W, Fields> {
    this._reValidateOn = mode;
    return this;
  }

  // ─── Dependencies ─────────────────────────────────────────────────────

  dependsOn(paths: string | string[]): FormFieldTypedImpl<T, HD, R, W, Fields> {
    const arr = Array.isArray(paths) ? paths : [paths];
    this._dependsOn.push(...arr);
    return this;
  }

  // ─── Transform ────────────────────────────────────────────────────────

  transform<DomValue>(t: {
    parse: (dom: DomValue) => T;
    format: (value: T) => DomValue;
  }): FormFieldTypedImpl<T, HD, R, W, Fields> {
    this._transform = t;
    return this;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────

  resetOn(events: string | string[]): FormFieldTypedImpl<T, HD, R, W, Fields> {
    const arr = Array.isArray(events) ? events : [events];
    this._resetOn.push(...arr);
    return this;
  }

  // ─── Descriptor ───────────────────────────────────────────────────────

  toDescriptor(): FormFieldDescriptor {
    return {
      kind: "field",
      defaultValue: this._defaultValue,
      hasDefault: this._hasDefault,
      isFactory: this._isFactory,
      isOptional: this._isOptional,
      isDisabled: this._isDisabled,
      syncValidators: this._syncValidators,
      required: this._required,
      warnValidators: this._warnValidators,
      asyncValidators: this._asyncValidators,
      validateOn: this._validateOn,
      reValidateOn: this._reValidateOn,
      dependsOn: this._dependsOn,
      transform: this._transform,
      resetOn: this._resetOn,
    };
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

export function createFormFieldBuilder<Fields = unknown>(): FormFieldBuilder<Fields> {
  return function formFieldBuilder<T>(): FormFieldTypedImpl<T, false, false, false, Fields> {
    return new FormFieldTypedImpl<T, false, false, false, Fields>();
  };
}
