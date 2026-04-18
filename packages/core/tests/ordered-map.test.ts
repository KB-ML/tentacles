import { describe, expect, it } from "vitest";
import { OrderedMap } from "../layers/model/ordered-map";

describe("OrderedMap: basic operations", () => {
  it("stores and retrieves values by key", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);

    expect(map.get("a")).toBe(1);
    expect(map.get("b")).toBe(2);
  });

  it("returns undefined for missing keys", () => {
    const map = new OrderedMap<string, number>();

    expect(map.get("missing")).toBeUndefined();
  });

  it("reports presence with has()", () => {
    const map = new OrderedMap<string, number>();
    map.set("x", 10);

    expect(map.has("x")).toBe(true);
    expect(map.has("y")).toBe(false);
  });

  it("overwrites value when setting existing key", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.set("a", 99);

    expect(map.get("a")).toBe(99);
  });

  it("deletes entries and returns true", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);

    expect(map.delete("a")).toBe(true);
    expect(map.has("a")).toBe(false);
    expect(map.get("a")).toBeUndefined();
  });

  it("returns false when deleting non-existent key", () => {
    const map = new OrderedMap<string, number>();

    expect(map.delete("missing")).toBe(false);
  });
});

describe("OrderedMap: first / last", () => {
  it("returns undefined for empty map", () => {
    const map = new OrderedMap<string, number>();

    expect(map.first()).toBeUndefined();
    expect(map.last()).toBeUndefined();
  });

  it("returns the same value for single-element map", () => {
    const map = new OrderedMap<string, number>();
    map.set("only", 42);

    expect(map.first()).toBe(42);
    expect(map.last()).toBe(42);
  });

  it("returns first and last by insertion order", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);

    expect(map.first()).toBe(1);
    expect(map.last()).toBe(3);
  });

  it("updates first when head is deleted", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);

    map.delete("a");

    expect(map.first()).toBe(2);
    expect(map.last()).toBe(3);
  });

  it("updates last when tail is deleted", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);

    map.delete("c");

    expect(map.first()).toBe(1);
    expect(map.last()).toBe(2);
  });

  it("handles deleting the middle element", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);

    map.delete("b");

    expect(map.first()).toBe(1);
    expect(map.last()).toBe(3);
    expect([...map.keys()]).toEqual(["a", "c"]);
  });

  it("returns undefined after deleting the only element", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.delete("a");

    expect(map.first()).toBeUndefined();
    expect(map.last()).toBeUndefined();
  });

  it("returns undefined after deleting all elements", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);
    map.delete("a");
    map.delete("b");

    expect(map.first()).toBeUndefined();
    expect(map.last()).toBeUndefined();
  });
});

describe("OrderedMap: insertion order", () => {
  it("keys() yields keys in insertion order", () => {
    const map = new OrderedMap<string, number>();
    map.set("c", 3);
    map.set("a", 1);
    map.set("b", 2);

    expect([...map.keys()]).toEqual(["c", "a", "b"]);
  });

  it("preserves order after middle deletion", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);
    map.set("d", 4);

    map.delete("b");

    expect([...map.keys()]).toEqual(["a", "c", "d"]);
  });

  it("preserves order after head deletion", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);

    map.delete("a");

    expect([...map.keys()]).toEqual(["b", "c"]);
  });

  it("preserves order after tail deletion", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);

    map.delete("c");

    expect([...map.keys()]).toEqual(["a", "b"]);
  });

  it("moves re-set key to the end", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);
    map.set("c", 3);

    map.set("a", 10);

    expect([...map.keys()]).toEqual(["b", "c", "a"]);
    expect(map.first()).toBe(2);
    expect(map.last()).toBe(10);
  });

  it("yields nothing for empty map", () => {
    const map = new OrderedMap<string, number>();

    expect([...map.keys()]).toEqual([]);
  });

  it("handles interleaved inserts and deletes", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);
    map.delete("a");
    map.set("c", 3);
    map.delete("b");
    map.set("d", 4);

    expect([...map.keys()]).toEqual(["c", "d"]);
    expect(map.first()).toBe(3);
    expect(map.last()).toBe(4);
  });

  it("handles delete-then-reinsert of same key", () => {
    const map = new OrderedMap<string, number>();
    map.set("a", 1);
    map.set("b", 2);
    map.delete("a");
    map.set("a", 99);

    expect([...map.keys()]).toEqual(["b", "a"]);
    expect(map.get("a")).toBe(99);
    expect(map.last()).toBe(99);
  });
});

describe("OrderedMap: stress", () => {
  it("maintains correct order over many operations", () => {
    const map = new OrderedMap<number, number>();

    for (let i = 0; i < 1000; i++) {
      map.set(i, i * 10);
    }

    expect(map.first()).toBe(0);
    expect(map.last()).toBe(9990);

    // delete first 500
    for (let i = 0; i < 500; i++) {
      map.delete(i);
    }

    expect(map.first()).toBe(5000);
    expect(map.last()).toBe(9990);
    expect([...map.keys()].length).toBe(500);

    // verify order is contiguous 500..999
    const keys = [...map.keys()];
    for (let i = 0; i < 500; i++) {
      expect(keys[i]).toBe(i + 500);
    }
  });
});
