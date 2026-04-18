type LinkedNode<K, V> = {
  key: K;
  value: V;
  prev: LinkedNode<K, V> | null;
  next: LinkedNode<K, V> | null;
};

export class OrderedMap<K, V> {
  private readonly map = new Map<K, LinkedNode<K, V>>();
  private head: LinkedNode<K, V> | null = null;
  private tail: LinkedNode<K, V> | null = null;

  has(key: K): boolean {
    return this.map.has(key);
  }

  get(key: K): V | undefined {
    return this.map.get(key)?.value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.delete(key);
    }

    const node: LinkedNode<K, V> = { key, value, prev: this.tail, next: null };

    if (this.tail) {
      this.tail.next = node;
    } else {
      this.head = node;
    }
    this.tail = node;
    this.map.set(key, node);
  }

  delete(key: K): boolean {
    const node = this.map.get(key);
    if (!node) return false;

    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    this.map.delete(key);
    return true;
  }

  first(): V | undefined {
    return this.head?.value;
  }

  last(): V | undefined {
    return this.tail?.value;
  }

  *keys(): IterableIterator<K> {
    let current = this.head;
    while (current) {
      yield current.key;
      current = current.next;
    }
  }
}
