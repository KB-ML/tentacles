import {
  combine,
  createEvent,
  createStore,
  type EventCallable,
  type Store,
  sample,
} from "effector";
import type { FormFieldDescriptor } from "../contract/form-contract-descriptors";
import type {
  CrossFieldValidator,
  SyncFieldValidator,
  ValidationIssue,
  ValidationResult,
  ValidatorCtx,
} from "../contract/types/validator";
import type { Field } from "../types/field";
import {
  DEFAULT_VALIDATION_CONFIG,
  isErrorVisible,
  shouldRunOnBlur,
  shouldRunOnChange,
  type ValidationConfig,
} from "./validation-modes";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FieldEntry {
  readonly path: string;
  readonly field: Field<unknown>;
  readonly descriptor: FormFieldDescriptor;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function runSyncValidators(
  validators: SyncFieldValidator[],
  value: unknown,
  ctx: ValidatorCtx,
  criteriaMode: "firstError" | "all",
): string | null {
  const errors: string[] = [];

  for (const v of validators) {
    let result: ValidationResult;
    if (typeof v === "function") {
      result = v(value, ctx);
    } else {
      result = v.validate(value, ctx);
    }

    if (result === null) continue;

    if (typeof result === "string") {
      if (criteriaMode === "firstError") return result;
      errors.push(result);
    } else if (Array.isArray(result)) {
      for (const item of result) {
        const msg = typeof item === "string" ? item : item.message;
        if (criteriaMode === "firstError") return msg;
        errors.push(msg);
      }
    }
  }

  return errors.length > 0 ? errors.join("; ") : null;
}

function runRequiredValidator(
  value: unknown,
  required: { flag: boolean; message?: string },
): string | null {
  if (!required.flag) return null;
  if (value === undefined || value === null || value === "") {
    return required.message ?? "Required";
  }
  return null;
}

// ─── ValidationRunner ───────────────────────────────────────────────────────

export class ValidationRunner {
  private readonly fields: FieldEntry[] = [];
  private readonly config: ValidationConfig;
  private readonly crossValidators: CrossFieldValidator[];
  private readonly $isSubmitted: Store<boolean>;

  /** Event to flip all fields' validation visibility to true */
  readonly showAllErrors: EventCallable<void>;

  /** Event to run validation for a specific field path */
  readonly validateField: EventCallable<string>;

  /** Event to run all validations */
  readonly validateAll: EventCallable<void>;

  constructor(config: {
    fields: FieldEntry[];
    validationConfig?: Partial<ValidationConfig>;
    crossValidators?: CrossFieldValidator[];
    $isSubmitted?: Store<boolean>;
  }) {
    this.fields = config.fields;
    this.config = { ...DEFAULT_VALIDATION_CONFIG, ...config.validationConfig };
    this.crossValidators = config.crossValidators ?? [];
    this.$isSubmitted = config.$isSubmitted ?? createStore(false);

    // O(F) index for O(1) dependency lookups (avoids O(F²) from Array.find)
    this._fieldsByPath = new Map(config.fields.map((e) => [e.path, e]));

    this.showAllErrors = createEvent<void>();
    this.validateField = createEvent<string>();
    this.validateAll = createEvent<void>();

    this.wireFields();
    this.wireValidateAll();
  }

  private readonly _fieldsByPath: Map<string, FieldEntry>;
  /** Per-field validation triggers, collected during wireField for dependency wiring */
  private readonly _validationTriggers = new Map<string, EventCallable<void>>();

  private wireFields() {
    // Pass 1: wire each field, collect _runValidation events
    for (const entry of this.fields) {
      this.wireField(entry);
    }
    // Pass 2: wire dependencies via inverted graph (D_unique samples instead of E)
    this.wireDependencies();
  }

  private wireField(entry: FieldEntry) {
    const { field, descriptor } = entry;
    const effectiveMode = descriptor.validateOn ?? this.config.mode;
    const effectiveReValidate = descriptor.reValidateOn ?? this.config.reValidate;

    // Hidden error store: holds the actual validation result
    const $hiddenError = createStore<string | null>(null, { skipVoid: false });

    // Visibility flag: controls when $error is exposed to the user
    const $visible = createStore<boolean>(isErrorVisible(effectiveMode, false, false));

    // Show errors on submit
    $visible.on(this.showAllErrors, () => true);

    // Show errors based on mode
    if (effectiveMode === "touched" || effectiveMode === "blur") {
      $visible.on(field.blurred, () => true);
    }
    if (effectiveMode === "change" || effectiveMode === "all") {
      // Already visible from start
      $visible.on(field.changed, () => true);
    }

    // Wire visible error → field.$error
    // The field's actual $error is driven by the combination of hidden + visible
    const $visibleError = combine($hiddenError, $visible, (err, vis) => (vis ? err : null));

    // Forward visible error to the field's $error store
    sample({
      clock: $visibleError,
      target: field.setError,
    });

    // ─── Validation execution (synchronous via event + source) ────────

    const setHiddenError = createEvent<string | null>();
    $hiddenError.on(setHiddenError, (_, e) => e);

    // Trigger event — when this fires, we read $value and run validators
    const _runValidation = createEvent<void>();
    this._validationTriggers.set(entry.path, _runValidation);

    if (descriptor.dependsOn.length > 0) {
      // Combine dependency field values for ctx.values
      const depStores: Record<string, Store<unknown>> = {};
      for (const depPath of descriptor.dependsOn) {
        const depEntry = this._fieldsByPath.get(depPath);
        if (depEntry) {
          depStores[depPath] = depEntry.field.$value;
        }
      }

      sample({
        clock: _runValidation,
        source: { value: field.$value, deps: combine(depStores) },
        fn: ({ value, deps }: { value: unknown; deps: Record<string, unknown> }) => {
          const ctx: ValidatorCtx = {
            values: deps,
            rootValues: {},
            path: [...field.__path],
            signal: new AbortController().signal,
          };

          const reqError = runRequiredValidator(value, descriptor.required);
          if (reqError) return reqError;

          return runSyncValidators(descriptor.syncValidators, value, ctx, this.config.criteriaMode);
        },
        target: setHiddenError,
      });
    } else {
      sample({
        clock: _runValidation,
        source: field.$value,
        fn: (value: unknown) => {
          const ctx: ValidatorCtx = {
            values: {},
            rootValues: {},
            path: [...field.__path],
            signal: new AbortController().signal,
          };

          const reqError = runRequiredValidator(value, descriptor.required);
          if (reqError) return reqError;

          return runSyncValidators(descriptor.syncValidators, value, ctx, this.config.criteriaMode);
        },
        target: setHiddenError,
      });
    }

    // ─── Trigger wiring ─────────────────────────────────────────────

    // On change: validate if mode requires it
    sample({
      clock: field.changed,
      source: $hiddenError,
      filter: (hiddenError) =>
        shouldRunOnChange(effectiveMode, effectiveReValidate, hiddenError !== null),
      target: _runValidation,
    });

    // On blur: validate if mode requires it
    sample({
      clock: field.blurred,
      source: $hiddenError,
      filter: (hiddenError) =>
        shouldRunOnBlur(effectiveMode, effectiveReValidate, hiddenError !== null),
      target: _runValidation,
    });

    // On explicit validateField event
    sample({
      clock: this.validateField,
      filter: (path) => path === entry.path,
      target: _runValidation,
    });

    // On validateAll
    sample({
      clock: this.validateAll,
      target: _runValidation,
    });

    // On field.validate
    sample({
      clock: field.validate,
      target: _runValidation,
    });

    // Clear hidden error on reset
    sample({
      clock: field.reset,
      fn: () => null,
      target: setHiddenError,
    });

    // DependsOn wiring is deferred to wireDependencies() for inverted graph optimization
  }

  /**
   * Wire dependencies via inverted graph.
   * Instead of E sample nodes (one per dependency edge), creates D_unique nodes
   * (one per depended-upon field), each fanning out to all dependents.
   *
   * Example: if fields A, B, C all depend on "password":
   *   Current:  3 sample nodes (password.changed → A, B, C)
   *   Inverted: 1 sample node  (password.changed → [A, B, C])
   */
  private wireDependencies() {
    // Build inverted graph: depPath → Set<dependent field paths>
    const invertedDeps = new Map<string, Set<string>>();

    for (const entry of this.fields) {
      for (const depPath of entry.descriptor.dependsOn) {
        let dependents = invertedDeps.get(depPath);
        if (!dependents) {
          dependents = new Set();
          invertedDeps.set(depPath, dependents);
        }
        dependents.add(entry.path);
      }
    }

    // Wire one sample per unique dep field → triggers all dependent validations
    for (const [depPath, dependentPaths] of invertedDeps) {
      const depEntry = this._fieldsByPath.get(depPath);
      if (!depEntry) continue;

      const targets = [...dependentPaths]
        .map((p) => this._validationTriggers.get(p))
        .filter(Boolean) as EventCallable<void>[];

      if (targets.length === 0) continue;

      // Single sample node fans out to all dependent fields
      if (targets.length === 1) {
        sample({ clock: depEntry.field.changed, target: targets[0]! });
      } else {
        // Fan out: one clock → multiple targets
        for (const target of targets) {
          sample({ clock: depEntry.field.changed, target });
        }
      }
    }
  }

  private wireValidateAll() {
    // validateAll triggers every field
    // Already wired per-field above via sample({ clock: this.validateAll })
  }

  /**
   * Collect all field entries managed by this runner.
   * Used by the submit orchestrator to know what to validate.
   */
  getFields(): FieldEntry[] {
    return this.fields;
  }
}
