import type { Field } from "@kbml-tentacles/forms";
import { useUnit } from "effector-react";
import { useEffect, useRef } from "react";

export interface RegisterResult<E extends HTMLElement> {
  ref: React.RefObject<E | null>;
  defaultValue: string;
  onChange: (e: { target: { value: string } }) => void;
  onBlur: () => void;
}

export interface UseUncontrolledFieldResult<T> {
  error: string | null;
  warning: string | null;
  dirty: boolean;
  touched: boolean;
  validating: boolean;
  disabled: boolean;
  register: <E extends HTMLElement = HTMLInputElement>() => RegisterResult<E>;
}

export function useUncontrolledField<T>(field: Field<T>): UseUncontrolledFieldResult<T> {
  const bound = useUnit({
    initial: field.$initial,
    error: field.$error,
    warning: field.$warning,
    dirty: field.$dirty,
    touched: field.$touched,
    validating: field.$validating,
    disabled: field.$disabled,
    changed: field.changed,
    blurred: field.blurred,
  });

  const elRef = useRef<HTMLElement>(null);
  const transform = field.__transform;

  // Sync DOM when initial value changes (form reset)
  useEffect(() => {
    const el = elRef.current;
    if (el && "value" in el) {
      (el as HTMLInputElement).value = transform
        ? String(transform.format(bound.initial))
        : String(bound.initial ?? "");
    }
  }, [bound.initial, transform]);

  return {
    error: bound.error,
    warning: bound.warning,
    dirty: bound.dirty,
    touched: bound.touched,
    validating: bound.validating,
    disabled: bound.disabled,
    register: <E extends HTMLElement = HTMLInputElement>() => ({
      ref: elRef as React.RefObject<E | null>,
      defaultValue: transform
        ? String(transform.format(bound.initial))
        : String(bound.initial ?? ""),
      onChange: transform
        ? (e: { target: { value: string } }) => bound.changed(transform.parse(e.target.value) as T)
        : (e: { target: { value: string } }) => bound.changed(e.target.value as T),
      onBlur: bound.blurred,
    }),
  };
}
