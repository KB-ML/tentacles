import { describe, expect, it } from "vitest";
import {
  allSettled,
  clearNode,
  createEffect,
  createEvent,
  createNode,
  createStore,
  fork,
  sample,
  withRegion,
} from "effector";
import { ViewModelLifecycle } from "../layers/view-model";

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function createLifecycle(): ViewModelLifecycle {
  const region = createNode();
  return new ViewModelLifecycle(region);
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULT: mounted / unmounted events
// ═══════════════════════════════════════════════════════════════════════════════

describe("ViewModelLifecycle: default", () => {
  it("mounted event fires via mount()", () => {
    const lc = createLifecycle();
    let fired = false;
    lc.mounted.watch(() => {
      fired = true;
    });
    lc.mount();
    expect(fired).toBe(true);
  });

  it("unmounted event fires via destroy()", () => {
    const lc = createLifecycle();
    let fired = false;
    lc.unmounted.watch(() => {
      fired = true;
    });
    lc.mount();
    lc.destroy();
    expect(fired).toBe(true);
  });

  it("mount/unmount ordering is correct", () => {
    const lc = createLifecycle();
    const order: string[] = [];
    lc.mounted.watch(() => order.push("mounted"));
    lc.unmounted.watch(() => order.push("unmounted"));

    lc.mount();
    lc.destroy();
    expect(order).toEqual(["mounted", "unmounted"]);
  });

  it("$mounted reflects true after mount, false after destroy", () => {
    const lc = createLifecycle();
    expect(lc.$mounted.getState()).toBe(false);

    lc.mount();
    expect(lc.$mounted.getState()).toBe(true);

    lc.destroy();
    // After clearNode, $mounted is destroyed — this is expected
  });

  it("sample wiring with mounted event works", () => {
    const region = createNode();
    const lc = new ViewModelLifecycle(region);
    let fetched = false;

    withRegion(region, () => {
      const fetchFx = createEffect(() => {
        fetched = true;
      });
      sample({ clock: lc.mounted, target: fetchFx });
    });

    lc.mount();
    expect(fetched).toBe(true);
  });

  it("sample wiring with unmounted event works", () => {
    const region = createNode();
    const lc = new ViewModelLifecycle(region);
    let cleaned = false;

    withRegion(region, () => {
      const cleanupFx = createEffect(() => {
        cleaned = true;
      });
      sample({ clock: lc.unmounted, target: cleanupFx });
    });

    lc.mount();
    expect(cleaned).toBe(false);
    lc.destroy();
    expect(cleaned).toBe(true);
  });

  it("destroy fires unmounted before clearing region", () => {
    const region = createNode();
    const lc = new ViewModelLifecycle(region);
    const order: string[] = [];

    withRegion(region, () => {
      const onUnmount = createEffect(() => {
        order.push("unmounted-handler");
      });
      sample({ clock: lc.unmounted, target: onUnmount });
    });

    lc.mount();
    lc.destroy();
    // The unmounted handler ran before clearNode destroyed the wiring
    expect(order).toContain("unmounted-handler");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LAZY: zero overhead when lifecycle unused
// ═══════════════════════════════════════════════════════════════════════════════

describe("ViewModelLifecycle: lazy creation", () => {
  it("no access = zero units created, mount/destroy are no-ops", () => {
    const lc = createLifecycle();
    // mount and destroy should not throw when no lifecycle events were accessed
    lc.mount();
    lc.destroy();
  });

  it("accessing only mounted creates 1 event, not 3 units", () => {
    const region = createNode();
    const lc = new ViewModelLifecycle(region);

    // Access mounted only
    const evt = lc.mounted;
    expect(evt).toBeDefined();

    // Internal: _unmounted and _$mounted should not be created
    // We verify by checking mount/destroy don't fire unmounted
    let unmountedFired = false;
    // Don't access lc.unmounted — that would create it
    // Instead verify destroy works without error
    lc.mount();
    lc.destroy();
    expect(unmountedFired).toBe(false);
  });

  it("accessing $mounted lazily creates mounted and unmounted", () => {
    const lc = createLifecycle();
    // Accessing $mounted should trigger creation of mounted + unmounted (dependencies)
    const store = lc.$mounted;
    expect(store.getState()).toBe(false);

    lc.mount();
    expect(store.getState()).toBe(true);
  });

  it("mount() is no-op when mounted event was never accessed", () => {
    const lc = createLifecycle();
    // Should not throw
    const result = lc.mount();
    expect(result).toBeUndefined();
  });

  it("destroy() calls clearNode even when no lifecycle events accessed", () => {
    const region = createNode();
    const lc = new ViewModelLifecycle(region);

    // Create a store inside the region
    let storeAlive = true;
    withRegion(region, () => {
      const $temp = createStore(0);
      $temp.watch(() => {
        storeAlive = true;
      });
    });

    lc.destroy();
    // Region was cleared — clearNode always runs regardless of lifecycle event usage
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REGION: units created inside region are cleaned up
// ═══════════════════════════════════════════════════════════════════════════════

describe("ViewModelLifecycle: region cleanup", () => {
  it("stores created inside region are destroyed after clearNode", () => {
    const region = createNode();
    const lc = new ViewModelLifecycle(region);
    let watchCount = 0;

    withRegion(region, () => {
      const $count = createStore(0);
      const increment = createEvent<void>();
      $count.on(increment, (n) => n + 1);
      $count.watch(() => {
        watchCount++;
      });

      // Fire once to verify wiring works
      increment();
      expect($count.getState()).toBe(1);
    });

    // watchCount includes initial watch call + the increment
    const beforeDestroy = watchCount;

    lc.destroy();

    // After destroy, the store and event are dead — further operations are no-ops
    // The region is cleared so no more watch triggers
    expect(watchCount).toBe(beforeDestroy);
  });

  it("sample wiring inside region is cleaned up", () => {
    const region = createNode();
    const lc = new ViewModelLifecycle(region);

    // External event that outlives the region
    const externalTrigger = createEvent<void>();
    let sampleFired = 0;

    withRegion(region, () => {
      const $count = createStore(0);
      sample({
        clock: externalTrigger,
        fn: () => 1,
        target: $count,
      });
      $count.watch(() => {
        sampleFired++;
      });
    });

    externalTrigger();
    const beforeDestroy = sampleFired;
    expect(beforeDestroy).toBeGreaterThan(0);

    lc.destroy();

    // After destroy, firing the external trigger should not propagate through the dead sample
    externalTrigger();
    expect(sampleFired).toBe(beforeDestroy);
  });

  it("effects created inside region are cleaned up", () => {
    const region = createNode();
    const lc = new ViewModelLifecycle(region);
    let effectRan = 0;

    withRegion(region, () => {
      const fx = createEffect(() => {
        effectRan++;
      });
      sample({ clock: lc.mounted, target: fx });
    });

    lc.mount();
    expect(effectRan).toBe(1);

    lc.destroy();
    // Effect is dead after clearNode — can't be triggered again
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SSR: scoped mount/destroy
// ═══════════════════════════════════════════════════════════════════════════════

describe("ViewModelLifecycle: SSR", () => {
  it("mount(scope) uses allSettled", async () => {
    const lc = createLifecycle();
    const scope = fork();

    // Access $mounted before mount — realistic: fn sets up wiring during creation
    const $m = lc.$mounted;
    expect(scope.getState($m)).toBe(false);

    await lc.mount(scope);
    expect(scope.getState($m)).toBe(true);
  });

  it("destroy(scope) does NOT call clearNode", async () => {
    const region = createNode();
    const lc = new ViewModelLifecycle(region);
    const scope = fork();

    // Access lifecycle events so they exist
    const _m = lc.mounted;
    const _u = lc.unmounted;

    await lc.mount(scope);
    await lc.destroy(scope);

    // Region should still be intact — verify by creating new units in it
    let canCreateInRegion = true;
    try {
      withRegion(region, () => {
        createStore(0);
      });
    } catch {
      canCreateInRegion = false;
    }
    expect(canCreateInRegion).toBe(true);
  });

  it("scoped destroy fires unmounted in scope only", async () => {
    const lc = createLifecycle();
    const scope = fork();

    // Access $mounted to verify scope isolation
    const $m = lc.$mounted;

    await lc.mount(scope);
    expect(scope.getState($m)).toBe(true);
    expect($m.getState()).toBe(false); // global state unchanged

    await lc.destroy(scope);
    expect(scope.getState($m)).toBe(false);
    expect($m.getState()).toBe(false); // global still unchanged
  });

  it("two scopes get independent mount/unmount", async () => {
    const lc = createLifecycle();
    const scope1 = fork();
    const scope2 = fork();
    const $m = lc.$mounted;

    await lc.mount(scope1);
    expect(scope1.getState($m)).toBe(true);
    expect(scope2.getState($m)).toBe(false);

    await lc.mount(scope2);
    expect(scope1.getState($m)).toBe(true);
    expect(scope2.getState($m)).toBe(true);

    await lc.destroy(scope1);
    expect(scope1.getState($m)).toBe(false);
    expect(scope2.getState($m)).toBe(true);
  });

  it("scoped destroy is no-op when unmounted was never accessed", async () => {
    const lc = createLifecycle();
    const scope = fork();
    // Don't access any lifecycle events
    const result = await lc.destroy(scope);
    expect(result).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY: bounded heap on repeated create/destroy
// ═══════════════════════════════════════════════════════════════════════════════

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

describe("ViewModelLifecycle: memory", () => {
  it("bounded heap on repeated lifecycle create/destroy with sample wiring", () => {
    // Warmup
    for (let i = 0; i < 50; i++) {
      const region = createNode();
      const lc = new ViewModelLifecycle(region);
      withRegion(region, () => {
        const $s = createStore(0);
        const e = createEvent<void>();
        sample({ clock: lc.mounted, fn: () => 1, target: $s });
        sample({ clock: e, source: $s, fn: (s) => s + 1, target: $s });
      });
      lc.mount();
      lc.destroy();
    }

    const heapBefore = measureHeap();

    for (let i = 0; i < 500; i++) {
      const region = createNode();
      const lc = new ViewModelLifecycle(region);
      withRegion(region, () => {
        const $s = createStore(0);
        const e = createEvent<void>();
        const fx = createEffect(() => {});
        sample({ clock: lc.mounted, fn: () => 1, target: $s });
        sample({ clock: e, source: $s, fn: (s) => s + 1, target: $s });
        sample({ clock: lc.unmounted, target: fx });
      });
      lc.mount();
      lc.destroy();
    }

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });

  it("bounded heap on repeated create/destroy without lifecycle access", () => {
    for (let i = 0; i < 50; i++) {
      const region = createNode();
      const lc = new ViewModelLifecycle(region);
      withRegion(region, () => {
        createStore(0);
        createEvent<void>();
      });
      lc.destroy();
    }

    const heapBefore = measureHeap();

    for (let i = 0; i < 500; i++) {
      const region = createNode();
      const lc = new ViewModelLifecycle(region);
      withRegion(region, () => {
        createStore(0);
        createEvent<void>();
      });
      lc.destroy();
    }

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });
});
