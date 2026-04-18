import type { Field } from "@kbml-tentacles/forms";
import type { EventCallable, Store } from "effector";
import { useUnit } from "effector-vue/composition";
import { computed, type Ref } from "vue";

type AnyUnit = Store<any> | EventCallable<any>;

export interface UseFieldResult<T> {
  value: Ref<T>;
  error: Ref<string | null>;
  warning: Ref<string | null>;
  dirty: Ref<boolean>;
  touched: Ref<boolean>;
  validating: Ref<boolean>;
  disabled: Ref<boolean>;
  changed: (value: T) => void;
  blurred: () => void;
  model: {
    modelValue: Ref<T>;
    "onUpdate:modelValue": (value: T) => void;
  };
  register: () => {
    value: Ref<unknown>;
    onInput: (e: Event) => void;
    onBlur: () => void;
  };
}

type MapControlled<F extends readonly Field<any>[]> = {
  [K in keyof F]: F[K] extends Field<infer T> ? UseFieldResult<T> : never;
};

// ─── Overloads ─────────────────────────────────────────────────────────────

export function useField<T>(field: Field<T>): UseFieldResult<T>;

export function useField<F extends readonly Field<any>[]>(
  fields: readonly [...F],
): MapControlled<F>;

export function useField<F extends readonly Field<any>[]>(
  fields: readonly [...F],
  _uncontrolled: true,
): MapControlled<F>;

// ─── Implementation ────────────────────────────────────────────────────────

export function useField(input: Field<any> | readonly Field<any>[], _uncontrolled?: true): unknown {
  const isSingle = !Array.isArray(input);
  const fields: readonly Field<any>[] = isSingle ? [input as Field<any>] : input;

  // Build single useUnit shape for all fields
  const shape: Record<string, AnyUnit> = {};
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]!;
    shape[`${i}$v`] = f.$value;
    shape[`${i}$e`] = f.$error;
    shape[`${i}$w`] = f.$warning;
    shape[`${i}$d`] = f.$dirty;
    shape[`${i}$t`] = f.$touched;
    shape[`${i}$vl`] = f.$validating;
    shape[`${i}$di`] = f.$disabled;
    shape[`${i}_c`] = f.changed;
    shape[`${i}_b`] = f.blurred;
  }

  const bound = useUnit(shape) as Record<string, unknown>;

  // Build results
  const results = fields.map((f, i) => {
    const value = bound[`${i}$v`] as Ref<unknown>;
    const changed = bound[`${i}_c`] as Function;
    const blurred = bound[`${i}_b`] as Function;
    const transform = f.__transform;

    const changedFn = (v: unknown): void => {
      changed(v);
    };
    const blurredFn = (): void => {
      blurred();
    };

    const formattedValue = computed((): unknown => {
      const raw: unknown = value.value;
      return transform ? transform.format(raw) : raw;
    });

    const onInput = (e: Event): void => {
      const raw = (e.target as HTMLInputElement).value;
      changedFn(transform ? transform.parse(raw) : raw);
    };

    return {
      value,
      error: bound[`${i}$e`] as Ref<string | null>,
      warning: bound[`${i}$w`] as Ref<string | null>,
      dirty: bound[`${i}$d`] as Ref<boolean>,
      touched: bound[`${i}$t`] as Ref<boolean>,
      validating: bound[`${i}$vl`] as Ref<boolean>,
      disabled: bound[`${i}$di`] as Ref<boolean>,
      changed: changedFn,
      blurred: blurredFn,
      model: {
        modelValue: value,
        "onUpdate:modelValue": changedFn,
      },
      register: () => ({
        value: formattedValue,
        onInput,
        onBlur: blurredFn,
      }),
    };
  });

  return isSingle ? results[0] : results;
}
