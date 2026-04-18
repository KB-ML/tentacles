import { is, type Store } from "effector";
import type { Operator, Reactive } from "./types";

function createOperator<T>(
  name: string,
  operand: Reactive<unknown>,
  predicate: (value: T, resolved: unknown) => boolean,
): Operator<T> {
  const reactive = is.store(operand);
  return {
    name,
    operand,
    predicate,
    isReactive: reactive,
    $operand: reactive ? (operand as Store<unknown>) : undefined,
  };
}

// ═══ Comparison (number) ═══

export function gt(value: Reactive<number>): Operator<number> {
  return createOperator("gt", value, (v, r) => v > (r as number));
}

export function lt(value: Reactive<number>): Operator<number> {
  return createOperator("lt", value, (v, r) => v < (r as number));
}

export function gte(value: Reactive<number>): Operator<number> {
  return createOperator("gte", value, (v, r) => v >= (r as number));
}

export function lte(value: Reactive<number>): Operator<number> {
  return createOperator("lte", value, (v, r) => v <= (r as number));
}

// ═══ Equality (any) ═══

export function eq<T>(value: Reactive<T>): Operator<T> {
  return createOperator("eq", value, (v, r) => v === r);
}

export function neq<T>(value: Reactive<T>): Operator<T> {
  return createOperator("neq", value, (v, r) => v !== r);
}

// ═══ Collection ═══

export function oneOf<T>(values: Reactive<T[]>): Operator<T> {
  return createOperator("oneOf", values, (v, r) => (r as T[]).includes(v));
}

export function contains<T>(value: Reactive<T>): Operator<T[]> {
  return createOperator("contains", value, (v, r) => v.includes(r as T));
}

// ═══ String ═══

export function includes(substring: Reactive<string>): Operator<string> {
  return createOperator("includes", substring, (v, r) =>
    v.toLowerCase().includes((r as string).toLowerCase()),
  );
}

export function startsWith(prefix: Reactive<string>): Operator<string> {
  return createOperator("startsWith", prefix, (v, r) =>
    v.toLowerCase().startsWith((r as string).toLowerCase()),
  );
}

export function endsWith(suffix: Reactive<string>): Operator<string> {
  return createOperator("endsWith", suffix, (v, r) =>
    v.toLowerCase().endsWith((r as string).toLowerCase()),
  );
}

// ═══ Custom predicate ═══

export function matches<T>(fn: (v: T) => boolean): Operator<T> {
  return createOperator("matches", fn, (v, r) => (r as (v: T) => boolean)(v));
}
