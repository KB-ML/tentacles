import type { EventCallable, Node, Store } from "effector";
import type { ContractEntity, ContractFieldKind } from "../../contract";
import type { IndexState } from "../../model/model-indexes";
import type { ModelInstanceId } from "../../model/types";

export interface QueryContext<Instance> {
  /**
   * Model-level region used when creating query-derived stores/events.
   * Anchoring lazy units here keeps them alive for the lifetime of the model
   * instead of inheriting whatever region was active on first access — which
   * would let a `<View>` teardown destroy stores still referenced by the
   * cached `CollectionQuery`.
   */
  readonly region: Node;
  readonly $ids: Store<ModelInstanceId[]>;
  readonly $idSet: Store<Set<ModelInstanceId>>;
  readonly $dataMap: Store<Record<string, Record<string, unknown>>>;
  getInstance(id: ModelInstanceId): Instance | undefined;
  /** Scope-aware: reconstructs from provided dataMap snapshot (for fork({ values }) hydration) */
  getInstanceFromData(
    id: ModelInstanceId,
    dataMap: Record<string, Record<string, unknown>>,
  ): Instance | undefined;
  getUpdated(): EventCallable<any>;
  handleDelete(id: ModelInstanceId): void;
  handleUpdate(id: ModelInstanceId, data: Record<string, unknown>): Instance;
  getContract(): Record<string, ContractEntity<ContractFieldKind, unknown>>;
  /**
   * Reactive secondary-index store. Present only when the model has at least
   * one `.unique()` / `.index()` field. The query layer reads it from inside
   * its `combine()` so per-scope correctness is automatic — `scope.getState`
   * returns the scope-built index. Treat absent/inconsistent state as
   * "no index optimization available, fall back to full scan".
   */
  $index?: Store<IndexState>;
  /** Fires { id, field, value } on every field mutation. Used for incremental query updates. */
  $fieldUpdated?: EventCallable<{ id: string; field: string; value: unknown }>;
}
