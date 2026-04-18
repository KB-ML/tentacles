export function getOrInit<K extends object, V>(map: WeakMap<K, V>, key: K, init: () => V): V;
export function getOrInit<K, V>(map: Map<K, V>, key: K, init: () => V): V;
export function getOrInit<K, V>(
  map: { get(k: K): V | undefined; set(k: K, v: V): void },
  key: K,
  init: () => V,
): V {
  let value = map.get(key);
  if (!value) {
    value = init();
    map.set(key, value);
  }
  return value;
}
