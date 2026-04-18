import type { EventCallable, Store } from "effector";
import type {
  AnyPropMeta,
  PropEventMeta,
  PropKindSymbol,
  PropStoreMeta,
} from "../../contract/types/props-contract-chain";

// ─── Key filters ───

type StoreProps<Props extends Record<string, AnyPropMeta>> = {
  [K in keyof Props]: Props[K][PropKindSymbol] extends "store" ? K : never;
}[keyof Props];

type EventProps<Props extends Record<string, AnyPropMeta>> = {
  [K in keyof Props]: Props[K][PropKindSymbol] extends "event" ? K : never;
}[keyof Props];

/**
 * What the VM `fn` sees in `ctx.props`.
 *
 * - Store props are exposed as `Store<T>` under a **`$`-prefixed** key,
 *   matching the `$storeName` convention used everywhere else for effector
 *   stores (`model.$count`, `stores.$title`, etc.). A prop declared as
 *   `.store("totalCount", s => s<number>())` shows up inside `fn` as
 *   `ctx.props.$totalCount`.
 * - Event props are exposed as `EventCallable<T>` under their **raw** name,
 *   matching the convention for contract events (`model.inc`). A prop
 *   declared as `.event("onClose", e => e<void>())` shows up as
 *   `ctx.props.onClose`.
 *
 * Callers of `.create(props)` and framework adapters still pass the
 * unprefixed names (matching the declared prop names). Only the VM-facing
 * `ctx.props` view applies the `$` prefix to store props.
 */
export type ExtractVMProps<Props extends Record<string, AnyPropMeta>, _Generics = {}> = {
  [K in StoreProps<Props> & string as `$${K}`]: Props[K] extends PropStoreMeta<infer T, any>
    ? Store<T>
    : never;
} & {
  [K in EventProps<Props>]: Props[K] extends PropEventMeta<infer T, any> ? EventCallable<T> : never;
};
