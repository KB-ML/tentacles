import type { Event, EventCallable, Store } from "effector";

// ─── Utility types ──────────────────────────────────────────────────────────

export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

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
