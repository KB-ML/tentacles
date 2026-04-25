import {
  combine,
  createEffect,
  createEvent,
  type Event,
  type EventCallable,
  type Store,
  sample,
  withRegion,
} from "effector";
import type { ModelInstanceId } from "../model/types";
import { TentaclesError } from "../shared/tentacles-error";
import type { QueryContext } from "./types";

export class QueryField<T> {
  private _$values?: Store<T[]>;
  private _update?: EventCallable<T>;
  private _updated?: Event<{ id: ModelInstanceId; value: T }>;

  constructor(
    private readonly fieldName: string,
    private readonly isWritable: boolean,
    private readonly context: QueryContext<unknown>,
    private readonly queryIds: () => Store<ModelInstanceId[]>,
  ) {}

  get $values(): Store<T[]> {
    if (!this._$values) {
      this._$values = withRegion(this.context.region, () => {
        const fieldName = this.fieldName;
        // Derive from $ids + $dataMap (not $list) to avoid circular combine dependency
        return combine(this.queryIds(), this.context.$dataMap).map(([ids, dataMap]) =>
          ids.map((id) => {
            const data = dataMap[String(id)];
            return (data?.[fieldName] ?? undefined) as T;
          }),
        );
      });
    }
    return this._$values;
  }

  get update(): EventCallable<T> {
    if (!this.isWritable) {
      throw new TentaclesError(`Field "${this.fieldName}" is read-only`);
    }
    if (!this._update) {
      this._update = withRegion(this.context.region, () => {
        const ev = createEvent<T>();
        const fieldName = this.fieldName;
        const ctx = this.context;
        const fx = createEffect(({ ids, value }: { ids: ModelInstanceId[]; value: T }) => {
          for (const id of ids) {
            ctx.handleUpdate(id, { [fieldName]: value });
          }
        });
        sample({
          clock: ev,
          source: this.queryIds(),
          fn: (ids: ModelInstanceId[], value: T) => ({ ids, value }),
          target: fx,
        });
        return ev;
      });
    }
    return this._update;
  }

  get updated(): Event<{ id: ModelInstanceId; value: T }> {
    if (!this._updated) {
      this._updated = withRegion(this.context.region, () => {
        const fieldName = this.fieldName;
        // Use $idSet (O(1) .has()) instead of $ids array (O(N) .includes()) for the filter
        return sample({
          clock: this.context.getUpdated(),
          source: this.context.$idSet,
          filter: (idSet: Set<ModelInstanceId>, payload: { field: string; id: ModelInstanceId }) =>
            payload.field === fieldName && idSet.has(payload.id),
          fn: (_idSet: Set<ModelInstanceId>, payload: { id: ModelInstanceId; value: unknown }) => ({
            id: payload.id,
            value: payload.value as T,
          }),
        });
      });
    }
    return this._updated;
  }
}
