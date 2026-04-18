import type { Store } from "effector";
import { detectSidRoot } from "../shared/detect-sid-root";
import { BaseContractChain } from "./base-contract-chain";
import type {
  DerivedParam,
  EventFieldBuilder,
  EventMeta,
  EventResult,
  FreshName,
  StoreFieldBuilder,
  StoreMeta,
  StoreResult,
  StoreValues,
} from "./types";

// ViewContractChain shares phantom keys with the base class — no extra
// phantom symbols needed here.

/**
 * View model contract chain — declares stores, events, and derived stores.
 *
 * Unlike `ModelContractChain`, view contracts expose no `.ref`/`.inverse`/
 * `.pk` methods. View models are ephemeral per-component state containers,
 * not persistent data entities, so those concepts don't apply.
 *
 * Runtime shape is identical to model contracts — the only difference is the
 * typed public surface.
 */
export class ViewContractChain<
  Stores extends Record<string, StoreMeta> = {},
  Events extends Record<string, unknown> = {},
  Derived extends Record<string, unknown> = {},
> extends BaseContractChain<Stores, Events, Derived> {
  store<K extends string, T, HD extends boolean, U extends boolean, I extends boolean>(
    name: FreshName<K, Stores, Events, Derived, {}>,
    builder: (s: StoreFieldBuilder<StoreValues<Stores>>) => StoreResult<T, HD, U, I>,
  ): ViewContractChain<Stores & Record<K, StoreMeta<T, HD, U, I>>, Events, Derived> {
    this._addStore(name as string, builder as (s: unknown) => unknown);
    return this as unknown as ViewContractChain<
      Stores & Record<K, StoreMeta<T, HD, U, I>>,
      Events,
      Derived
    >;
  }

  event<K extends string, T>(
    name: FreshName<K, Stores, Events, Derived, {}>,
    builder: (e: EventFieldBuilder) => EventResult<T>,
  ): ViewContractChain<Stores, Events & Record<K, EventMeta<T>>, Derived> {
    this._addEvent(name as string, builder as (e: unknown) => unknown);
    return this as unknown as ViewContractChain<Stores, Events & Record<K, EventMeta<T>>, Derived>;
  }

  derived<K extends string, T>(
    name: FreshName<K, Stores, Events, Derived, {}>,
    factory: (stores: DerivedParam<Stores, Derived, {}>) => Store<T>,
  ): ViewContractChain<Stores, Events, Derived & Record<K, T>> {
    this._addDerived(
      name as string,
      factory as unknown as (stores: Record<string, unknown>) => Store<unknown>,
    );
    return this as unknown as ViewContractChain<Stores, Events, Derived & Record<K, T>>;
  }

  merge<
    MS extends Record<string, StoreMeta>,
    ME extends Record<string, unknown>,
    MD extends Record<string, unknown>,
  >(
    source: ViewContractChain<MS, ME, MD>,
  ): ViewContractChain<Stores & MS, Events & ME, Derived & MD> {
    this._merge(source);
    return this as unknown as ViewContractChain<Stores & MS, Events & ME, Derived & MD>;
  }
}

/**
 * Create a new view model contract chain. Chain stores, events, and derived
 * fields, then pass the result directly to `createViewModel({ contract })`.
 */
export function createViewContract(): ViewContractChain {
  return new ViewContractChain(detectSidRoot());
}
