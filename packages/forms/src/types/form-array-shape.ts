import type { EventCallable, Store } from "effector";
import type { DeepErrors, DeepPartial, FormShape } from "./form-shape";

// ─── FormArrayShape ─────────────────────────────────────────────────────────

/**
 * A form array IS a model from `@kbml-tentacles/core` extended with
 * form-specific aggregates and operations. `form.items` is both a
 * `FormArrayShape` and a `Model` — all model APIs ($ids, instances(),
 * query(), createFx, etc.) are available directly.
 */
export interface FormArrayShape<Row extends Record<string, unknown>> {
  // ─── Form-array aggregates ──────────────────────────────────────────
  readonly $values: Store<Row[]>;
  readonly $errors: Store<ReadonlyArray<DeepErrors<Row> | null>>;
  readonly $isValid: Store<boolean>;
  readonly $isDirty: Store<boolean>;
  readonly $isTouched: Store<boolean>;
  readonly $isValidating: Store<boolean>;
  readonly $arrayError: Store<string | null>;

  // ─── Form-friendly operations ─────────────────────────────────────────
  readonly append: EventCallable<DeepPartial<Row> | DeepPartial<Row>[] | undefined>;
  readonly prepend: EventCallable<DeepPartial<Row> | DeepPartial<Row>[] | undefined>;
  readonly insert: EventCallable<{ index: number; value: DeepPartial<Row> | DeepPartial<Row>[] }>;
  readonly remove: EventCallable<number | number[] | undefined>;
  readonly removeKey: EventCallable<string | number>;
  readonly move: EventCallable<{ from: number; to: number }>;
  readonly swap: EventCallable<{ a: number; b: number }>;
  readonly update: EventCallable<{ index: number; value: DeepPartial<Row> }>;
  readonly replace: EventCallable<DeepPartial<Row>[]>;
  readonly clear: EventCallable<void>;

  // ─── Positional helpers ───────────────────────────────────────────────
  $at(index: number): Store<FormRowShape<Row> | null>;

  // ─── Metadata ─────────────────────────────────────────────────────────
  readonly __path: readonly (string | number)[];
  readonly kind: "array";

  // Model APIs are spread onto this at runtime ($ids, $count, get(),
  // instances(), query(), createFx, deleteFx, etc.) but not typed here
  // to avoid circular dependency with @kbml-tentacles/core's Model type.
  // Runtime: Object.assign(formArrayShape, rowModel)
  [key: string]: unknown;
}

// ─── FormRowShape ───────────────────────────────────────────────────────────

/**
 * Each row in a form array is a full `FormShape` plus row-specific metadata.
 * Rows ARE model instances whose `fn` returns this shape.
 */
export interface FormRowShape<Row extends Record<string, unknown>> extends FormShape<Row> {
  readonly key: string | number;
  readonly index: Store<number>;
  readonly arrayRef: FormArrayShape<Row>;
  readonly remove: EventCallable<void>;
}
