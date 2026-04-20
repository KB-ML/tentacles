import type { Store } from "effector";
import type { ModelInstanceId } from "../model/types";
import { TentaclesError } from "../shared/tentacles-error";

/** Entry in the scope stack — one per <Map> ancestor */
export interface ScopeEntry {
  model: {
    getRefMeta(field: string): { cardinality: "one" | "many"; target: unknown } | undefined;
  };
  instance: Record<string, unknown>;
}

/** Result of resolveFrom — tagged so the caller knows which Map mode to use */
export interface ResolvedRef {
  cardinality: "one" | "many";
  store: Store<ModelInstanceId[]> | Store<ModelInstanceId | null>;
}

/**
 * Walk up the scope stack to find the nearest ancestor whose ref named `fieldName`
 * targets `targetModel`. Self-refs (no bind, parent model IS target) are matched.
 *
 * @throws if no matching ref is found
 */
export function resolveFrom(
  stack: readonly ScopeEntry[],
  fieldName: string,
  targetModel: unknown,
): ResolvedRef {
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i] as (typeof stack)[number];
    const meta = entry.model.getRefMeta(fieldName);
    if (!meta) continue;
    if (meta.target === targetModel) {
      const refApi = entry.instance[fieldName] as Record<string, unknown>;
      return {
        cardinality: meta.cardinality,
        store:
          meta.cardinality === "many"
            ? (refApi.$ids as Store<ModelInstanceId[]>)
            : (refApi.$id as Store<ModelInstanceId | null>),
      };
    }
  }
  const modelName = (targetModel as { name?: string }).name ?? "unknown";
  throw new TentaclesError(
    `<Each from="${fieldName}">: no parent ref "${fieldName}" targeting "${modelName}" found`,
  );
}
