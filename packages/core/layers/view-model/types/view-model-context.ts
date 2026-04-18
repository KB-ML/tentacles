import type { EventCallable, Store } from "effector";
import type { EventMeta, StoreMeta } from "../../contract/types";
import type { ModelStore } from "../../model/types";

type StoreMetaValue<S> = S extends StoreMeta<infer T, any, any, any> ? T : unknown;

// ─── Map chain accumulators to effector units for ViewModel fn ───

export type ViewModelStores<
  Stores extends Record<string, StoreMeta>,
  Events extends Record<string, unknown>,
  Derived extends Record<string, unknown>,
  _Generics extends Record<string, unknown> = {},
> = {
  [K in keyof Stores & string as `$${K}`]: ModelStore<StoreMetaValue<Stores[K]>>;
} & {
  [K in keyof Events]: Events[K] extends EventMeta<infer V> ? EventCallable<V> : never;
} & {
  [K in keyof Derived & string as `$${K}`]: Store<Derived[K]>;
};

// ─── Context passed to ViewModel fn ───

export interface ViewModelContext<Props extends Record<string, unknown> = {}> {
  readonly mounted: EventCallable<void>;
  readonly unmounted: EventCallable<void>;
  readonly $mounted: Store<boolean>;
  readonly props: Props;
}
