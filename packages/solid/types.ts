import type { Scope, Store } from "effector";

export type ModelInstanceId = string | number;

/** Minimal interface for what the Solid layer needs from a Model */
export interface ModelLike<Instance = unknown> {
  readonly name: string;
  readonly $ids: Store<ModelInstanceId[]>;
  readonly $idSet: Store<Set<ModelInstanceId>>;
  has(id: ModelInstanceId): Store<boolean>;
  has(...parts: [string | number, string | number, ...(string | number)[]]): Store<boolean>;
  getSync(id: ModelInstanceId, scope?: Scope): Instance | undefined;
  getByKeySync(
    ...parts:
      | [string | number, string | number, ...(string | number)[]]
      | [string | number, string | number, ...(string | number)[], Scope]
  ): Instance | undefined;
  getRefMeta(field: string): { cardinality: "one" | "many"; target: unknown } | undefined;
  get(id: ModelInstanceId): Instance | null;
  get(...parts: [string | number, string | number, ...(string | number)[]]): Instance | null;
}
