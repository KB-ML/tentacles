import type { Store } from "effector";

export type ModelInstanceId = string | number;

/** Minimal interface for what the React layer needs from a Model */
export interface ModelLike<Instance = unknown> {
  readonly name: string;
  getSync(id: ModelInstanceId): Instance | undefined;
  getByKeySync(
    ...parts: [string | number, string | number, ...(string | number)[]]
  ): Instance | undefined;
  getRefMeta(field: string): { cardinality: "one" | "many"; target: unknown } | undefined;
  instance(id: ModelInstanceId): Store<Instance | null>;
  instance(
    ...parts: [string | number, string | number, ...(string | number)[]]
  ): Store<Instance | null>;
}
