import type { DeepErrors, DeepPartial, FormArrayShape } from "@kbml-tentacles/forms";
import { useUnit } from "effector-vue/composition";
import type { DeepReadonly, Ref } from "vue";

export interface UseFieldArrayResult<Row> {
  values: Ref<Row[]>;
  errors: Ref<ReadonlyArray<DeepErrors<Row> | null>>;
  isValid: Ref<boolean>;
  isDirty: Ref<boolean>;
  isTouched: Ref<boolean>;
  arrayError: Ref<string | null>;
  append: (value?: DeepPartial<Row> | DeepPartial<Row>[]) => void;
  prepend: (value?: DeepPartial<Row> | DeepPartial<Row>[]) => void;
  insert: (payload: { index: number; value: DeepPartial<Row> | DeepPartial<Row>[] }) => void;
  remove: (index?: number | number[]) => void;
  move: (payload: { from: number; to: number }) => void;
  swap: (payload: { a: number; b: number }) => void;
  replace: (values: DeepPartial<Row>[]) => void;
  clear: () => void;
}

/** Strips Vue's DeepReadonly wrapper from a Ref for public API ergonomics. */
type MutableRef<T> = Ref<T> & { readonly value: T };

function toMutableRef<T>(ref: Readonly<Ref<DeepReadonly<T>>>): MutableRef<T> {
  return ref as MutableRef<DeepReadonly<T>> as MutableRef<T>;
}

export function useFieldArray<Row extends Record<string, unknown>>(
  array: FormArrayShape<Row>,
): UseFieldArrayResult<Row> {
  const bound = useUnit({
    values: array.$values,
    errors: array.$errors,
    isValid: array.$isValid,
    isDirty: array.$isDirty,
    isTouched: array.$isTouched,
    arrayError: array.$arrayError,
    append: array.append,
    prepend: array.prepend,
    insert: array.insert,
    remove: array.remove,
    move: array.move,
    swap: array.swap,
    replace: array.replace,
    clear: array.clear,
  });

  return {
    values: toMutableRef<Row[]>(bound.values),
    errors: toMutableRef<ReadonlyArray<DeepErrors<Row> | null>>(bound.errors),
    isValid: bound.isValid as Ref<boolean>,
    isDirty: bound.isDirty as Ref<boolean>,
    isTouched: bound.isTouched as Ref<boolean>,
    arrayError: bound.arrayError as Ref<string | null>,
    append: bound.append as (value?: DeepPartial<Row> | DeepPartial<Row>[]) => void,
    prepend: bound.prepend as (value?: DeepPartial<Row> | DeepPartial<Row>[]) => void,
    insert: bound.insert as (payload: {
      index: number;
      value: DeepPartial<Row> | DeepPartial<Row>[];
    }) => void,
    remove: bound.remove as (index?: number | number[]) => void,
    move: bound.move as (payload: { from: number; to: number }) => void,
    swap: bound.swap as (payload: { a: number; b: number }) => void,
    replace: bound.replace as (values: DeepPartial<Row>[]) => void,
    clear: bound.clear as () => void,
  };
}
