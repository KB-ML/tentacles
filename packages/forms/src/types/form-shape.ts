import type { Event, EventCallable, Store } from "effector";
import type { Field } from "./field";
import type { FormArrayShape, FormRowShape } from "./form-array-shape";

// ─── Utility types ──────────────────────────────────────────────────────────

export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/**
 * Map a contract field value type to its runtime accessor shape.
 * - array of records → FormArrayShape<Row>
 * - record of fields → FormShape<Values>
 * - primitive / other → Field<V>
 *
 * Scalar leaves return `Field<V>` directly (no conditional wrapper) so
 * consumers like `useField(fields: Field<any>[])` pick the tuple overload.
 */
export type FormFieldAccessor<V> = [V] extends [readonly (infer E)[]]
  ? [E] extends [Record<string, unknown>]
    ? FormArrayShape<E>
    : Field<V>
  : [V] extends [Record<string, unknown>]
    ? FormShape<V>
    : Field<V>;

/** Apply the accessor map to every key in a Values record. */
export type FormFieldAccessors<Values extends Record<string, unknown>> = {
  [K in keyof Values]: FormFieldAccessor<Values[K]>;
};

export type DeepErrors<T> = T extends (infer U)[]
  ? (DeepErrors<U> | null)[]
  : T extends object
    ? { [K in keyof T]?: DeepErrors<T[K]> | string | null }
    : string | null;

// ─── Payloads ───────────────────────────────────────────────────────────────

export interface SetValuePayload {
  path: string | (string | number)[];
  value: unknown;
  shouldValidate?: boolean;
  shouldDirty?: boolean;
  shouldTouch?: boolean;
}

export interface SetErrorPayload {
  path: string | (string | number)[];
  error: string | null;
}

export interface KeepStateOptions {
  keepDirty?: boolean;
  keepErrors?: boolean;
  keepValues?: boolean;
  keepDefaultValues?: boolean;
  keepSubmitCount?: boolean;
  keepTouched?: boolean;
  keepIsSubmitted?: boolean;
  keepIsSubmitSuccessful?: boolean;
  keepDirtyValues?: boolean;
}

export type ResetPayload<V> = {
  values?: DeepPartial<V>;
} & KeepStateOptions;

// ─── FormShape ──────────────────────────────────────────────────────────────

/**
 * The universal form shape. Every level of a form — root, sub-form,
 * array row — exposes this interface. Children are accessed via property
 * access on the proxy (not included in this interface since they're dynamic).
 */
export interface FormShape<Values extends Record<string, unknown>> {
  // ─── Aggregate reactive state ─────────────────────────────────────────
  readonly $values: Store<Values>;
  readonly $errors: Store<DeepErrors<Values>>;
  readonly $errorPaths: Store<ReadonlyMap<string, string>>;
  readonly $isValid: Store<boolean>;
  readonly $isDirty: Store<boolean>;
  readonly $isTouched: Store<boolean>;
  readonly $isValidating: Store<boolean>;
  readonly $isSubmitting: Store<boolean>;
  readonly $isSubmitted: Store<boolean>;
  readonly $isSubmitSuccessful: Store<boolean>;
  readonly $submitCount: Store<number>;
  readonly $dirtyFields: Store<ReadonlySet<string>>;
  readonly $touchedFields: Store<ReadonlySet<string>>;
  readonly $validatingFields: Store<ReadonlySet<string>>;
  readonly $formError: Store<string | null>;
  readonly $disabled: Store<boolean>;

  // ─── Control events ───────────────────────────────────────────────────
  readonly submit: EventCallable<void>;
  readonly reset: EventCallable<void | null | ResetPayload<Values>>;
  readonly resetTo: EventCallable<DeepPartial<Values> | null | undefined>;
  readonly setValues: EventCallable<DeepPartial<Values>>;
  readonly setValue: EventCallable<SetValuePayload>;
  readonly setError: EventCallable<SetErrorPayload>;
  readonly setErrors: EventCallable<Record<string, string>>;
  readonly clearErrors: EventCallable<void | string | string[]>;
  readonly setFormError: EventCallable<string | null>;
  readonly validate: EventCallable<void | string | string[]>;
  readonly disable: EventCallable<boolean>;

  // ─── Lifecycle events ─────────────────────────────────────────────────
  readonly submitted: Event<Values>;
  readonly rejected: Event<DeepErrors<Values>>;
  readonly resetCompleted: Event<Values>;

  // ─── Metadata ─────────────────────────────────────────────────────────
  readonly __path: readonly (string | number)[];
  readonly kind: "form";
}
