import type { Field } from "@kbml-tentacles/forms";
import type { EventCallable, Store } from "effector";
import { useUnit } from "effector-solid";
import type { Accessor } from "solid-js";

type AnyUnit = Store<any> | EventCallable<any>;

export interface UseFieldResult<T> {
  value: Accessor<T>;
  error: Accessor<string | null>;
  warning: Accessor<string | null>;
  dirty: Accessor<boolean>;
  touched: Accessor<boolean>;
  validating: Accessor<boolean>;
  disabled: Accessor<boolean>;
  changed: (value: T) => void;
  blurred: () => void;
  register: () => {
    readonly value: unknown;
    onInput: (e: InputEvent & { currentTarget: HTMLInputElement }) => void;
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
    const value = bound[`${i}$v`] as Accessor<unknown>;
    const changed = bound[`${i}_c`] as Function;
    const blurred = bound[`${i}_b`] as Function;
    const transform = f.__transform;

    const changedFn = (v: unknown): void => {
      changed(v);
    };
    const blurredFn = (): void => {
      blurred();
    };

    const registerResult: ReturnType<UseFieldResult<unknown>["register"]> = {
      get value() {
        const v = value();
        return transform ? transform.format(v) : v;
      },
      onInput(e: InputEvent & { currentTarget: HTMLInputElement }) {
        const raw = e.currentTarget.value;
        changedFn(transform ? transform.parse(raw) : raw);
      },
      onBlur: blurredFn,
    };

    return {
      value,
      error: bound[`${i}$e`] as Accessor<string | null>,
      warning: bound[`${i}$w`] as Accessor<string | null>,
      dirty: bound[`${i}$d`] as Accessor<boolean>,
      touched: bound[`${i}$t`] as Accessor<boolean>,
      validating: bound[`${i}$vl`] as Accessor<boolean>,
      disabled: bound[`${i}$di`] as Accessor<boolean>,
      changed: changedFn,
      blurred: blurredFn,
      register: () => registerResult,
    };
  });

  return isSingle ? results[0] : results;
}
