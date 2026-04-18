import { ContractFieldKind } from "./enums";

/**
 * Create a callable event field builder.
 *
 * Invoked as `e<T>()` to produce a typed event descriptor. The returned value
 * is a function — no `.type<T>()` method.
 */
export function createEventFieldBuilder(): () => { kind: ContractFieldKind.Event } {
  return function eventFieldBuilder() {
    return { kind: ContractFieldKind.Event };
  };
}
