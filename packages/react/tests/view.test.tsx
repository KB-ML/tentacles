import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  createContract,
  createModel,
  createPropsContract,
  createViewContract,
  createViewModel,
} from "@kbml-tentacles/core";
import { createEffect, sample, type Store } from "effector";
import { useUnit } from "effector-react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Each, View, useModel, useView } from "../index";

afterEach(cleanup);

// ─── Helpers ───

function makeCounterVM() {
  const contract = createContract()
    .store("count", (s) => s<number>().default(0))
    .event("inc", (e) => e<void>());

  return createViewModel({
    contract,
    fn: ({ $count, inc }) => {
      $count.on(inc, (n) => n + 1);
      return { $count, inc };
    },
  });
}

function makePropsVM() {
  return createViewModel({
    contract: createContract().store("n", (s) => s<number>().default(0)),
    props: createPropsContract().store("input", (s) => s<number>().optional()),
    fn: (_s, ctx) => ({ input: ctx.props.$input }),
  });
}

function makeEventPropsVM() {
  return createViewModel({
    contract: createContract().store("v", (s) => s<string>().default("")),
    props: createPropsContract().event("onSubmit", (e) => e<string>().optional()),
    fn: (_s, ctx) => ({ submit: ctx.props.onSubmit }),
  });
}

function makeTodoModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .pk("id");

  return createModel({
    contract,
    fn: ({ $id, $title }) => ({ $id, $title }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Basic rendering
// ═══════════════════════════════════════════════════════════════════════════════

describe("View basic rendering", () => {
  it("<View model={vm}> renders children", () => {
    const vm = makeCounterVM();

    function Inner() {
      const shape = useUnit(useModel(vm)) as any;
      return <span data-testid="count">{shape.$count}</span>;
    }

    render(
      <View model={vm}>
        <Inner />
      </View>,
    );

    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("useModel(vm) returns shape with stores and events accessible", () => {
    const vm = makeCounterVM();

    function Inner() {
      const shape = useUnit(useModel(vm)) as any;
      return (
        <div>
          <span data-testid="count">{shape.$count}</span>
          <button data-testid="inc" onClick={() => shape.inc()}>
            +
          </button>
        </div>
      );
    }

    render(
      <View model={vm}>
        <Inner />
      </View>,
    );

    expect(screen.getByTestId("count").textContent).toBe("0");
    fireEvent.click(screen.getByTestId("inc"));
    expect(screen.getByTestId("count").textContent).toBe("1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Store prop sync
// ═══════════════════════════════════════════════════════════════════════════════

describe("View store prop sync", () => {
  it("changing props={{ input: value }} on <View> updates shape stores reactively", () => {
    const vm = makePropsVM();

    function Inner() {
      const shape = useUnit(useModel(vm)) as any;
      return <span data-testid="val">{shape.input}</span>;
    }

    function Wrapper({ value }: { value: number }) {
      return (
        <View model={vm} props={{ input: value }}>
          <Inner />
        </View>
      );
    }

    const { rerender } = render(<Wrapper value={10} />);
    expect(screen.getByTestId("val").textContent).toBe("10");

    rerender(<Wrapper value={42} />);
    expect(screen.getByTestId("val").textContent).toBe("42");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Event prop callback
// ═══════════════════════════════════════════════════════════════════════════════

describe("View event prop callback", () => {
  it("event prop fires callback when VM triggers it", () => {
    let received: string | null = null;
    const vm = makeEventPropsVM();

    function Inner() {
      const shape = useUnit(useModel(vm)) as any;
      return (
        <button data-testid="btn" onClick={() => shape.submit("hello")}>
          Go
        </button>
      );
    }

    render(
      <View model={vm} props={{ onSubmit: (val: string) => { received = val; } }}>
        <Inner />
      </View>,
    );

    fireEvent.click(screen.getByTestId("btn"));
    expect(received).toBe("hello");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

describe("View lifecycle", () => {
  it("mounted event fires on mount, unmounted fires on unmount", async () => {
    let mounted = false;
    let unmounted = false;

    const vm = createViewModel({
      contract: createContract().store("n", (s) => s<number>().default(0)),
      fn: (_s, ctx) => {
        const mountFx = createEffect(() => {
          mounted = true;
        });
        const unmountFx = createEffect(() => {
          unmounted = true;
        });
        sample({ clock: ctx.mounted, target: mountFx });
        sample({ clock: ctx.unmounted, target: unmountFx });
        return {};
      },
    });

    function Inner() {
      useModel(vm);
      return <div>alive</div>;
    }

    const { unmount } = render(
      <View model={vm}>
        <Inner />
      </View>,
    );

    expect(mounted).toBe(true);
    expect(unmounted).toBe(false);

    unmount();
    await Promise.resolve();
    expect(unmounted).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. <View> + <Each> nesting
// ═══════════════════════════════════════════════════════════════════════════════

describe("View + Each nesting", () => {
  it("useModel(vm) works inside <Each>, useModel(model) works inside <View>", () => {
    const vm = makeCounterVM();
    const todoModel = makeTodoModel();

    todoModel.create({ id: "t1", title: "First" });
    todoModel.create({ id: "t2", title: "Second" });

    function DeepChild() {
      const shape = useUnit(useModel(vm)) as any;
      const todo = useModel(todoModel);
      const title = useUnit(todo.$title);
      return (
        <div data-testid="item">
          <span data-testid="vm-count">{shape.$count}</span>
          <span data-testid="todo-title">{title}</span>
        </div>
      );
    }

    render(
      <View model={vm}>
        <Each model={todoModel} source={todoModel.$ids}>
          <DeepChild />
        </Each>
      </View>,
    );

    const items = screen.getAllByTestId("item");
    expect(items).toHaveLength(2);

    const vmCounts = screen.getAllByTestId("vm-count").map((el) => el.textContent);
    expect(vmCounts).toEqual(["0", "0"]);

    const titles = screen.getAllByTestId("todo-title").map((el) => el.textContent);
    expect(titles).toEqual(["First", "Second"]);

    todoModel.clear();
  });

  it("both contexts accessible from deeply nested child", () => {
    const vm = makeCounterVM();
    const todoModel = makeTodoModel();

    todoModel.create({ id: "deep", title: "Deep" });

    function GrandChild() {
      const shape = useUnit(useModel(vm)) as any;
      const todo = useModel(todoModel);
      const title = useUnit(todo.$title);
      return (
        <div>
          <span data-testid="count">{shape.$count}</span>
          <span data-testid="title">{title}</span>
          <button data-testid="inc" onClick={() => shape.inc()}>
            +
          </button>
        </div>
      );
    }

    function MiddleLayer() {
      return (
        <div>
          <GrandChild />
        </div>
      );
    }

    render(
      <View model={vm}>
        <Each model={todoModel} id="deep">
          <MiddleLayer />
        </Each>
      </View>,
    );

    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.getByTestId("title").textContent).toBe("Deep");

    fireEvent.click(screen.getByTestId("inc"));
    expect(screen.getByTestId("count").textContent).toBe("1");

    todoModel.clear();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Error: useModel(vmDefinition) without <View> ancestor
// ═══════════════════════════════════════════════════════════════════════════════

describe("View error handling", () => {
  it("useModel(vmDefinition) without <View> ancestor throws", () => {
    const vm = makeCounterVM();

    function Bad() {
      useModel(vm);
      return null;
    }

    expect(() => render(<Bad />)).toThrow(/no <View> ancestor/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6b. useView type inference (compile-time)
// ═══════════════════════════════════════════════════════════════════════════════

describe("useView type inference", () => {
  it("accepts a fully-typed ViewModelDefinition without a private-field clash", () => {
    // Reproduces user-reported TS2345 from examples/page.tsx:
    //   Argument of type ViewModelDefinition<Record<string, unknown>,
    //     Record<"route", StoreMeta<Route, true, false, false>>, {}, {}, {}>
    //     is not assignable to parameter of type
    //     ViewModelDefinition<Record<string, unknown>, any, any, any, any>
    //   Types have separate declarations of a private property contract
    //
    // Root cause: ViewModelDefinition's phantom generics (Stores, Events,
    // Derived, Props) combined with `private readonly` fields caused TS to
    // apply a nominal brand check when the later generics were fully
    // instantiated. Fix: the class uses `_`-prefixed readonly fields with
    // no `private` keyword.
    type Route = { name: string; params: Record<string, string> };
    const routerContract = createViewContract().store("route", (s) =>
      s<Route>().default({ name: "home", params: {} }),
    );
    const routerViewModel = createViewModel({
      contract: routerContract,
      fn: (stores) => ({ $route: stores.$route, navigate: (_to: string) => {} }),
    });

    function Inner() {
      const router = useView(routerViewModel);
      expectTypeOf(router).toHaveProperty("$route");
      expectTypeOf(router.$route).toMatchTypeOf<Store<Route>>();
      return null;
    }

    render(<Inner />);
  });

  it("infers shape from contract when no fn is provided", () => {
    // Reproduces: `const view = useView(vm)` where vm has no `fn`
    // previously typed `view` as `Record<string, unknown>`. createViewModel
    // now defaults `R` to the contract's store shape when `fn` is omitted.
    const contract = createViewContract()
      .store("count", (s) => s<number>().default(0))
      .store("label", (s) => s<string>().default(""));
    const vm = createViewModel({ contract });

    function Inner() {
      const view = useView(vm);
      expectTypeOf(view).toHaveProperty("$count");
      expectTypeOf(view).toHaveProperty("$label");
      expectTypeOf(view.$count).toMatchTypeOf<Store<number>>();
      expectTypeOf(view.$label).toMatchTypeOf<Store<string>>();
      return null;
    }

    render(<Inner />);
  });

  it("useModel(vmDefinition) preserves a narrow Shape generic", () => {
    // Same regression as useView, but through `useModel(vm)` read from a
    // <View> ancestor. The private-field brand previously collapsed the
    // return type whenever the VM's later generics were fully instantiated.
    type Route = { name: string };
    const vm = createViewModel({
      contract: createViewContract().store("route", (s) =>
        s<Route>().default({ name: "home" }),
      ),
      fn: (stores) => ({ $route: stores.$route, navigate: (_to: string) => {} }),
    });

    function Inner() {
      const shape = useModel(vm);
      expectTypeOf(shape).toHaveProperty("$route");
      expectTypeOf(shape.$route).toMatchTypeOf<Store<Route>>();
      expectTypeOf(shape.navigate).toMatchTypeOf<(to: string) => void>();
      return null;
    }

    render(
      <View model={vm}>
        <Inner />
      </View>,
    );
  });

  it("useModel(vmDefinition) infers shape from contract when no fn is provided", () => {
    const vm = createViewModel({
      contract: createViewContract()
        .store("count", (s) => s<number>().default(0))
        .store("label", (s) => s<string>().default("")),
    });

    function Inner() {
      const shape = useModel(vm);
      expectTypeOf(shape).toHaveProperty("$count");
      expectTypeOf(shape).toHaveProperty("$label");
      expectTypeOf(shape.$count).toMatchTypeOf<Store<number>>();
      expectTypeOf(shape.$label).toMatchTypeOf<Store<string>>();
      return null;
    }

    render(
      <View model={vm}>
        <Inner />
      </View>,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. useModel for models inside Each
// ═══════════════════════════════════════════════════════════════════════════════

describe("useModel for models inside Each", () => {
  it("useModel(model) reads from <Each> context", () => {
    const todoModel = makeTodoModel();
    todoModel.create({ id: "m1", title: "Item-1" });
    todoModel.create({ id: "m2", title: "Item-2" });

    function TodoView() {
      const todo = useModel(todoModel);
      const id = useUnit(todo.$id);
      const title = useUnit(todo.$title);
      return <div data-testid={`todo-${id}`}>{title}</div>;
    }

    render(
      <Each model={todoModel} source={todoModel.$ids}>
        <TodoView />
      </Each>,
    );

    expect(screen.getByTestId("todo-m1").textContent).toBe("Item-1");
    expect(screen.getByTestId("todo-m2").textContent).toBe("Item-2");

    todoModel.clear();
  });

  it("useModel(model) reacts to instance updates in <Each>", () => {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("count", (s) => s<number>())
      .event("set", (e) => e<number>())
      .pk("id");

    const model = createModel({
      contract,
      fn: ({ $id, $count, set }) => {
        $count.on(set, (_, v) => v);
        return { $id, $count, set };
      },
    });

    const inst = model.create({ id: "r1", count: 0 });

    function CountView() {
      const m = useModel(model);
      const count = useUnit(m.$count);
      return <span data-testid="count">{count}</span>;
    }

    render(
      <Each model={model} id="r1">
        <CountView />
      </Each>,
    );

    expect(screen.getByTestId("count").textContent).toBe("0");

    act(() => inst.set(99));
    expect(screen.getByTestId("count").textContent).toBe("99");

    model.clear();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. View + useModel deep nesting (no <Each>)
// ═══════════════════════════════════════════════════════════════════════════════

describe("View + useModel deep nesting", () => {
  it("useModel works through intermediate wrapper component", () => {
    const vm = makeCounterVM();

    function DeepChild() {
      const shape = useUnit(useModel(vm)) as any;
      return <span data-testid="count">{shape.$count}</span>;
    }

    function Wrapper({ children }: { children: React.ReactNode }) {
      return <div>{children}</div>;
    }

    render(
      <View model={vm}>
        <Wrapper>
          <DeepChild />
        </Wrapper>
      </View>,
    );

    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("useModel works 3 levels deep without <Each>", () => {
    const vm = makeCounterVM();

    function DeepChild() {
      const shape = useUnit(useModel(vm)) as any;
      return <span data-testid="count">{shape.$count}</span>;
    }

    function LevelB({ children }: { children: React.ReactNode }) {
      return <div>{children}</div>;
    }

    function LevelA({ children }: { children: React.ReactNode }) {
      return <section>{children}</section>;
    }

    render(
      <View model={vm}>
        <LevelA>
          <LevelB>
            <DeepChild />
          </LevelB>
        </LevelA>
      </View>,
    );

    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("multiple sibling children can useModel independently", () => {
    const vm = makeCounterVM();

    function ChildA() {
      const shape = useUnit(useModel(vm)) as any;
      return <span data-testid="a">{shape.$count}</span>;
    }

    function ChildB() {
      const shape = useUnit(useModel(vm)) as any;
      return <span data-testid="b">{shape.$count}</span>;
    }

    render(
      <View model={vm}>
        <ChildA />
        <ChildB />
      </View>,
    );

    expect(screen.getByTestId("a").textContent).toBe("0");
    expect(screen.getByTestId("b").textContent).toBe("0");
  });

  it("deep child reacts to shape event updates", () => {
    const vm = makeCounterVM();

    function DeepChild() {
      const shape = useUnit(useModel(vm)) as any;
      return (
        <div>
          <span data-testid="count">{shape.$count}</span>
          <button data-testid="inc" onClick={() => shape.inc()}>+</button>
        </div>
      );
    }

    function Wrapper({ children }: { children: React.ReactNode }) {
      return <div>{children}</div>;
    }

    render(
      <View model={vm}>
        <Wrapper>
          <DeepChild />
        </Wrapper>
      </View>,
    );

    expect(screen.getByTestId("count").textContent).toBe("0");
    fireEvent.click(screen.getByTestId("inc"));
    expect(screen.getByTestId("count").textContent).toBe("1");
    fireEvent.click(screen.getByTestId("inc"));
    expect(screen.getByTestId("count").textContent).toBe("2");
  });

  it("two separate Views with different VMs work independently", () => {
    const vm1 = makeCounterVM();
    const vm2 = makeCounterVM();

    function Child1() {
      const shape = useUnit(useModel(vm1)) as any;
      return (
        <div>
          <span data-testid="count1">{shape.$count}</span>
          <button data-testid="inc1" onClick={() => shape.inc()}>+</button>
        </div>
      );
    }

    function Child2() {
      const shape = useUnit(useModel(vm2)) as any;
      return <span data-testid="count2">{shape.$count}</span>;
    }

    render(
      <div>
        <View model={vm1}>
          <Child1 />
        </View>
        <View model={vm2}>
          <Child2 />
        </View>
      </div>,
    );

    expect(screen.getByTestId("count1").textContent).toBe("0");
    expect(screen.getByTestId("count2").textContent).toBe("0");

    fireEvent.click(screen.getByTestId("inc1"));
    expect(screen.getByTestId("count1").textContent).toBe("1");
    expect(screen.getByTestId("count2").textContent).toBe("0");
  });
});
