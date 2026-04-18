import { allSettled, type EventCallable, type Scope, type StoreWritable } from "effector";
import { type ContractEntity, ContractFieldKind, type ContractRef } from "../contract";
import { getOrInit } from "./utils";

export class ScopeManager<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
> {
  private static readonly pendingCreates = new WeakMap<
    Scope,
    Map<string | number, Promise<unknown>>
  >();

  constructor(private readonly contract: Contract) {}

  enqueue<T>(scope: Scope, id: string | number, work: () => Promise<T>): Promise<T> {
    const pendingMap = getOrInit(ScopeManager.pendingCreates, scope, () => new Map());
    const previous = pendingMap.get(id);

    const promise = (previous ? previous.catch(() => {}) : Promise.resolve()).then(() => work());

    pendingMap.set(id, promise);
    promise.finally(() => {
      if (pendingMap.get(id) === promise) {
        pendingMap.delete(id);
      }
    });

    return promise;
  }

  /**
   * No-op: ref stores are now virtual field stores backed by $dataMap.
   * Their scope values derive automatically from the scoped $dataMap,
   * which is populated before this method is called.
   */
  async applyScopeValues(_units: Record<string, unknown>, _scope: Scope): Promise<void> {}

  /**
   * Reset ref stores in scope to their default values (empty).
   * Called during scoped clear/delete.
   * Ref stores are virtual (backed by $dataMap) — use clear events to reset.
   */
  async resetScopeValues(units: Record<string, unknown>, scope: Scope): Promise<void> {
    for (const key of Object.keys(this.contract)) {
      const entity = this.contract[key];
      if (!entity || entity.kind !== ContractFieldKind.Ref) continue;

      const refEntity = entity as ContractRef;
      const refApi = units[key] as Record<string, unknown>;
      if (refEntity.cardinality === "many") {
        // Clear all IDs by removing each one isn't practical without getState.
        // Instead, set the virtual store directly to empty array.
        const store = refApi.$ids as StoreWritable<unknown>;
        await allSettled(store, { scope, params: [] });
      } else {
        const clear = refApi.clear as EventCallable<void>;
        await allSettled(clear, { scope });
      }
    }
  }
}
