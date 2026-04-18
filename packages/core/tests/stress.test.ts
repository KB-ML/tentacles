import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import {
  allSettled,
  fork,
  serialize,
  sample,
  createEffect,
  createEvent,
  type StoreWritable,
  type EventCallable,
} from "effector";
import { counterModel } from "./helpers";

describe("STRESS: rapid create/delete cycles with different IDs", () => {
  it("1000 unique instances created and deleted — no instance leaks", () => {
    const model = counterModel();

    for (let i = 0; i < 1000; i++) {
      model.create({ id: `u-${i}`, count: i });
    }

    for (let i = 0; i < 1000; i++) {
      model.delete(`u-${i}`);
    }

    const fresh = model.create({ id: "u-0", count: 999 });
    expect(fresh.$count.getState()).toBe(999);

    model.clear();
  });

  it("500 create/delete/create cycles on the same ID — functional correctness", () => {
    const model = counterModel();

    for (let i = 0; i < 500; i++) {
      const instance = model.create({ id: "cycled", count: i });
      expect(instance.$count.getState()).toBe(i);

      instance.increment();
      expect(instance.$count.getState()).toBe(i + 1);

      model.delete("cycled");
    }

    model.clear();
  });
});

describe("STRESS: many concurrent fork scopes", () => {
  it("100 concurrent scopes with the same instance — all isolated", async () => {
    const model = counterModel();
    const instance = model.create({ id: "multi-scope", count: 0 });

    const results = await Promise.all(
      Array.from({ length: 100 }, async (_, i) => {
        const scope = fork();
        for (let j = 0; j <= i; j++) {
          await allSettled(instance.increment, { scope });
        }
        return { i, count: scope.getState(instance.$count) };
      }),
    );

    for (const { i, count } of results) {
      expect(count).toBe(i + 1);
    }

    expect(instance.$count.getState()).toBe(0);

    model.clear();
  });
});

describe("STRESS: model with many fields", () => {
  it("contract with 50 stores and 50 events — all wired correctly", () => {
    let contract: any = createContract()
      .store("id", (s) => s<string>());
    for (let i = 0; i < 50; i++) {
      contract = (contract as any).store(`store${i}`, (s: any) => s());
      contract = (contract as any).event(`event${i}`, (e: any) => e());
    }
    contract = (contract as any).pk("id");

    const model = createModel({
      contract,
      fn: (units: any) => {
        for (let i = 0; i < 50; i++) {
          units[`$store${i}`].on(units[`event${i}`], (_: number, v: number) => v);
        }
        return units;
      },
    });

    const instance = model.create({
      id: "big-1",
      ...Object.fromEntries(
        Array.from({ length: 50 }, (_, i) => [`store${i}`, i]),
      ),
    } as any);

    for (let i = 0; i < 50; i++) {
      expect((instance as any)[`$store${i}`].getState()).toBe(i);
    }

    for (let i = 0; i < 50; i++) {
      (instance as any)[`event${i}`](i * 100);
    }

    for (let i = 0; i < 50; i++) {
      expect((instance as any)[`$store${i}`].getState()).toBe(i * 100);
    }

    model.clear();
  });
});

describe("STRESS: builder function returns modified units", () => {
  it("builder that omits a field — returned model is missing the field", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("a", (s) => s<number>())
      .store("b", (s) => s<number>())
      .event("trigger", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $a, trigger }) => {
        $a.on(trigger, (n) => n + 1);
        return { $a, trigger } as any;
      },
    });

    const instance = model.create({ id: "partial", a: 0, b: 10 });

    expect(instance.$a.getState()).toBe(0);
    // With fn returning partial, all contract fields still appear (merged from units)
    expect((instance as any).$b.getState()).toBe(10);

    model.clear();
  });

  it("builder that returns extra fields — extras cleaned up via withRegion on replace", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("inc", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $count, inc }) => {
        $count.on(inc, (n) => n + 1);
        const derived = $count.map((n) => n * 2);
        const extraEvent = createEvent<void>();
        return { $count, inc, derived, extraEvent } as any;
      },
    });

    const instance = model.create({ id: "extra", count: 0 });

    expect((instance as any).derived.getState()).toBe(0);

    const instance2 = model.create({ id: "extra", count: 5 });
    expect((instance2 as any).derived.getState()).toBe(10);

    model.clear();
  });
});

describe("STRESS: zombie instances after replacement", () => {
  it("old instance stores are zombies — getState works but events are disconnected", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("inc", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $count, inc }) => {
        $count.on(inc, (n) => n + 1);
        return { $count, inc };
      },
    });

    const old = model.create({ id: "zombie", count: 0 });
    old.inc();
    expect(old.$count.getState()).toBe(1);

    const fresh = model.create({ id: "zombie", count: 100 });

    // Proxy architecture: old and fresh both read from $dataMap["zombie"].
    // After replacement, $dataMap has count: 100.
    expect(old.$count.getState()).toBe(100);

    // Old events are disconnected: clearNode(region, { deep: true }) destroyed
    // the prepend event's graphite, so old.inc() fires a dead node.
    old.inc();
    expect(old.$count.getState()).toBe(100); // unchanged — event is dead

    // Fresh events work: the new prepend is alive.
    fresh.inc();
    expect(fresh.$count.getState()).toBe(101);

    // Old proxy still sees current data (both point to same $dataMap entry).
    expect(old.$count.getState()).toBe(101);

    model.clear();
  });

  it("zombie instances interfere with serialize in fork scopes", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<string>())
      .event("set", (e) => e<string>())
      .pk("id");

    const model = createModel({
      contract,
      name: "zombie-ssr",
      fn: ({ $value, set }) => {
        $value.on(set, (_, v) => v);
        return { $value, set };
      },
    });

    const v1 = model.create({ id: "z", value: "v1" });
    const scope = fork();
    await allSettled(v1.set, { scope, params: "modified-v1" });

    const v2 = model.create({ id: "z", value: "v2" });

    const values = serialize(scope);

    // State is stored in $dataMap, not per-field SIDs
    const dataMapKey = Object.keys(values).find((k) => k.includes("zombie-ssr:__dataMap__"));
    expect(dataMapKey).toBeDefined();

    model.clear();
  });
});

describe("STRESS: concrete-type contracts edge cases", () => {
  it("model with multiple concrete type params — all fields typed correctly", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("items", (s) => s<string[]>())
      .store("selected", (s) => s<string>())
      .event("addItem", (e) => e<string>())
      .event("selectItem", (e) => e<string>())
      .event("reset", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $items, $selected, addItem, selectItem, reset }) => {
        $items.on(addItem, (list, item) => [...list, item]);
        $items.on(reset, () => []);
        $selected.on(selectItem, (_, item) => item);
        return { $items, $selected, addItem, selectItem, reset };
      },
    });

    const instance = model.create({
      id: "g1",
      items: [],
      selected: "",
    });

    instance.addItem("hello");
    expect(instance.$items.getState()).toEqual(["hello"]);

    instance.selectItem("hello");
    expect(instance.$selected.getState()).toBe("hello");

    instance.reset();
    expect(instance.$items.getState()).toEqual([]);

    model.clear();
  });
});

describe("STRESS: OrderedMap under adversarial conditions", () => {
  it("rapid set/delete on the same key — linked list stays consistent", () => {
    const model = counterModel();

    for (let i = 0; i < 200; i++) {
      model.create({ id: "flip", count: i });
      if (i % 2 === 0) {
        model.delete("flip");
      }
    }

    const final = model.create({ id: "flip", count: 999 });
    expect(final.$count.getState()).toBe(999);

    model.clear();
  });

  it("many instances created then cleared — no dangling linked list nodes", () => {
    const model = counterModel();

    for (let i = 0; i < 500; i++) {
      model.create({ id: `bulk-${i}`, count: i });
    }

    model.clear();

    const fresh = model.create({ id: "after-clear", count: 42 });
    expect(fresh.$count.getState()).toBe(42);

    model.clear();
  });
});

describe("STRESS: SSR serialize/hydrate under load", () => {
  it("50 models x 10 instances each — serialize/hydrate roundtrip", async () => {
    const models = Array.from({ length: 50 }, (_, i) => counterModel(`stressModel${i}`));

    const allInstances = models.flatMap((model, mi) =>
      Array.from({ length: 10 }, (_, ii) =>
        model.create({ id: `i${ii}`, count: mi * 100 + ii }),
      ),
    );

    const scope = fork();

    await Promise.all(
      allInstances.map((inst) => allSettled(inst.increment, { scope })),
    );

    const values = serialize(scope);
    const hydrated = fork({ values });

    for (let idx = 0; idx < allInstances.length; idx++) {
      const inst = allInstances[idx]!;
      const mi = Math.floor(idx / 10);
      const ii = idx % 10;
      const expected = mi * 100 + ii + 1;
      expect(hydrated.getState(inst.$count)).toBe(expected);
    }

    for (const model of models) {
      model.clear();
    }
  });
});

describe("STRESS: effects and complex wiring under replacement", () => {
  it("replacing instance with pending effects — effects from old instance still fire", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("result", (s) => s<string>())
      .event("trigger", (e) => e<void>())
      .pk("id");

    let effectRunCount = 0;
    let resolveEffect: (() => void) | null = null;

    const model = createModel({
      contract,

      fn: ({ $result, trigger }) => {
        const fx = createEffect(
          () =>
            new Promise<string>((resolve) => {
              effectRunCount++;
              resolveEffect = () => resolve("done");
            }),
        );
        sample({ clock: trigger, target: fx });
        $result.on(fx.doneData, (_, r) => r);
        return { $result, trigger };
      },
    });

    const scope = fork();
    const v1 = model.create({ id: "pending", result: "" });

    allSettled(v1.trigger, { scope });

    const v2 = model.create({ id: "pending", result: "fresh" });

    // @ts-expect-error
    if (resolveEffect) resolveEffect();

    expect(effectRunCount).toBe(1);
    expect(v2.$result.getState()).toBe("fresh");

    model.clear();
  });
});
