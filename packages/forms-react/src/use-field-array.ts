import type { DeepErrors, DeepPartial, FormArrayShape } from "@kbml-tentacles/forms";
import { useUnit } from "effector-react";

export interface UseFieldArrayResult<Row> {
  values: Row[];
  errors: ReadonlyArray<DeepErrors<Row> | null>;
  isValid: boolean;
  isDirty: boolean;
  isTouched: boolean;
  arrayError: string | null;
  append: (value?: DeepPartial<Row> | DeepPartial<Row>[]) => void;
  prepend: (value?: DeepPartial<Row> | DeepPartial<Row>[]) => void;
  insert: (payload: { index: number; value: DeepPartial<Row> | DeepPartial<Row>[] }) => void;
  remove: (index?: number | number[]) => void;
  move: (payload: { from: number; to: number }) => void;
  swap: (payload: { a: number; b: number }) => void;
  replace: (values: DeepPartial<Row>[]) => void;
  clear: () => void;
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
    values: bound.values,
    errors: bound.errors,
    isValid: bound.isValid,
    isDirty: bound.isDirty,
    isTouched: bound.isTouched,
    arrayError: bound.arrayError,
    append: bound.append,
    prepend: bound.prepend,
    insert: bound.insert,
    remove: bound.remove,
    move: bound.move,
    swap: bound.swap,
    replace: bound.replace,
    clear: bound.clear,
  };
}
