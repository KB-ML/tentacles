import type { EventCallable, Scope, Store } from "effector";
import type { DeepErrors, DeepPartial, FormFieldAccessors, FormShape } from "./form-shape";

type ModelInstanceId = string | number;

/**
 * Minimal model surface of a form array. Mirrors `ModelLike` from
 * `@kbml-tentacles/react` so `<Each model={form.array} />` and
 * `useModel(form.array)` type-check without casts.
 */
export interface FormArrayModelLike<Row extends Record<string, unknown>> {
  readonly name: string;
  readonly $ids: Store<ModelInstanceId[]>;
  readonly $idSet: Store<Set<ModelInstanceId>>;
  readonly $count: Store<number>;
  has(id: ModelInstanceId): Store<boolean>;
  has(...parts: [string | number, string | number, ...(string | number)[]]): Store<boolean>;
  getRefMeta(field: string): { cardinality: "one" | "many"; target: unknown } | undefined;
  get(
    idOrParts: ModelInstanceId | readonly (string | number)[],
    scope?: Scope,
  ): FormRowShape<Row> | null;
}

// ─── FormArrayShape ─────────────────────────────────────────────────────────

/**
 * A form array IS a model from `@kbml-tentacles/core` extended with
 * form-specific aggregates and operations. `form.items` is both a
 * `FormArrayShape` and a `Model` — all model APIs ($ids, get(),
 * query(), createFx, etc.) are available directly.
 */
export interface FormArrayShape<Row extends Record<string, unknown>>
  extends FormArrayModelLike<Row> {
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
  at(index: number): Store<FormRowShape<Row> | null>;

  // ─── Metadata ─────────────────────────────────────────────────────────
  readonly __path: readonly (string | number)[];
  readonly kind: "array";
}

// ─── FormRowShape ───────────────────────────────────────────────────────────

/**
 * Each row in a form array is a full `FormShape` plus row-specific metadata.
 * Rows ARE model instances whose `fn` returns this shape.
 */
export type FormRowShape<Row extends Record<string, unknown>> = FormShape<Row> &
  FormFieldAccessors<Row> & {
    readonly key: string | number;
    readonly index: Store<number>;
    readonly arrayRef: FormArrayShape<Row>;
    readonly remove: EventCallable<void>;
  };
