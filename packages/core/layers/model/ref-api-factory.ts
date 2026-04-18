import { createEvent, type EventCallable, type Scope, type StoreWritable } from "effector";
import type { SidRegistry } from "./sid-registry";
import type { ModelInstanceId, RefManyApi, RefOneApi } from "./types";
import { createVirtualFieldStore } from "./virtual-field-store";

export type ManyEntry = {
  $ids: StoreWritable<(string | number)[]>;
  add: EventCallable<string | number>;
  remove: EventCallable<string | number>;
  fieldName: string;
};

export type OneEntry = {
  $id: StoreWritable<string | number | null>;
  set: EventCallable<string | number>;
  clear: EventCallable<void>;
  /** Clears $id only if it currently points to the given target. Avoids getState(). */
  clearIfMatches: EventCallable<string | number>;
  fieldName: string;
};

/**
 * Builds reactive APIs (`add`/`remove`, `set`/`clear`) for ref fields. The
 * stores backing each ref are virtual derivations over `$dataMap`, so
 * per-scope correctness is automatic.
 *
 * Phase 5b: this factory no longer maintains an imperative inverse index.
 * Inverse indexes derive from the source model's `$dataMap` directly via
 * `InverseIndex`, which subscribes to `_dataMapSet` / `_dataMapFieldUpdated`
 * / `_dataMapRemoved` events on the source model. Ref mutations propagate
 * through `$dataMap` automatically — no explicit wiring needed here.
 *
 * The factory still tracks `manyRefs` / `oneRefs` so that when a *target*
 * instance is deleted, `cleanupRefsForDeletedId` can null out any forward
 * refs that were pointing at it.
 */
export class RefApiFactory {
  private readonly manyRefs = new Set<ManyEntry>();
  private readonly oneRefs = new Set<OneEntry>();

  constructor(
    private readonly getInstance: (id: ModelInstanceId) => unknown,
    private readonly registry: SidRegistry,
    private readonly getFieldUpdated: () => EventCallable<{
      id: string;
      field: string;
      value: unknown;
    }>,
  ) {}

  /** Called by Model.clearInstance to clean up forward refs pointing to a
   *  deleted target instance. `remove` is idempotent and `clearIfMatches` is
   *  conditional — no getState() needed. */
  cleanupRefsForDeletedId(deletedId: ModelInstanceId): void {
    for (const entry of this.manyRefs) {
      entry.remove(deletedId);
    }
    for (const entry of this.oneRefs) {
      entry.clearIfMatches(deletedId);
    }
  }

  create(
    cardinality: "many" | "one",
    fieldName: string,
    makeSid: (field: string) => string,
    scope: Scope | undefined,
    sourceInstanceId?: ModelInstanceId,
    $sourceDataMap?: StoreWritable<Record<string, Record<string, unknown>>>,
    sourceId?: string,
    $instanceSlice?: StoreWritable<Record<string, unknown>>,
    getSliceFieldUpdate?: () => EventCallable<{ field: string; value: unknown }> | undefined,
  ): { api: RefManyApi | RefOneApi; registeredSids: string[] } {
    if (cardinality === "many") {
      return this.createMany(
        fieldName,
        makeSid,
        scope,
        sourceInstanceId,
        $sourceDataMap,
        sourceId,
        $instanceSlice,
        getSliceFieldUpdate,
      );
    }
    return this.createOne(
      fieldName,
      makeSid,
      scope,
      sourceInstanceId,
      $sourceDataMap,
      sourceId,
      $instanceSlice,
      getSliceFieldUpdate,
    );
  }

  unregisterMany(entry: ManyEntry): void {
    this.manyRefs.delete(entry);
  }

  unregisterOne(entry: OneEntry): void {
    this.oneRefs.delete(entry);
  }

  private createMany(
    fieldName: string,
    makeSid: (field: string) => string,
    scope: Scope | undefined,
    _sourceInstanceId: ModelInstanceId | undefined,
    $sourceDataMap: StoreWritable<Record<string, Record<string, unknown>>> | undefined,
    sourceId: string | undefined,
    $instanceSlice: StoreWritable<Record<string, unknown>> | undefined,
    getSliceFieldUpdate:
      | (() => EventCallable<{ field: string; value: unknown }> | undefined)
      | undefined,
  ): { api: RefManyApi; registeredSids: string[] } {
    const registeredSids: string[] = [];
    const register = (unit: { sid?: string | null }) =>
      this.registry.registerUnit(unit, scope, registeredSids);

    const $ids = createVirtualFieldStore<(string | number)[]>(
      $sourceDataMap!,
      $instanceSlice!,
      sourceId!,
      fieldName,
      this.getFieldUpdated(),
      getSliceFieldUpdate,
    );
    const add = createEvent<string | number>({ sid: makeSid(`${fieldName}:add`) });
    const remove = createEvent<string | number>({ sid: makeSid(`${fieldName}:remove`) });

    $ids
      .on(add, (ids, id) => (ids.includes(id) ? ids : [...ids, id]))
      .on(remove, (ids, id) => ids.filter((x) => x !== id));

    const entry: ManyEntry = { $ids, add, remove, fieldName };
    this.manyRefs.add(entry);

    // $ids is virtual (backed by $dataMap) — no SID registration needed
    register(add);
    register(remove);

    let _$resolved: ReturnType<typeof $ids.map> | null = null;
    const getInstance = this.getInstance;
    const api = {
      $ids,
      add,
      remove,
      get $resolved() {
        if (!_$resolved) {
          _$resolved = $ids.map((refIds: (string | number)[]) =>
            refIds
              .map((id: string | number) => getInstance(id))
              .filter((inst): inst is NonNullable<typeof inst> => inst != null),
          );
        }
        return _$resolved;
      },
      __refEntry: entry,
    };

    return { api: api as RefManyApi, registeredSids };
  }

  private createOne(
    fieldName: string,
    makeSid: (field: string) => string,
    scope: Scope | undefined,
    _sourceInstanceId: ModelInstanceId | undefined,
    $sourceDataMap: StoreWritable<Record<string, Record<string, unknown>>> | undefined,
    sourceId: string | undefined,
    $instanceSlice: StoreWritable<Record<string, unknown>> | undefined,
    getSliceFieldUpdate:
      | (() => EventCallable<{ field: string; value: unknown }> | undefined)
      | undefined,
  ): { api: RefOneApi; registeredSids: string[] } {
    const registeredSids: string[] = [];
    const register = (unit: { sid?: string | null }) =>
      this.registry.registerUnit(unit, scope, registeredSids);

    const $id = createVirtualFieldStore<string | number | null>(
      $sourceDataMap!,
      $instanceSlice!,
      sourceId!,
      fieldName,
      this.getFieldUpdated(),
      getSliceFieldUpdate,
    );
    const set = createEvent<string | number>({ sid: makeSid(`${fieldName}:set`) });
    const clear = createEvent<void>({ sid: makeSid(`${fieldName}:clear`) });
    const clearIfMatches = createEvent<string | number>();

    $id
      .on(set, (_, id) => id)
      .on(clear, () => null)
      .on(clearIfMatches, (current, targetId) => (current === targetId ? null : current));

    const entry: OneEntry = { $id, set, clear, clearIfMatches, fieldName };
    this.oneRefs.add(entry);

    // $id is virtual (backed by $dataMap) — no SID registration needed
    register(set);
    register(clear);

    let _$resolved: ReturnType<typeof $id.map> | null = null;
    const getInstance = this.getInstance;
    const api = {
      $id,
      set,
      clear,
      get $resolved() {
        if (!_$resolved) {
          _$resolved = $id.map((id: string | number | null) =>
            id != null ? (getInstance(id) ?? null) : null,
          );
        }
        return _$resolved;
      },
      __refEntry: entry,
    };

    return { api: api as RefOneApi, registeredSids };
  }
}
