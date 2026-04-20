import type { Scope, Store } from "effector";

export type ModelInstanceId = string | number;

/** Minimal interface for what the Solid layer needs from a Model */
export interface ModelLike<Instance = unknown> {
  readonly name: string;
  readonly $ids: Store<ModelInstanceId[]>;
  readonly $idSet: Store<Set<ModelInstanceId>>;
  has(id: ModelInstanceId): Store<boolean>;
  has(...parts: [string | number, string | number, ...(string | number)[]]): Store<boolean>;
  getRefMeta(field: string): { cardinality: "one" | "many"; target: unknown } | undefined;
  get(idOrParts: ModelInstanceId | readonly (string | number)[], scope?: Scope): Instance | null;
}
