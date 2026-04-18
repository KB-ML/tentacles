import { describe, expect, it } from "vitest";
import {
  allSettled,
  combine,
  createEffect,
  createEvent,
  createStore,
  fork,
  sample,
  type StoreWritable,
} from "effector";
import { createContract, createPropsContract, createViewModel } from "../index";

// ═══════════════════════════════════════════════════════════════════════════════
// BASIC: createViewModel + instantiate
// ═══════════════════════════════════════════════════════════════════════════════

describe("createViewModel: basic", () => {
  it("creates a ViewModel definition from contract chain", () => {
    const contract = createContract()
      .store("search", (s) => s<string>().default(""))
      .store("page", (s) => s<number>().default(0));
    const vm = createViewModel({ contract });

    expect(vm).toBeDefined();
  });

  it("instantiate returns shape, lifecycle, and id", () => {
    const contract = createContract()
      .store("count", (s) => s<number>().default(0));
    const vm = createViewModel({ contract });

    const instance = vm.instantiate();
    expect(instance.shape).toBeDefined();
    expect(instance.lifecycle).toBeDefined();
    expect(typeof instance.id).toBe("number");
  });

  it("instances get incrementing IDs", () => {
    const contract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({ contract });

    const a = vm.instantiate();
    const b = vm.instantiate();
    expect(b.id).toBe(a.id + 1);
  });

  it("createViewModel without config works", () => {
    const contract = createContract()
      .store("value", (s) => s<string>().default("hello"));
    const vm = createViewModel({ contract });

    const instance = vm.instantiate();
    const store = instance.shape.$value as StoreWritable<string>;
    expect(store.getState()).toBe("hello");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// STORES: contract stores get correct defaults
// ═══════════════════════════════════════════════════════════════════════════════

describe("createViewModel: contract stores", () => {
  it("stores get static defaults", () => {
    const contract = createContract()
      .store("search", (s) => s<string>().default(""))
      .store("page", (s) => s<number>().default(0))
      .store("active", (s) => s<boolean>().default(true));
    const vm = createViewModel({ contract });

    const { shape } = vm.instantiate();
    expect((shape.$search as StoreWritable<string>).getState()).toBe("");
    expect((shape.$page as StoreWritable<number>).getState()).toBe(0);
    expect((shape.$active as StoreWritable<boolean>).getState()).toBe(true);
  });

  it("stores get factory defaults", () => {
    const contract = createContract()
      .store("prefix", (s) => s<string>().default("todo"))
      .store("label", (s) => s<string>().default((data) => `${data.prefix}-list`));
    const vm = createViewModel({ contract });

    const { shape } = vm.instantiate();
    expect((shape.$label as StoreWritable<string>).getState()).toBe("todo-list");
  });

  it("event fields are created as events", () => {
    const contract = createContract()
      .store("count", (s) => s<number>().default(0))
      .event("increment", (e) => e<void>());
    const vm = createViewModel({ contract });

    const { shape } = vm.instantiate();
    const count = shape.$count as StoreWritable<number>;
    const increment = shape.increment as ReturnType<typeof createEvent>;

    expect(count.getState()).toBe(0);
    expect(typeof increment).toBe("function");
  });

  it("derived stores work", () => {
    const contract = createContract()
      .store("count", (s) => s<number>().default(5))
      .derived("doubled", (s) => s.$count.map((n) => n * 2));
    const vm = createViewModel({ contract });

    const { shape } = vm.instantiate();
    const doubled = shape.$doubled as StoreWritable<number>;
    expect(doubled.getState()).toBe(10);
  });

  it("resetOn wiring works", () => {
    const contract = createContract()
      .store("category", (s) => s<string>().default("all"))
      .store("page", (s) => s<number>().default(0).resetOn("category"));
    const vm = createViewModel({ contract });

    const { shape } = vm.instantiate();
    const category = shape.$category as StoreWritable<string>;
    const page = shape.$page as StoreWritable<number>;

    // Manually set page
    const setPage = createEvent<number>();
    page.on(setPage, (_, v) => v);
    setPage(5);
    expect(page.getState()).toBe(5);

    // Change category → page resets to default (0)
    const setCategory = createEvent<string>();
    category.on(setCategory, (_, v) => v);
    setCategory("work");
    expect(page.getState()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FN: builder function receives stores and context
// ═══════════════════════════════════════════════════════════════════════════════

describe("createViewModel: fn", () => {
  it("fn receives contract stores", () => {
    const contract = createContract()
      .store("count", (s) => s<number>().default(0))
      .event("inc", (e) => e<void>());
    const vm = createViewModel({
      contract,
      fn: (stores) => {
          const $count = stores.$count as StoreWritable<number>;
          const inc = stores.inc as ReturnType<typeof createEvent>;
          $count.on(inc, (n) => n + 1);
          return { $count, inc };
        },
      });

    const { shape } = vm.instantiate();
    expect(shape.$count.getState()).toBe(0);
    shape.inc();
    expect(shape.$count.getState()).toBe(1);
  });

  it("fn receives lifecycle events in context", () => {
    let receivedMounted = false;
    let receivedUnmounted = false;

    const contract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract,
      fn: (_stores, ctx) => {
        receivedMounted = "mounted" in ctx;
        receivedUnmounted = "unmounted" in ctx;
        return {};
      },
    });

    vm.instantiate();
    expect(receivedMounted).toBe(true);
    expect(receivedUnmounted).toBe(true);
  });

  it("fn can wire sample with mounted event", () => {
    let fetched = false;

    const contract = createContract()
      .store("data", (s) => s<string>().default(""));
    const vm = createViewModel({
      contract,
      fn: (_stores, ctx) => {
          const fetchFx = createEffect(() => {
            fetched = true;
          });
          sample({ clock: ctx.mounted, target: fetchFx });
          return {};
        },
      });

    const { lifecycle } = vm.instantiate();
    expect(fetched).toBe(false);

    lifecycle.mount();
    expect(fetched).toBe(true);
  });

  it("fn can wire sample with unmounted event", () => {
    let cleaned = false;

    const contract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract,
      fn: (_stores, ctx) => {
          const cleanFx = createEffect(() => {
            cleaned = true;
          });
          sample({ clock: ctx.unmounted, target: cleanFx });
          return {};
        },
      });

    const { lifecycle } = vm.instantiate();
    lifecycle.mount();
    expect(cleaned).toBe(false);

    lifecycle.destroy();
    expect(cleaned).toBe(true);
  });

  it("fn receives props in context", () => {
    const contract = createContract()
      .store("n", (s) => s<number>().default(0));
    const propsContract = createPropsContract()
      .store("categoryId", (s) => s<string | null>())
      .event("onDelete", (e) => e<string>());
    const vm = createViewModel({
      contract,
      props: propsContract,
      fn: (_stores, ctx) => {
        return { props: ctx.props };
      },
    });

    const $cat = createStore<string | null>("work");
    const onDelete = createEvent<string>();

    const { shape } = vm.instantiate({ categoryId: $cat, onDelete });
    // Store props are auto-prefixed with `$` inside `ctx.props`; event
    // props keep their raw name.
    expect((shape.props as Record<string, unknown>).$categoryId).toBe($cat);
    expect((shape.props as Record<string, unknown>).onDelete).toBe(onDelete);
  });

  it("fn return value becomes shape", () => {
    const contract = createContract()
      .store("a", (s) => s<number>().default(1))
      .store("b", (s) => s<number>().default(2))
      .derived("sum", (s) => combine(s.$a, s.$b, (a, b) => a + b));
    const vm = createViewModel({
      contract,
      fn: (stores) => {
          return {
            $sum: stores.$sum,
            extra: (stores.$a as StoreWritable<number>).map((n) => n * 10),
          };
        },
      });

    const { shape } = vm.instantiate();
    expect((shape.$sum as StoreWritable<number>).getState()).toBe(3);
    expect((shape.extra as StoreWritable<number>).getState()).toBe(10);
  });

  it("without fn, shape is the raw stores", () => {
    const contract = createContract()
      .store("value", (s) => s<string>().default("hi"));
    const vm = createViewModel({ contract });

    const { shape } = vm.instantiate();
    expect((shape.$value as StoreWritable<string>).getState()).toBe("hi");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE: mount/unmount via lifecycle object
// ═══════════════════════════════════════════════════════════════════════════════

describe("createViewModel: lifecycle", () => {
  it("full mount → destroy flow", () => {
    const order: string[] = [];

    const contract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract,
      fn: (_stores, ctx) => {
        const mountFx = createEffect(() => order.push("mounted"));
        const unmountFx = createEffect(() => order.push("unmounted"));
        sample({ clock: ctx.mounted, target: mountFx });
        sample({ clock: ctx.unmounted, target: unmountFx });
        return {};
      },
    });

    const { lifecycle } = vm.instantiate();
    lifecycle.mount();
    lifecycle.destroy();
    expect(order).toEqual(["mounted", "unmounted"]);
  });

  it("multiple instances have independent lifecycles", () => {
    const contract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract,
      fn: (_stores, ctx) => {
        return { $mounted: ctx.$mounted };
      },
    });

    const a = vm.instantiate();
    const b = vm.instantiate();

    a.lifecycle.mount();
    expect(a.shape.$mounted.getState()).toBe(true);
    expect(b.shape.$mounted.getState()).toBe(false);

    b.lifecycle.mount();
    expect(b.shape.$mounted.getState()).toBe(true);

    a.lifecycle.destroy();
    // a is destroyed, b still alive
    expect(b.shape.$mounted.getState()).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SSR: scoped instantiation
// ═══════════════════════════════════════════════════════════════════════════════

describe("createViewModel: SSR", () => {
  it("stores work with fork scopes", async () => {
    const contract = createContract()
      .store("count", (s) => s<number>().default(0))
      .event("inc", (e) => e<void>());
    const vm = createViewModel({
      contract,
      fn: (stores) => {
        stores.$count.on(stores.inc, (n) => n + 1);
        return { $count: stores.$count, inc: stores.inc };
      },
    });

    const { shape } = vm.instantiate();
    const scope = fork();

    await allSettled(shape.inc, { scope });
    await allSettled(shape.inc, { scope });

    expect(scope.getState(shape.$count)).toBe(2);
    expect(shape.$count.getState()).toBe(0); // global unchanged
  });

  it("scoped mount/destroy", async () => {
    const contract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract,
      fn: (_stores, ctx) => {
        return { $mounted: ctx.$mounted };
      },
    });

    const { shape, lifecycle } = vm.instantiate();
    const scope = fork();

    await lifecycle.mount(scope);
    expect(scope.getState(shape.$mounted)).toBe(true);
    expect(shape.$mounted.getState()).toBe(false);

    await lifecycle.destroy(scope);
    expect(scope.getState(shape.$mounted)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY: all nodes cleaned on destroy
// ═══════════════════════════════════════════════════════════════════════════════

function measureHeap(): number {
  global.gc?.();
  global.gc?.();
  return process.memoryUsage().heapUsed;
}

describe("createViewModel: memory", () => {
  it("bounded heap on repeated instantiate/destroy", () => {
    const contract = createContract()
      .store("count", (s) => s<number>().default(0))
      .store("search", (s) => s<string>().default(""))
      .event("inc", (e) => e<void>())
      .derived("doubled", (s) => s.$count.map((n) => n * 2));
    const vm = createViewModel({
      contract,
      fn: (stores, ctx) => {
          const $count = stores.$count as StoreWritable<number>;
          const inc = stores.inc as ReturnType<typeof createEvent>;
          $count.on(inc, (n) => n + 1);

          const fetchFx = createEffect(() => {});
          sample({ clock: ctx.mounted, target: fetchFx });

          const $total = combine($count, stores.$doubled as StoreWritable<number>, (a, b) => a + b);
          return { $count, inc, $total };
        },
      });

    // Warmup
    for (let i = 0; i < 50; i++) {
      const inst = vm.instantiate();
      inst.lifecycle.mount();
      inst.lifecycle.destroy();
    }

    const heapBefore = measureHeap();

    for (let i = 0; i < 500; i++) {
      const inst = vm.instantiate();
      inst.lifecycle.mount();
      inst.lifecycle.destroy();
    }

    const heapAfter = measureHeap();
    const growthMB = (heapAfter - heapBefore) / 1024 / 1024;
    expect(growthMB).toBeLessThan(5);
  });

  it("sample/combine inside fn don't leak after destroy", () => {
    const externalTrigger = createEvent<void>();

    const contract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract,
      fn: (stores) => {
          const $n = stores.$n as StoreWritable<number>;
          sample({ clock: externalTrigger, fn: () => 1, target: $n });
          return { $n };
        },
      });

    const inst = vm.instantiate();
    externalTrigger();
    expect(inst.shape.$n.getState()).toBe(1);

    inst.lifecycle.destroy();

    // After destroy, the sample wiring should be dead
    // Create a new instance to verify external trigger doesn't affect destroyed stores
    const inst2 = vm.instantiate();
    externalTrigger();
    expect(inst2.shape.$n.getState()).toBe(1);

    inst2.lifecycle.destroy();
  });
});
