import { registerChainOps } from "@kbml-tentacles/core";
import type {
  CrossValidatorDescriptor,
  FormArrayDescriptor,
  FormEntityDescriptor,
  FormFieldDescriptor,
  FormSubDescriptor,
} from "./form-contract-descriptors";
import {
  createFormFieldBuilder,
  type FormFieldBuilder,
  type FormFieldTypedImpl,
} from "./form-field-builder";
import type { CrossFieldValidator } from "./types/validator";

// ─── Phantom key ────────────────────────────────────────────────────────────

declare const _fcFields: unique symbol;

// ─── Reserved names ─────────────────────────────────────────────────────────

const RESERVED_NAMES = new Set([
  // Aggregate stores
  "$values",
  "$errors",
  "$errorPaths",
  "$isValid",
  "$isDirty",
  "$isTouched",
  "$isValidating",
  "$isSubmitting",
  "$isSubmitted",
  "$isSubmitSuccessful",
  "$submitCount",
  "$dirtyFields",
  "$touchedFields",
  "$validatingFields",
  "$formError",
  "$disabled",
  // Control events
  "submit",
  "reset",
  "resetTo",
  "setValues",
  "setValue",
  "setError",
  "setErrors",
  "clearErrors",
  "setFormError",
  "validate",
  "disable",
  // Lifecycle events
  "submitted",
  "rejected",
  "resetCompleted",
  // Metadata / row-specific
  "__path",
  "__debug",
  "kind",
  "key",
  "index",
  "arrayRef",
  "remove",
]);

// ─── Name validation ────────────────────────────────────────────────────────

function validateFieldName(name: string, existing: Set<string>): void {
  if (existing.has(name)) {
    throw new FormContractError(`field "${name}" is already declared`);
  }
  if (RESERVED_NAMES.has(name)) {
    throw new FormContractError(`"${name}" is a reserved FormShape key`);
  }
  if (name.includes(".") || name.includes(":")) {
    throw new FormContractError(`field name "${name}" must not contain '.' or ':'`);
  }
  if (name.length === 0) {
    throw new FormContractError("field name must not be empty");
  }
}

// ─── Error ──────────────────────────────────────────────────────────────────

export class FormContractError extends Error {
  constructor(message: string) {
    super(`[tentacles/forms]: ${message}`);
    this.name = "FormContractError";
  }
}

// ─── Type helpers ───────────────────────────────────────────────────────────

/** Compile-time guard: K must not already exist in Fields */
export type FreshFieldName<K extends string, Fields> = K extends keyof Fields ? never : K;

/** Extract Fields accumulator from a chain */
export type InferFieldsFromChain<C> = C extends { readonly [_fcFields]: infer F } ? F : never;

/** Extract values type from a FormContractChainImpl (scalar fields resolved to T) */
export type ExtractValues<C> = InferFieldsFromChain<C>;

// ─── Array options ──────────────────────────────────────────────────────────

export interface FormArrayOptions {
  min?: number | { value: number; message: string };
  max?: number | { value: number; message: string };
}

// ─── FormContractChainImpl ──────────────────────────────────────────────────

export class FormContractChainImpl<
  Fields extends Record<string, unknown> = {},
  CrossValidators extends unknown[] = [],
> {
  declare readonly [_fcFields]: Fields;

  private readonly _fieldDescriptors: Record<string, FormFieldDescriptor> = {};
  private readonly _subDescriptors: Record<string, FormSubDescriptor> = {};
  private readonly _arrayDescriptors: Record<string, FormArrayDescriptor> = {};
  private readonly _crossValidators: CrossValidatorDescriptor[] = [];
  private readonly _allNames = new Set<string>();

  constructor() {
    registerChainOps(this, {
      entityNames: () => this.entityNames(),
      createEmpty: () => new FormContractChainImpl(),

      copyEntities: (source, names) => {
        const src = source as FormContractChainImpl;
        for (const key of names) {
          const fd = src.getFieldDescriptors()[key];
          if (fd) {
            this._fieldDescriptors[key] = fd;
            this._allNames.add(key);
            continue;
          }
          const sd = src.getSubDescriptors()[key];
          if (sd) {
            this._subDescriptors[key] = sd;
            this._allNames.add(key);
            continue;
          }
          const ad = src.getArrayDescriptors()[key];
          if (ad) {
            this._arrayDescriptors[key] = ad;
            this._allNames.add(key);
          }
        }
        this._crossValidators.push(...src.getCrossValidators());
      },

      copyAll: (source) => {
        const src = source as FormContractChainImpl;
        for (const [k, v] of Object.entries(src.getFieldDescriptors())) {
          this._fieldDescriptors[k] = v;
          this._allNames.add(k);
        }
        for (const [k, v] of Object.entries(src.getSubDescriptors())) {
          this._subDescriptors[k] = v;
          this._allNames.add(k);
        }
        for (const [k, v] of Object.entries(src.getArrayDescriptors())) {
          this._arrayDescriptors[k] = v;
          this._allNames.add(k);
        }
        this._crossValidators.push(...src.getCrossValidators());
      },

      validateRefs: (dropDangling) => {
        for (const [key, desc] of Object.entries(this._fieldDescriptors)) {
          for (const dep of desc.dependsOn) {
            if (!this._allNames.has(dep)) {
              if (dropDangling) {
                const idx = desc.dependsOn.indexOf(dep);
                if (idx !== -1) desc.dependsOn.splice(idx, 1);
                continue;
              }
              throw new FormContractError(
                `Contract utility: field "${key}" dependsOn missing field "${dep}"`,
              );
            }
          }
        }
      },
    });
  }

  // ─── .field() ───────────────────────────────────────────────────────────

  field<
    K extends string,
    T,
    HD extends boolean = false,
    R extends boolean = false,
    W extends boolean = false,
  >(
    name: FreshFieldName<K, Fields>,
    builder: (f: FormFieldBuilder<Fields>) => FormFieldTypedImpl<T, HD, R, W, Fields>,
  ): FormContractChainImpl<Fields & Record<K, T>, CrossValidators> {
    validateFieldName(name as string, this._allNames);

    const f = createFormFieldBuilder<Fields>();
    const result = (builder as Function)(f);
    this._fieldDescriptors[name as string] = (
      result as { toDescriptor(): FormFieldDescriptor }
    ).toDescriptor();
    this._allNames.add(name as string);

    return this as unknown as FormContractChainImpl<Fields & Record<K, T>, CrossValidators>;
  }

  // ─── .sub() ─────────────────────────────────────────────────────────────

  sub<K extends string, C extends FormContractChainImpl<any, any>>(
    name: FreshFieldName<K, Fields>,
    contract: C | (() => C),
  ): FormContractChainImpl<Fields & Record<K, InferFieldsFromChain<C>>, CrossValidators> {
    validateFieldName(name as string, this._allNames);

    const isThunk = typeof contract === "function" && !(contract instanceof FormContractChainImpl);
    this._subDescriptors[name as string] = {
      kind: "sub",
      contract,
      isThunk,
    };
    this._allNames.add(name as string);

    return this as unknown as FormContractChainImpl<
      Fields & Record<K, InferFieldsFromChain<C>>,
      CrossValidators
    >;
  }

  // ─── .array() ───────────────────────────────────────────────────────────

  array<K extends string, C extends FormContractChainImpl<any, any>>(
    name: FreshFieldName<K, Fields>,
    contract: C | (() => C),
    opts?: FormArrayOptions,
  ): FormContractChainImpl<Fields & Record<K, InferFieldsFromChain<C>[]>, CrossValidators> {
    validateFieldName(name as string, this._allNames);

    const isThunk = typeof contract === "function" && !(contract instanceof FormContractChainImpl);
    this._arrayDescriptors[name as string] = {
      kind: "array",
      contract,
      isThunk,
      min: opts?.min ?? null,
      max: opts?.max ?? null,
    };
    this._allNames.add(name as string);

    return this as unknown as FormContractChainImpl<
      Fields & Record<K, InferFieldsFromChain<C>[]>,
      CrossValidators
    >;
  }

  // ─── .validate() (cross-field) ──────────────────────────────────────────

  validate(
    validator: CrossFieldValidator<Fields>,
  ): FormContractChainImpl<Fields, [...CrossValidators, CrossFieldValidator<Fields>]> {
    this._crossValidators.push({ validator: validator as CrossFieldValidator });
    return this as unknown as FormContractChainImpl<
      Fields,
      [...CrossValidators, CrossFieldValidator<Fields>]
    >;
  }

  // ─── .merge() ───────────────────────────────────────────────────────────

  merge<Other extends FormContractChainImpl<any, any>>(
    other: Other,
  ): FormContractChainImpl<Fields & InferFieldsFromChain<Other>, CrossValidators> {
    for (const name of other.entityNames()) {
      if (this._allNames.has(name)) {
        throw new FormContractError(
          `merge collision: "${name}" already exists in the target contract`,
        );
      }
    }

    // Copy descriptors
    for (const [k, v] of Object.entries(other.getFieldDescriptors())) {
      this._fieldDescriptors[k] = v;
      this._allNames.add(k);
    }
    for (const [k, v] of Object.entries(other.getSubDescriptors())) {
      this._subDescriptors[k] = v;
      this._allNames.add(k);
    }
    for (const [k, v] of Object.entries(other.getArrayDescriptors())) {
      this._arrayDescriptors[k] = v;
      this._allNames.add(k);
    }
    for (const cv of other.getCrossValidators()) {
      this._crossValidators.push(cv);
    }

    return this as unknown as FormContractChainImpl<
      Fields & InferFieldsFromChain<Other>,
      CrossValidators
    >;
  }

  // ─── Internal accessors (used by runtime) ───────────────────────────────

  getFieldDescriptors(): Record<string, FormFieldDescriptor> {
    return this._fieldDescriptors;
  }

  getSubDescriptors(): Record<string, FormSubDescriptor> {
    return this._subDescriptors;
  }

  getArrayDescriptors(): Record<string, FormArrayDescriptor> {
    return this._arrayDescriptors;
  }

  getCrossValidators(): CrossValidatorDescriptor[] {
    return this._crossValidators;
  }

  /** Check if name is a declared entity */
  hasEntity(name: string): boolean {
    return this._allNames.has(name);
  }

  /** All declared entity names */
  entityNames(): string[] {
    return [...this._allNames];
  }

  /** Get entity descriptor by name */
  getEntity(name: string): FormEntityDescriptor | undefined {
    return (
      this._fieldDescriptors[name] ?? this._subDescriptors[name] ?? this._arrayDescriptors[name]
    );
  }
}
