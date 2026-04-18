import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import {
  allSettled,
  fork,
  serialize,
  sample,
  combine,
  createEffect,
  createEvent,
  createStore,
  merge,
  split,
} from "effector";

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY LEAK CRUSH TESTS
//
// Strategy: measure actual heap growth via process.memoryUsage().heapUsed
// after forcing GC with global.gc?.().  If cleanup works, replacing N instances
// should have bounded heap growth (only the latest instance is alive).
// If it leaks, heap grows linearly with N.
//
// We also use behavioral checks: wire watcher counters inside builders and
// verify that only the latest instance's watchers fire after replacements.
// ─────────────────────────────────────────────────────────────────────────────

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. HEAP-BASED: sample / combine / merge / split / map / effects
// ─────────────────────────────────────────────────────────────────────────────

describe("MEMORY: heap growth on instance replacement", () => {
  it("sample() inside builder — bounded heap on replace", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("increment", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $count, increment }) => {
        $count.on(increment, (n) => n + 1);
        const doubled = $count.map((n) => n * 2);
        sample({
          clock: increment,
          source: doubled,
          fn: (d) => d,
          target: createEvent<number>(),
        });
        return { $count, increment };
      },
    });

    // Warmup — let JIT/GC settle
    for (let i = 0; i < 50; i++) {
      model.create({ id: "warmup-sample", count: i });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.create({ id: "sample-leak", count: i });
    }
    const heapAfter = measureHeap();

    const growthBytes = heapAfter - heapBefore;
    const growthMB = growthBytes / 1024 / 1024;
    console.log(`[sample] heap growth over 500 replacements: ${growthMB.toFixed(2)} MB`);
    // Bounded: should be well under 5 MB for 500 replacements
    expect(growthMB).toBeLessThan(5);
  });

  it("combine() inside builder — bounded heap on replace", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("a", (s) => s<number>())
      .store("b", (s) => s<number>())
      .event("sync", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $a, $b, sync }) => {
        const sum = combine($a, $b, (x, y) => x + y);
        sample({ clock: sync, source: sum, fn: (s) => s, target: createEvent<number>() });
        return { $a, $b, sync };
      },
    });

    for (let i = 0; i < 50; i++) {
      model.create({ id: "warmup-combine", a: i, b: i });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.create({ id: "combine-leak", a: i, b: i });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[combine] heap growth over 500 replacements: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(5);
  });

  it("merge() inside builder — bounded heap on replace", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<string>())
      .event("a", (e) => e<string>())
      .event("b", (e) => e<string>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $value, a, b }) => {
        const merged = merge([a, b]);
        $value.on(merged, (_, v) => v);
        return { $value, a, b };
      },
    });

    for (let i = 0; i < 50; i++) {
      model.create({ id: "warmup-merge", value: "" });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.create({ id: "merge-leak", value: "" });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[merge] heap growth over 500 replacements: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(5);
  });

  it("split() inside builder — bounded heap on replace", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<number>())
      .event("input", (e) => e<number>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $value, input }) => {
        const { positive, negative } = split(input, {
          positive: (n: number) => n > 0,
          negative: (n: number) => n < 0,
        });
        $value.on(positive, (_, n) => n);
        $value.on(negative, (_, n) => n);
        return { $value, input };
      },
    });

    for (let i = 0; i < 50; i++) {
      model.create({ id: "warmup-split", value: 0 });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.create({ id: "split-leak", value: 0 });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[split] heap growth over 500 replacements: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(5);
  });

  it("store.map() inside builder — bounded heap on replace", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("inc", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $count, inc }) => {
        $count.on(inc, (n) => n + 1);
        const _doubled = $count.map((n) => n * 2);
        const _tripled = $count.map((n) => n * 3);
        const _label = $count.map((n) => `count: ${n}`);
        return { $count, inc };
      },
    });

    for (let i = 0; i < 50; i++) {
      model.create({ id: "warmup-map", count: 0 });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.create({ id: "map-leak", count: 0 });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[store.map] heap growth over 500 replacements: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(5);
  });

  it("createEffect() inside builder — bounded heap on replace", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("data", (s) => s<string>())
      .event("fetch", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $data, fetch }) => {
        const fx = createEffect(async () => "result");
        sample({ clock: fetch, target: fx });
        $data.on(fx.doneData, (_, result) => result);
        return { $data, fetch };
      },
    });

    for (let i = 0; i < 50; i++) {
      model.create({ id: "warmup-effect", data: "" });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.create({ id: "effect-leak", data: "" });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[effect] heap growth over 500 replacements: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(5);
  });

  it("heavy builder (3 effects + combines + samples) — bounded heap", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("status", (s) => s<string>())
      .event("trigger", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $status, trigger }) => {
        const fetchUser = createEffect(async () => ({ name: "Alice" }));
        const fetchPosts = createEffect(async () => [{ id: 1 }]);
        const fetchComments = createEffect(async () => [{ text: "hi" }]);

        sample({ clock: trigger, target: fetchUser });
        sample({ clock: fetchUser.doneData, target: fetchPosts });
        sample({ clock: fetchPosts.doneData, target: fetchComments });

        const loading = combine(
          fetchUser.pending,
          fetchPosts.pending,
          fetchComments.pending,
          (a, b, c) => a || b || c,
        );

        $status.on(loading, (_, isLoading) => (isLoading ? "loading" : "done"));
        return { $status, trigger };
      },
    });

    for (let i = 0; i < 20; i++) {
      model.create({ id: "warmup-heavy", status: "idle" });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 200; i++) {
      model.create({ id: "heavy-fx", status: "idle" });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[heavy effects] heap growth over 200 replacements: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. BEHAVIORAL: watchers from old instances must not fire
// ─────────────────────────────────────────────────────────────────────────────

describe("MEMORY: behavioral — old watchers disconnected", () => {
  it("watch() callbacks from replaced instances do not fire", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("inc", (e) => e<void>())
      .pk("id");

    let watchCallCount = 0;

    const model = createModel({
      contract,
      fn: ({ $count, inc }) => {
        $count.on(inc, (n) => n + 1);
        $count.watch(() => {
          watchCallCount++;
        });
        return { $count, inc };
      },
    });

    // Create + replace 50 times
    for (let i = 0; i < 50; i++) {
      model.create({ id: "watch-leak", count: 0 });
    }

    watchCallCount = 0;
    const instance = model.create({ id: "watch-leak", count: 0 });

    // Only the latest instance's watcher should fire
    instance.inc();
    // store.watch fires on subscribe (1) + on update (1) = 2
    console.log(`[watch] callbacks after 50 replacements + 1 inc: ${watchCallCount}`);
    expect(watchCallCount).toBeLessThanOrEqual(3);
  });

  it("sample() targets from replaced instances do not fire", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("inc", (e) => e<void>())
      .pk("id");

    let sampleFired = 0;

    const model = createModel({
      contract,
      fn: ({ $count, inc }) => {
        $count.on(inc, (n) => n + 1);
        const target = createEvent<number>();
        target.watch(() => sampleFired++);
        sample({ clock: inc, source: $count, target });
        return { $count, inc };
      },
    });

    for (let i = 0; i < 50; i++) {
      model.create({ id: "sample-watch", count: 0 });
    }

    sampleFired = 0;
    const instance = model.create({ id: "sample-watch", count: 0 });
    instance.inc();

    console.log(`[sample target] fires after 50 replacements + 1 inc: ${sampleFired}`);
    // Only latest instance's sample should fire: 1
    expect(sampleFired).toBe(1);
  });

  it("effects from replaced instances do not trigger", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("value", (s) => s<string>())
      .event("trigger", (e) => e<void>())
      .pk("id");

    let effectRuns = 0;

    const model = createModel({
      contract,
      fn: ({ $value, trigger }) => {
        const fx = createEffect(async () => {
          effectRuns++;
          return "done";
        });
        sample({ clock: trigger, target: fx });
        $value.on(fx.doneData, (_, r) => r);
        return { $value, trigger };
      },
    });

    for (let i = 0; i < 20; i++) {
      model.create({ id: "fx-leak", value: "" });
    }

    effectRuns = 0;
    const instance = model.create({ id: "fx-leak", value: "" });
    instance.trigger();

    // Only latest instance's effect should run
    console.log(`[effect] runs after 20 replacements + 1 trigger: ${effectRuns}`);
    expect(effectRuns).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DELETE + RE-CREATE CYCLES
// ─────────────────────────────────────────────────────────────────────────────

describe("MEMORY: delete + re-create cycles", () => {
  it("repeated delete/create cycles have bounded heap", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("inc", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $count, inc }) => {
        $count.on(inc, (n) => n + 1);
        const doubled = $count.map((n) => n * 2);
        sample({ clock: inc, source: doubled, fn: (d) => d, target: createEvent<number>() });
        return { $count, inc };
      },
    });

    for (let i = 0; i < 50; i++) {
      model.create({ id: "warmup-del", count: 0 });
      model.delete("warmup-del");
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 500; i++) {
      model.create({ id: "del-cycle", count: 0 });
      model.delete("del-cycle");
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[delete cycle] heap growth over 500 cycles: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. COMPLEX BUILDER — realistic model with many derived units
// ─────────────────────────────────────────────────────────────────────────────

describe("MEMORY: complex builder", () => {
  it("complex model with effects + combines + samples — bounded heap", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("name", (s) => s<string>())
      .store("age", (s) => s<number>())
      .store("email", (s) => s<string>())
      .event("setName", (e) => e<string>())
      .event("setAge", (e) => e<number>())
      .event("setEmail", (e) => e<string>())
      .event("submit", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $name, $age, $email, setName, setAge, setEmail, submit }) => {
        $name.on(setName, (_, v) => v);
        $age.on(setAge, (_, v) => v);
        $email.on(setEmail, (_, v) => v);

        const _isAdult = $age.map((a) => a >= 18);
        const displayName = combine($name, $age, (n, a) => `${n} (${a})`);
        const _emailDomain = $email.map((e) => e.split("@")[1] ?? "");
        const _isValid = combine($name, $email, (n, e) => n.length > 0 && e.includes("@"));
        const formData = combine({ name: $name, age: $age, email: $email });
        const _summary = combine(displayName, _emailDomain, _isValid, (d, e, v) => `${d} [${e}] valid=${v}`);

        const submitFx = createEffect(async (data: { name: string; age: number; email: string }) => ({ ok: true, data }));
        const validateFx = createEffect(async (em: string) => em.includes("@"));
        const logFx = createEffect(async (_msg: string) => {});

        sample({ clock: submit, source: formData, target: submitFx });
        sample({ clock: setEmail, target: validateFx });
        sample({ clock: submitFx.done, fn: ({ params }) => `Submitted: ${params.name}`, target: logFx });
        sample({ clock: validateFx.doneData, filter: (valid) => !valid, fn: () => "invalid", target: logFx });

        split($age, {
          child: (a: number) => a < 13,
          teen: (a: number) => a >= 13 && a < 18,
          adult: (a: number) => a >= 18,
        });

        return { $name, $age, $email, setName, setAge, setEmail, submit };
      },
    });

    for (let i = 0; i < 20; i++) {
      model.create({ id: "warmup-complex", name: "A", age: 25, email: "a@b.com" });
    }

    const heapBefore = measureHeap();
    for (let i = 0; i < 200; i++) {
      model.create({ id: "complex-form", name: "Alice", age: 25, email: "alice@example.com" });
    }
    const heapAfter = measureHeap();

    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    console.log(`[complex builder] heap growth over 200 replacements: ${growthMB.toFixed(2)} MB`);
    expect(growthMB).toBeLessThan(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. SCOPE ISOLATION AFTER REPLACE — correctness
// ─────────────────────────────────────────────────────────────────────────────

describe("MEMORY: correctness after replace", () => {
  it("new instance works correctly in fork scope after replace", async () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("items", (s) => s<string[]>())
      .event("add", (e) => e<string>())
      .event("clear", (e) => e<void>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $items, add, clear }) => {
        $items.on(add, (list, item) => [...list, item]);
        $items.on(clear, () => []);
        const _count = $items.map((list) => list.length);
        sample({
          clock: add,
          source: _count,
          fn: (c, item) => `Added "${item}", now ${c + 1} items`,
          target: createEvent<string>(),
        });
        return { $items, add, clear };
      },
    });

    model.create({ id: "correctness", items: [] });
    const v2 = model.create({ id: "correctness", items: ["x"] });

    expect(v2.$items.getState()).toEqual(["x"]);

    const scope = fork();
    await allSettled(v2.add, { scope, params: "z" });
    expect(scope.getState(v2.$items)).toEqual(["x", "z"]);

    const values = serialize(scope);
    const hydrated = fork({ values });
    expect(hydrated.getState(v2.$items)).toEqual(["x", "z"]);
  });

  it("replace does not corrupt other instances of the same model", async () => {
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

    const alice = model.create({ id: "alice", count: 0 });
    const bob = model.create({ id: "bob", count: 100 });

    alice.inc();
    bob.inc();
    expect(bob.$count.getState()).toBe(101);

    // Replace alice — bob must be unaffected
    const alice2 = model.create({ id: "alice", count: 50 });
    expect(alice2.$count.getState()).toBe(50);
    expect(bob.$count.getState()).toBe(101);

    bob.inc();
    expect(bob.$count.getState()).toBe(102);

    // fork() inherits $dataMap default state from the time of last create().
    // syncDataMapDefault() runs on create, not on every mutation, so the fork
    // captures $dataMap as of the alice2 create (bob=101, alice2=50).
    // Scoped allSettled increments from those snapshot values.
    const scope = fork();
    await allSettled(alice2.inc, { scope });
    await allSettled(bob.inc, { scope });
    expect(scope.getState(alice2.$count)).toBe(51);
    expect(scope.getState(bob.$count)).toBe(102);
  });
});
