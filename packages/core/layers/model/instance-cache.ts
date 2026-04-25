import { OrderedMap } from "./ordered-map";
import type { ModelInstanceId } from "./types";

export type CompoundKey = [string | number, string | number, ...(string | number)[]];

export class InstanceCache<V> {
  static readonly COMPOUND_PK_DELIMITER = "\0";

  private readonly cache = new OrderedMap<ModelInstanceId, V>();
  private readonly compoundKeys = new Map<string, CompoundKey>();

  get(id: ModelInstanceId): V | undefined {
    return this.cache.get(String(id) as ModelInstanceId);
  }

  getByParts(...parts: (string | number)[]): V | undefined {
    if (parts.length === 1) {
      return this.cache.get(String(parts[0]) as ModelInstanceId);
    }
    const compoundId = parts.map(String).join(InstanceCache.COMPOUND_PK_DELIMITER);
    return this.cache.get(compoundId);
  }

  set(id: ModelInstanceId, value: V): void {
    this.cache.set(String(id) as ModelInstanceId, value);
  }

  delete(id: ModelInstanceId): void {
    const key = String(id);
    this.cache.delete(key as ModelInstanceId);
    this.compoundKeys.delete(key);
  }

  has(id: ModelInstanceId): boolean {
    return this.cache.has(String(id) as ModelInstanceId);
  }

  *keys(): IterableIterator<ModelInstanceId> {
    yield* this.cache.keys();
  }

  registerCompoundKey(serialized: string, key: CompoundKey): void {
    this.compoundKeys.set(serialized, key);
  }

  getCompoundKey(serialized: string): CompoundKey | undefined {
    return this.compoundKeys.get(serialized);
  }
}
