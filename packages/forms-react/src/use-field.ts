import type { Field } from "@kbml-tentacles/forms";
import type { EventCallable, Store } from "effector";
import { useUnit } from "effector-react";
import { useEffect, useRef } from "react";

// biome-ignore lint/suspicious/noExplicitAny: matches effector's useUnit signature — EventCallable is contravariant
type AnyUnit = Store<any> | EventCallable<any>;

// ─── Result types ──────────────────────────────────────────────────────────

export interface UseFieldResult<T> {
  value: T;
  error: string | null;
  warning: string | null;
  dirty: boolean;
  touched: boolean;
  validating: boolean;
  disabled: boolean;
  changed: (value: T) => void;
  blurred: () => void;
  register: () => {
    value: string;
    onChange: (e: { target: { value: string } }) => void;
    onBlur: () => void;
  };
}

export interface UseFieldUncontrolledResult<T> {
  error: string | null;
  changed: (value: T) => void;
  blurred: () => void;
  register: <E extends HTMLElement = HTMLInputElement>() => {
    ref: React.RefObject<E | null>;
    defaultValue: string;
    onChange: (e: { target: { value: string } }) => void;
    onBlur: () => void;
  };
}

// biome-ignore lint/suspicious/noExplicitAny: Field<T> is contravariant on T via EventCallable
type MapControlled<F extends readonly Field<any>[]> = {
  [K in keyof F]: F[K] extends Field<infer T> ? UseFieldResult<T> : never;
};

// biome-ignore lint/suspicious/noExplicitAny: Field<T> is contravariant on T via EventCallable
type MapUncontrolled<F extends readonly Field<any>[]> = {
  [K in keyof F]: F[K] extends Field<infer T> ? UseFieldUncontrolledResult<T> : never;
};

// ─── Overloads ─────────────────────────────────────────────────────────────

export function useField<T>(field: Field<T>): UseFieldResult<T>;

// biome-ignore lint/suspicious/noExplicitAny: Field<T> is contravariant
export function useField<F extends readonly Field<any>[]>(
  fields: readonly [...F],
): MapControlled<F>;

// biome-ignore lint/suspicious/noExplicitAny: Field<T> is contravariant
export function useField<F extends readonly Field<any>[]>(
  fields: readonly [...F],
  uncontrolled: true,
): MapUncontrolled<F>;

// ─── Implementation ────────────────────────────────────────────────────────

export function useField(
  // biome-ignore lint/suspicious/noExplicitAny: Field<T> is contravariant
  input: Field<any> | readonly Field<any>[],
  uncontrolled?: true,
): unknown {
  const isSingle = !Array.isArray(input);
  // biome-ignore lint/suspicious/noExplicitAny: Field<T> is contravariant
  const fields: readonly Field<any>[] = isSingle ? [input] : input;

  // Build single useUnit shape for all fields
  const shape: Record<string, AnyUnit> = {};
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i] as Field<any>;
    if (uncontrolled) {
      shape[`${i}$i`] = f.$initial;
      shape[`${i}$e`] = f.$error;
      shape[`${i}_c`] = f.changed;
      shape[`${i}_b`] = f.blurred;
    } else {
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
  }

  const bound = useUnit(shape) as Record<string, unknown>;

  // Ref management for uncontrolled fields (always called for hooks stability)
  const refsMap = useRef<Record<number, { current: HTMLElement | null }>>({});
  const prevInitials = useRef<Record<number, unknown>>({});
  for (let i = 0; i < fields.length; i++) {
    if (!refsMap.current[i]) refsMap.current[i] = { current: null };
  }

  // Sync DOM when $initial changes (reset/resetTo).
  // Reads $initial via useUnit (scope-aware). Only touches DOM when
  // $initial actually changed — not on every parent re-render.
  useEffect(() => {
    if (!uncontrolled) return;
    for (let i = 0; i < fields.length; i++) {
      const initial = bound[`${i}$i`];
      if (prevInitials.current[i] === initial) continue;
      prevInitials.current[i] = initial;

      const ref = refsMap.current[i];
      const el = ref?.current;
      if (el && "value" in el) {
        const transform = fields[i]!.__transform;
        const formatted = transform ? String(transform.format(initial)) : String(initial ?? "");
        if ((el as HTMLInputElement).value !== formatted) {
          (el as HTMLInputElement).value = formatted;
        }
      }
    }
  });

  // Build results
  const results = fields.map((f, i) => {
    const changed = bound[`${i}_c`] as Function;
    const blurred = bound[`${i}_b`] as Function;
    const transform = f.__transform;

    if (uncontrolled) {
      const ref = refsMap.current[i] ?? { current: null };
      const initial = bound[`${i}$i`];
      return {
        error: bound[`${i}$e`] as string | null,
        changed: changed as (v: unknown) => void,
        blurred: blurred as () => void,
        register: <E extends HTMLElement = HTMLInputElement>() => ({
          ref: ref as React.RefObject<E | null>,
          defaultValue: transform ? String(transform.format(initial)) : String(initial ?? ""),
          onChange: transform
            ? (e: { target: { value: string } }) => changed(transform.parse(e.target.value))
            : (e: { target: { value: string } }) => changed(e.target.value),
          onBlur: blurred as () => void,
        }),
      };
    }

    const value = bound[`${i}$v`];
    return {
      value,
      error: bound[`${i}$e`] as string | null,
      warning: bound[`${i}$w`] as string | null,
      dirty: bound[`${i}$d`] as boolean,
      touched: bound[`${i}$t`] as boolean,
      validating: bound[`${i}$vl`] as boolean,
      disabled: bound[`${i}$di`] as boolean,
      changed: changed as (v: unknown) => void,
      blurred: blurred as () => void,
      register: () => ({
        value: transform ? String(transform.format(value)) : String(value ?? ""),
        onChange: transform
          ? (e: { target: { value: string } }) => changed(transform.parse(e.target.value))
          : (e: { target: { value: string } }) => changed(e.target.value),
        onBlur: blurred as () => void,
      }),
    };
  });

  return isSingle ? results[0] : results;
}
