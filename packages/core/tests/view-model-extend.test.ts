import { describe, expect, it } from "vitest";
import {
  allSettled,
  combine,
  createEvent,
  createStore,
  fork,
  sample,
  serialize,
  type EventCallable,
  type Store,
  type StoreWritable,
} from "effector";
import {
  createPropsContract,
  createViewContract,
  createViewModel,
} from "../index";

// =============================================================================
// EXTEND: basic
// =============================================================================

describe("viewModel extend: basic", () => {
  it("base fn runs, extended fn receives base shape via `base`", () => {
    const baseContract = createViewContract()
      .store("count", (s) => s<number>().default(0));
    const BaseVM = createViewModel({
      contract: baseContract,
      fn: (stores) => {
        const doubled = (stores.$count as StoreWritable<number>).map((n) => n * 2);
        return { $count: stores.$count, doubled };
      },
    });

    const ExtVM = BaseVM.extend({
      name: "ext",
      fn: (_stores, { base }) => {
        return { ...base, label: "extended" };
      },
    });

    const { shape } = ExtVM.instantiate();
    expect((shape.$count as StoreWritable<number>).getState()).toBe(0);
    expect((shape.doubled as Store<number>).getState()).toBe(0);
    expect(shape.label).toBe("extended");
  });

  it("extended VM has all stores (base + new)", () => {
    const baseContract = createViewContract()
      .store("page", (s) => s<number>().default(0));
    const BaseVM = createViewModel({ contract: baseContract });

    const extraContract = createViewContract()
      .store("search", (s) => s<string>().default(""));

    const ExtVM = BaseVM.extend({
      name: "ext-stores",
      contract: extraContract,
      fn: (stores, { base }) => {
        return {
          $page: base.$page,
          $search: stores.$search,
        };
      },
    });

    const { shape } = ExtVM.instantiate();
    expect((shape.$page as StoreWritable<number>).getState()).toBe(0);
    expect((shape.$search as StoreWritable<string>).getState()).toBe("");
  });

  it("fn receives only new stores in first arg", () => {
    const baseContract = createViewContract()
      .store("a", (s) => s<number>().default(1))
      .store("b", (s) => s<number>().default(2));
    const BaseVM = createViewModel({ contract: baseContract });

    let receivedKeys: string[] = [];

    const extraContract = createViewContract()
      .store("c", (s) => s<number>().default(3));

    const ExtVM = BaseVM.extend({
      name: "ext-split",
      contract: extraContract,
      fn: (stores, { base }) => {
        receivedKeys = Object.keys(stores);
        return { ...base, $c: stores.$c };
      },
    });

    ExtVM.instantiate();
    expect(receivedKeys).toEqual(["$c"]);
  });

  it("without extended fn, base shape passes through", () => {
    const baseContract = createViewContract()
      .store("count", (s) => s<number>().default(42));
    const BaseVM = createViewModel({
      contract: baseContract,
      fn: (stores) => ({ $count: stores.$count, tag: "base" }),
    });

    const ExtVM = BaseVM.extend({ name: "ext-passthrough" });

    const { shape } = ExtVM.instantiate();
    expect((shape.$count as StoreWritable<number>).getState()).toBe(42);
    expect(shape.tag).toBe("base");
  });

  it("extend without base fn works", () => {
    const baseContract = createViewContract()
      .store("x", (s) => s<number>().default(1));
    const BaseVM = createViewModel({ contract: baseContract });

    const extraContract = createViewContract()
      .store("y", (s) => s<number>().default(2));

    const ExtVM = BaseVM.extend({
      name: "ext-no-base-fn",
      contract: extraContract,
      fn: (stores, { base }) => ({
        $x: base.$x,
        $y: stores.$y,
      }),
    });

    const { shape } = ExtVM.instantiate();
    expect((shape.$x as StoreWritable<number>).getState()).toBe(1);
    expect((shape.$y as StoreWritable<number>).getState()).toBe(2);
  });

  it("throws on field name collision", () => {
    const baseContract = createViewContract()
      .store("page", (s) => s<number>().default(0));
    const BaseVM = createViewModel({ contract: baseContract });

    const collidingContract = createViewContract()
      .store("page", (s) => s<number>().default(1));

    expect(() => {
      BaseVM.extend({
        name: "ext-collision",
        contract: collidingContract,
      });
    }).toThrow('field "page" already exists in base');
  });

  it("throws on prop name collision", () => {
    const baseContract = createViewContract()
      .store("count", (s) => s<number>().default(0));
    const baseProps = createPropsContract().store("size", (s) => s<number>().optional());
    const BaseVM = createViewModel({
      contract: baseContract,
      props: baseProps,
    });

    const collidingProps = createPropsContract().store("size", (s) => s<number>().optional());

    expect(() => {
      BaseVM.extend({
        name: "ext-prop-collision",
        props: collidingProps,
      });
    }).toThrow('prop "size" already exists in base');
  });
});

// =============================================================================
// EXTEND: props
// =============================================================================

describe("viewModel extend: props", () => {
  it("extended fn receives all props (base + new)", () => {
    const $pageSize = createStore(10);
    const $showDone = createStore(true);

    const baseContract = createViewContract()
      .store("page", (s) => s<number>().default(0));
    const baseProps = createPropsContract().store("pageSize", (s) => s<number>());
    const BaseVM = createViewModel({
      contract: baseContract,
      props: baseProps,
      fn: (stores, { props }) => {
        const offset = combine(
          stores.$page as StoreWritable<number>,
          props.$pageSize as Store<number>,
          (p, s) => p * s,
        );
        return { $page: stores.$page, offset };
      },
    });

    const extraContract = createViewContract()
      .store("search", (s) => s<string>().default(""));
    const extraProps = createPropsContract().store("showDone", (s) => s<boolean>());

    const ExtVM = BaseVM.extend({
      name: "ext-props",
      contract: extraContract,
      props: extraProps,
      fn: (stores, { base, props }) => ({
        ...base,
        $search: stores.$search,
        showDone: props.$showDone,
      }),
    });

    const { shape } = ExtVM.instantiate({ pageSize: $pageSize, showDone: $showDone });
    expect((shape.offset as Store<number>).getState()).toBe(0);
    expect((shape.$search as StoreWritable<string>).getState()).toBe("");
    expect((shape.showDone as Store<boolean>).getState()).toBe(true);
  });
});

// =============================================================================
// EXTEND: multi-level
// =============================================================================

describe("viewModel extend: multi-level", () => {
  it("3-level extend chain: A -> B -> C", () => {
    const contractA = createViewContract()
      .store("x", (s) => s<number>().default(1));
    const A = createViewModel({
      contract: contractA,
      fn: (stores) => ({ $x: stores.$x, level: "a" }),
    });

    const contractB = createViewContract()
      .store("y", (s) => s<number>().default(2));
    const B = A.extend({
      name: "level-b",
      contract: contractB,
      fn: (stores, { base }) => ({
        ...base,
        $y: stores.$y,
        level: "b",
      }),
    });

    const contractC = createViewContract()
      .store("z", (s) => s<number>().default(3));
    const C = B.extend({
      name: "level-c",
      contract: contractC,
      fn: (stores, { base }) => ({
        ...base,
        $z: stores.$z,
        level: "c",
      }),
    });

    const { shape } = C.instantiate();
    expect((shape.$x as StoreWritable<number>).getState()).toBe(1);
    expect((shape.$y as StoreWritable<number>).getState()).toBe(2);
    expect((shape.$z as StoreWritable<number>).getState()).toBe(3);
    expect(shape.level).toBe("c");
  });

  it("each level's base fn logic executes", () => {
    const calls: string[] = [];

    const contractA = createViewContract()
      .store("a", (s) => s<number>().default(1));
    const A = createViewModel({
      contract: contractA,
      fn: (stores) => {
        calls.push("a");
        return { $a: stores.$a };
      },
    });

    const contractB = createViewContract()
      .store("b", (s) => s<number>().default(2));
    const B = A.extend({
      name: "exec-b",
      contract: contractB,
      fn: (stores, { base }) => {
        calls.push("b");
        return { ...base, $b: stores.$b };
      },
    });

    const contractC = createViewContract()
      .store("c", (s) => s<number>().default(3));
    const C = B.extend({
      name: "exec-c",
      contract: contractC,
      fn: (stores, { base }) => {
        calls.push("c");
        return { ...base, $c: stores.$c };
      },
    });

    calls.length = 0;
    C.instantiate();
    expect(calls).toEqual(["a", "b", "c"]);
  });

  it("effector logic wired in base fn works in extended VM", () => {
    const baseContract = createViewContract()
      .store("count", (s) => s<number>().default(0))
      .event("inc", (e) => e<void>());
    const Base = createViewModel({
      contract: baseContract,
      fn: (stores) => {
        (stores.$count as StoreWritable<number>).on(
          stores.inc as EventCallable<void>,
          (n) => n + 1,
        );
        return stores;
      },
    });

    const extraContract = createViewContract()
      .store("label", (s) => s<string>().default("hello"));

    const Ext = Base.extend({
      name: "wired-ext",
      contract: extraContract,
      fn: (stores, { base }) => ({
        ...base,
        $label: stores.$label,
      }),
    });

    const { shape } = Ext.instantiate();
    const count = shape.$count as StoreWritable<number>;
    const inc = shape.inc as EventCallable<void>;

    inc();
    inc();
    expect(count.getState()).toBe(2);
  });
});

// =============================================================================
// EXTEND: lifecycle
// =============================================================================

describe("viewModel extend: lifecycle", () => {
  it("mounted/unmounted events work on extended VM", () => {
    const baseContract = createViewContract()
      .store("n", (s) => s<number>().default(0));
    const Base = createViewModel({
      contract: baseContract,
      fn: (stores) => ({ $n: stores.$n as StoreWritable<number> }),
    });

    const Ext = Base.extend({
      name: "lc-ext",
      fn: (_stores, { base, mounted }) => {
        sample({
          clock: mounted as EventCallable<void>,
          fn: () => 1,
          target: base.$n,
        });
        return { $n: base.$n };
      },
    });

    const { shape, lifecycle } = Ext.instantiate();
    expect(shape.$n.getState()).toBe(0);

    lifecycle.mount();
    expect(shape.$n.getState()).toBe(1);
  });

  it("destroy cleans up all regions (base + extended)", () => {
    const baseContract = createViewContract()
      .store("a", (s) => s<number>().default(0));
    const Base = createViewModel({ contract: baseContract });

    const extraContract = createViewContract()
      .store("b", (s) => s<number>().default(0));

    const Ext = Base.extend({
      name: "cleanup-ext",
      contract: extraContract,
      fn: (stores, { base }) => ({ ...base, $b: stores.$b }),
    });

    const { lifecycle } = Ext.instantiate();
    // Should not throw
    lifecycle.destroy();
  });
});

// =============================================================================
// EXTEND: SSR
// =============================================================================

describe("viewModel extend: SSR", () => {
  it("fork scope works with extended VM", () => {
    const baseContract = createViewContract()
      .store("page", (s) => s<number>().default(0));
    const Base = createViewModel({ contract: baseContract });

    const extraContract = createViewContract()
      .store("search", (s) => s<string>().default(""));

    const Ext = Base.extend({
      name: "ssr-ext",
      contract: extraContract,
      fn: (stores, { base }) => ({
        $page: base.$page,
        $search: stores.$search,
      }),
    });

    const scope = fork();
    const { shape } = Ext.instantiate();

    allSettled(shape.$page as StoreWritable<number>, { scope, params: 3 });
    allSettled(shape.$search as StoreWritable<string>, { scope, params: "hello" });

    expect(scope.getState(shape.$page as StoreWritable<number>)).toBe(3);
    expect(scope.getState(shape.$search as StoreWritable<string>)).toBe("hello");
  });

  it("serialize/hydrate round-trip preserves all fields", () => {
    const baseContract = createViewContract()
      .store("count", (s) => s<number>().default(0));
    const Base = createViewModel({ contract: baseContract });

    const extraContract = createViewContract()
      .store("label", (s) => s<string>().default(""));

    const Ext = Base.extend({
      name: "hydrate-ext",
      contract: extraContract,
      fn: (stores, { base }) => ({
        $count: base.$count,
        $label: stores.$label,
      }),
    });

    const serverScope = fork();
    const { shape } = Ext.instantiate();

    allSettled(shape.$count as StoreWritable<number>, { scope: serverScope, params: 7 });
    allSettled(shape.$label as StoreWritable<string>, { scope: serverScope, params: "test" });

    const serialized = serialize(serverScope);
    const clientScope = fork({ values: serialized });

    expect(clientScope.getState(shape.$count as StoreWritable<number>)).toBe(7);
    expect(clientScope.getState(shape.$label as StoreWritable<string>)).toBe("test");
  });
});

// =============================================================================
// EXTEND: memory
// =============================================================================

describe("viewModel extend: memory", () => {
  it("bounded heap on repeated instantiate/destroy", () => {
    const baseContract = createViewContract()
      .store("a", (s) => s<number>().default(0))
      .store("b", (s) => s<string>().default(""));
    const Base = createViewModel({ contract: baseContract });

    const extraContract = createViewContract()
      .store("c", (s) => s<number>().default(0));

    const Ext = Base.extend({
      name: "mem-ext",
      contract: extraContract,
      fn: (stores, { base }) => ({ ...base, $c: stores.$c }),
    });

    // Warm up
    for (let i = 0; i < 100; i++) {
      const inst = Ext.instantiate();
      inst.lifecycle.destroy();
    }

    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 1000; i++) {
      const inst = Ext.instantiate();
      inst.lifecycle.destroy();
    }
    global.gc?.();
    const after = process.memoryUsage().heapUsed;

    const growth = after - before;
    expect(growth).toBeLessThan(2 * 1024 * 1024); // < 2MB
  });

  it("3-level extend: bounded heap on repeated instantiate/destroy", () => {
    const contractA = createViewContract()
      .store("x", (s) => s<number>().default(0));
    const A = createViewModel({ contract: contractA });

    const contractB = createViewContract()
      .store("y", (s) => s<number>().default(0));
    const B = A.extend({
      name: "mem-b",
      contract: contractB,
      fn: (stores, { base }) => ({ ...base, $y: stores.$y }),
    });

    const contractC = createViewContract()
      .store("z", (s) => s<number>().default(0));
    const C = B.extend({
      name: "mem-c",
      contract: contractC,
      fn: (stores, { base }) => ({ ...base, $z: stores.$z }),
    });

    // Warm up
    for (let i = 0; i < 100; i++) {
      const inst = C.instantiate();
      inst.lifecycle.destroy();
    }

    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 1000; i++) {
      const inst = C.instantiate();
      inst.lifecycle.destroy();
    }
    global.gc?.();
    const after = process.memoryUsage().heapUsed;

    const growth = after - before;
    expect(growth).toBeLessThan(2 * 1024 * 1024); // < 2MB
  });
});
