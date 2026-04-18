import {
  attach,
  createEffect,
  createEvent,
  createNode,
  type Effect,
  type Event,
  type EventCallable,
  type Node,
  type Store,
  withRegion,
} from "effector";
import type { ContractEntity, ContractFieldKind } from "../contract";
import type {
  ContractModelFkData,
  ContractModelInverseData,
  ContractModelRefData,
  ContractModelStoreData,
  ModelInstanceId,
  ModelUpdatedPayload,
  UpdateData,
} from "./types";

export type CreateData<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
  Generics extends Record<string, unknown>,
> = ContractModelStoreData<Contract, Generics> &
  ContractModelRefData<Contract, Generics> &
  ContractModelFkData<Contract> &
  ContractModelInverseData<Contract>;

/** Scope-bound dataMap snapshot read from inside an `attach`-based handler. */
type DataMapSnapshot = Record<string, Record<string, unknown>>;

/**
 * `attach` accepts `sid` at runtime (passed through to the internal effect
 * creator) even though the public typings omit it. Centralise the cast here
 * so the rest of the file stays type-safe. `R` defaults to `void` for the
 * delete/clear paths; the update path supplies `R = Instance` so the effect
 * exposes a proper `.doneData` signal.
 */
function attachWithSid<P, R = void>(
  sid: string,
  source: Store<DataMapSnapshot>,
  handler: (state: DataMapSnapshot, params: P) => R,
): Effect<P, R> {
  const config = { source, effect: handler, sid };
  // `attach` returns `Effect<P, Awaited<R>>` where `Awaited` is effector's
  // internal (non-exported) alias. Our handlers are synchronous (no promises)
  // so `Awaited<R> = R`, and TypeScript can't unify the two `Awaited` names.
  // Same-hierarchy widening through `Effect<P, unknown>` keeps the cast
  // within the same class shape — we're not changing any runtime behaviour.
  const fx = attach(config) as Effect<P, unknown>;
  return fx as Effect<P, R>;
}

export class ModelEffects<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
  Generics extends Record<string, unknown>,
  Instance,
> {
  public readonly updated: EventCallable<ModelUpdatedPayload<Contract, Generics>>;

  private readonly sid: (suffix: string) => string;
  private readonly getDataMap: () => Store<DataMapSnapshot>;
  private readonly handlers: {
    create: (data: CreateData<Contract, Generics>) => Instance;
    createMany: (items: CreateData<Contract, Generics>[]) => Instance[];
    delete: (dataMap: DataMapSnapshot, id: ModelInstanceId) => void;
    clear: (dataMap: DataMapSnapshot) => void;
    update: (
      dataMap: DataMapSnapshot,
      id: ModelInstanceId,
      data: UpdateData<Contract, Generics>,
    ) => Instance;
  };

  private _region?: Node;
  private readonly sidRoot?: string;

  private _createFx?: Effect<CreateData<Contract, Generics>, Instance>;
  private _createManyFx?: Effect<CreateData<Contract, Generics>[], Instance[]>;
  private _deleteFx?: Effect<ModelInstanceId, void>;
  private _clearFx?: Effect<void, void>;
  private _updateFx?: Effect<
    { id: ModelInstanceId; data: UpdateData<Contract, Generics> },
    Instance
  >;

  private _created?: Event<Instance>;
  private _deleted?: Event<ModelInstanceId>;
  private _cleared?: Event<void>;

  constructor(
    modelName: string,
    sidRoot: string | undefined,
    getDataMap: () => Store<DataMapSnapshot>,
    handlers: {
      create: (data: CreateData<Contract, Generics>) => Instance;
      createMany: (items: CreateData<Contract, Generics>[]) => Instance[];
      delete: (dataMap: DataMapSnapshot, id: ModelInstanceId) => void;
      clear: (dataMap: DataMapSnapshot) => void;
      update: (
        dataMap: DataMapSnapshot,
        id: ModelInstanceId,
        data: UpdateData<Contract, Generics>,
      ) => Instance;
    },
  ) {
    this.handlers = handlers;
    this.sidRoot = sidRoot;
    this.getDataMap = getDataMap;
    this.sid = (suffix: string) => `tentacles:${modelName}:__${suffix}__:`;

    this.updated = createEvent<ModelUpdatedPayload<Contract, Generics>>({
      sid: `${this.sid("event")}updated`,
    });
  }

  private getRegion(): Node {
    if (!this._region) {
      this._region = createNode({
        meta: this.sidRoot ? { sidRoot: this.sidRoot } : {},
      });
    }
    return this._region;
  }

  get createFx(): Effect<CreateData<Contract, Generics>, Instance> {
    let fx = this._createFx;
    if (!fx) {
      withRegion(this.getRegion(), () => {
        fx = createEffect<CreateData<Contract, Generics>, Instance>({
          sid: `${this.sid("fx")}create`,
          handler: (data) => this.handlers.create(data),
        });
      });
      this._createFx = fx;
    }
    return fx as Effect<CreateData<Contract, Generics>, Instance>;
  }

  get createManyFx(): Effect<CreateData<Contract, Generics>[], Instance[]> {
    let fx = this._createManyFx;
    if (!fx) {
      withRegion(this.getRegion(), () => {
        fx = createEffect<CreateData<Contract, Generics>[], Instance[]>({
          sid: `${this.sid("fx")}createMany`,
          handler: (items) => this.handlers.createMany(items),
        });
      });
      this._createManyFx = fx;
    }
    return fx as Effect<CreateData<Contract, Generics>[], Instance[]>;
  }

  get deleteFx(): Effect<ModelInstanceId, void> {
    let fx = this._deleteFx;
    if (!fx) {
      withRegion(this.getRegion(), () => {
        // Attach-based effect: effector reads `$dataMap` from the active scope
        // and passes the scope-correct snapshot to the handler. Required for
        // two-process SSR where the client process has empty global `$dataMap`
        // but a `fork({values})`-hydrated scope carries the real data.
        fx = attachWithSid<ModelInstanceId>(
          `${this.sid("fx")}delete`,
          this.getDataMap(),
          (dataMap, id) => this.handlers.delete(dataMap, id),
        );
      });
      this._deleteFx = fx;
    }
    return fx as Effect<ModelInstanceId, void>;
  }

  get clearFx(): Effect<void, void> {
    let fx = this._clearFx;
    if (!fx) {
      withRegion(this.getRegion(), () => {
        fx = attachWithSid<void>(`${this.sid("fx")}clear`, this.getDataMap(), (dataMap) =>
          this.handlers.clear(dataMap),
        );
      });
      this._clearFx = fx;
    }
    return fx as Effect<void, void>;
  }

  get updateFx(): Effect<{ id: ModelInstanceId; data: UpdateData<Contract, Generics> }, Instance> {
    let fx = this._updateFx;
    if (!fx) {
      withRegion(this.getRegion(), () => {
        // Attach-based effect: effector supplies the scope-correct `$dataMap`
        // snapshot to the handler. Required for two-process SSR where the
        // client process has an empty global `$dataMap` but a hydrated scope
        // carries the real data. The handler uses the snapshot to resolve
        // additive ops (`{add}`, `{remove}`) on many refs without touching
        // the global store.
        fx = attachWithSid<{ id: ModelInstanceId; data: UpdateData<Contract, Generics> }, Instance>(
          `${this.sid("fx")}update`,
          this.getDataMap(),
          (dataMap, { id, data }) => this.handlers.update(dataMap, id, data),
        );
      });
      this._updateFx = fx;
    }
    return fx as Effect<{ id: ModelInstanceId; data: UpdateData<Contract, Generics> }, Instance>;
  }

  get created(): Event<Instance> {
    if (!this._created) {
      this._created = this.createFx.doneData;
    }
    return this._created;
  }

  get deleted(): Event<ModelInstanceId> {
    if (!this._deleted) {
      this._deleted = this.deleteFx.done.map(({ params }) => params);
    }
    return this._deleted;
  }

  get cleared(): Event<void> {
    if (!this._cleared) {
      this._cleared = this.clearFx.done.map(() => undefined);
    }
    return this._cleared;
  }
}
