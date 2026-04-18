import {
  allSettled,
  clearNode,
  createEvent,
  createStore,
  type EventCallable,
  type Node,
  type Scope,
  type StoreWritable,
  withRegion,
} from "effector";

export class ViewModelLifecycle {
  private _mounted?: EventCallable<void>;
  private _unmounted?: EventCallable<void>;
  private _$mounted?: StoreWritable<boolean>;

  constructor(private readonly region: Node) {}

  get mounted(): EventCallable<void> {
    let ev = this._mounted;
    if (!ev) {
      withRegion(this.region, () => {
        ev = createEvent<void>();
      });
      this._mounted = ev;
    }
    return ev as EventCallable<void>;
  }

  get unmounted(): EventCallable<void> {
    let ev = this._unmounted;
    if (!ev) {
      withRegion(this.region, () => {
        ev = createEvent<void>();
      });
      this._unmounted = ev;
    }
    return ev as EventCallable<void>;
  }

  get $mounted(): StoreWritable<boolean> {
    let store = this._$mounted;
    if (!store) {
      withRegion(this.region, () => {
        store = createStore(false)
          .on(this.mounted, () => true)
          .on(this.unmounted, () => false);
      });
      this._$mounted = store;
    }
    return store as StoreWritable<boolean>;
  }

  mount(scope?: Scope): void | Promise<void> {
    if (!this._mounted) return;
    if (scope) {
      return allSettled(this._mounted, { scope });
    }
    this._mounted();
  }

  /** Fire unmounted event without clearing the region. Safe for React Strict Mode
   *  where useEffect cleanup runs between simulated mount cycles. */
  unmount(scope?: Scope): void | Promise<void> {
    if (scope) {
      if (!this._unmounted) return;
      return allSettled(this._unmounted, { scope });
    }
    this._unmounted?.();
  }

  /** Fire unmounted event AND clear the effector region (permanent teardown). */
  destroy(scope?: Scope): void | Promise<void> {
    if (scope) {
      if (!this._unmounted) return;
      return allSettled(this._unmounted, { scope });
    }
    this._unmounted?.();
    clearNode(this.region, { deep: true });
  }
}
