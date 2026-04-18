import { OrderedMap } from "./ordered-map";
import type { ModelInstanceId } from "./types";

export type CompoundKey = [string | number, string | number, ...(string | number)[]];

export class InstanceCache<V> {
  static readonly COMPOUND_PK_DELIMITER = "\0";

  private readonly cache = new OrderedMap<ModelInstanceId, V>();
  private readonly compoundKeys = new Map<string, CompoundKey>();

  get(id: ModelInstanceId): V | undefined {
    return this.cache.get(id);
  }

  getByParts(...parts: (string | number)[]): V | undefined {
    if (parts.length === 1) {
      return this.cache.get(parts[0] as string | number);
    }
    const compoundId = parts.map(String).join(InstanceCache.COMPOUND_PK_DELIMITER);
    return this.cache.get(compoundId);
  }

  set(id: ModelInstanceId, value: V): void {
    this.cache.set(id, value);
  }

  delete(id: ModelInstanceId): void {
    this.cache.delete(id);
    this.compoundKeys.delete(String(id));
  }

  has(id: ModelInstanceId): boolean {
    return this.cache.has(id);
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
