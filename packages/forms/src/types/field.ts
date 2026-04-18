import type { EventCallable, Store } from "effector";

/**
 * The universal field shape. Every leaf field in a form — top-level,
 * nested sub-form, or array row — exposes this exact interface.
 */
export interface Field<T> {
  // ─── Reactive state ─────────────────────────────────────────────────────
  readonly $value: Store<T>;
  readonly $default: Store<T>;
  readonly $initial: Store<T>;
  readonly $error: Store<string | null>;
  readonly $warning: Store<string | null>;
  readonly $dirty: Store<boolean>;
  readonly $touched: Store<boolean>;
  readonly $validating: Store<boolean>;
  readonly $disabled: Store<boolean>;

  // ─── User actions (wired to DOM) ────────────────────────────────────────
  readonly changed: EventCallable<T>;
  readonly blurred: EventCallable<void>;

  // ─── Imperative control ─────────────────────────────────────────────────
  readonly setValue: EventCallable<SetFieldValuePayload<T>>;
  readonly setError: EventCallable<string | null>;
  readonly setWarning: EventCallable<string | null>;
  readonly reset: EventCallable<void>;
  readonly resetTo: EventCallable<T>;
  readonly validate: EventCallable<void>;

  // ─── Metadata ───────────────────────────────────────────────────────────
  readonly __path: readonly (string | number)[];
  readonly __transform?: { parse: (domValue: unknown) => T; format: (value: T) => unknown };
  readonly kind: "field";
}

export interface SetFieldValuePayload<T> {
  value: T;
  shouldValidate?: boolean;
  shouldDirty?: boolean;
  shouldTouch?: boolean;
}
