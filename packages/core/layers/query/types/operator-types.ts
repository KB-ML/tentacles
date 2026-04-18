import type { Store } from "effector";

export type Reactive<T> = T | Store<T>;

export interface Operator<T = unknown> {
  readonly name: string;
  readonly operand: Reactive<unknown>;
  readonly predicate: (value: T, resolvedOperand: unknown) => boolean;
  readonly isReactive: boolean;
  readonly $operand?: Store<unknown>;
}
