import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { createContract, createModel, createPropsContract, createViewContract, createViewModel } from "@kbml-tentacles/core";
import { createEffect, createEvent, createStore, sample, type Store } from "effector";
import { useUnit } from "effector-solid";
import { render, cleanup, screen, fireEvent } from "@solidjs/testing-library";
import { View, useModel, useView, Each } from "../index";

afterEach(cleanup);

// ─── Helpers ───

function makeSimpleVM() {
  const contract = createContract()
    .store("count", (s) => s<number>().default(0))
    .event("inc", (e) => e<void>());

  return createViewModel({
    contract,
    fn: (stores) => {
      stores.$count.on(stores.inc, (n) => n + 1);
      return { $count: stores.$count, inc: stores.inc };
    },
  });
}

function makePropsVM() {
  const contract = createContract()
    .store("n", (s) => s<number>().default(0));

  return createViewModel({
    contract,
    props: createPropsContract().store("input", (s) => s<number>().optional()),
    fn: (_s, ctx) => ({ input: ctx.props.$input }),
  });
}

function makeTodoModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .store("done", (s) => s<boolean>().default(false))
    .pk("id");

  return createModel({
    contract,
    fn: ({ $id, $title, $done }) => ({ $id, $title, $done }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Basic rendering
// ═══════════════════════════════════════════════════════════════════════════════

describe("basic rendering", () => {
  it("<View> renders children and useModel(vm) returns shape", () => {
    const vm = makeSimpleVM();

    function Inner() {
      const shape = useUnit(useModel(vm)) as any;
      return <span data-testid="count">{shape.$count()}</span>;
    }

    render(() => (
      <View model={vm}>
        <Inner />
      </View>
    ));

    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("shape events work through useModel", () => {
    const vm = makeSimpleVM();

    function Inner() {
      const shape = useUnit(useModel(vm)) as any;
      return (
        <div>
          <span data-testid="count">{shape.$count()}</span>
          <button data-testid="inc" onClick={() => shape.inc()}>+</button>
        </div>
      );
    }

    render(() => (
      <View model={vm}>
        <Inner />
      </View>
    ));

    expect(screen.getByTestId("count").textContent).toBe("0");
    fireEvent.click(screen.getByTestId("inc"));
    expect(screen.getByTestId("count").textContent).toBe("1");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Store prop sync
// ═══════════════════════════════════════════════════════════════════════════════

describe("store prop sync", () => {
  it("changing props accessor updates shape stores", () => {
    const vm = makePropsVM();
    const setVal = createEvent<number>();
    const $val = createStore(10).on(setVal, (_, v) => v);

    function Inner() {
      const shape = useUnit(useModel(vm)) as any;
      return <span data-testid="input">{shape.input()}</span>;
    }

    function Wrapper() {
      const val = useUnit($val);
      return (
        <View model={vm} props={() => ({ input: val() })}>
          <Inner />
        </View>
      );
    }

    render(() => <Wrapper />);
    expect(screen.getByTestId("input").textContent).toBe("10");

    setVal(42);
    expect(screen.getByTestId("input").textContent).toBe("42");

    setVal(0);
    expect(screen.getByTestId("input").textContent).toBe("0");
  });

  it("optional prop is undefined when not passed", () => {
    const vm = makePropsVM();

    function Inner() {
      const shape = useUnit(useModel(vm)) as any;
      return <span data-testid="input">{shape.input() ?? "missing"}</span>;
    }

    render(() => (
      <View model={vm}>
        <Inner />
      </View>
    ));

    expect(screen.getByTestId("input").textContent).toBe("missing");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Event prop callback
// ═══════════════════════════════════════════════════════════════════════════════

describe("event prop callback", () => {
  it("event prop fires callback on the host side", () => {
    let received: string | null = null;

    const contract = createContract()
      .store("v", (s) => s<string>().default(""));
    const vm = createViewModel({
      contract,
      props: createPropsContract().event("onSubmit", (e) => e<string>().optional()),
      fn: (_s, ctx) => ({ submit: ctx.props.onSubmit }),
    });

    function Inner() {
      const shape = useUnit(useModel(vm)) as any;
      return (
        <button data-testid="btn" onClick={() => shape.submit("hello")}>
          Go
        </button>
      );
    }

    render(() => (
      <View model={vm} props={() => ({ onSubmit: (val: string) => { received = val; } })}>
        <Inner />
      </View>
    ));

    fireEvent.click(screen.getByTestId("btn"));
    expect(received).toBe("hello");
  });

  it("event prop callback updates reactively", () => {
    const calls: string[] = [];

    const contract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract,
      props: createPropsContract().event("onAction", (e) => e<void>().optional()),
      fn: (_s, ctx) => ({ fire: ctx.props.onAction }),
    });

    const setTag = createEvent<string>();
    const $tag = createStore("first").on(setTag, (_, v) => v);

    function Inner() {
      const shape = useUnit(useModel(vm)) as any;
      return (
        <button data-testid="btn" onClick={() => shape.fire()}>go</button>
      );
    }

    function Wrapper() {
      const tag = useUnit($tag);
      return (
        <View model={vm} props={() => ({ onAction: () => calls.push(tag()) })}>
          <Inner />
        </View>
      );
    }

    render(() => <Wrapper />);
    fireEvent.click(screen.getByTestId("btn"));
    expect(calls).toEqual(["first"]);

    setTag("second");
    fireEvent.click(screen.getByTestId("btn"));
    expect(calls).toEqual(["first", "second"]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

describe("lifecycle", () => {
  it("mounted/unmounted fire correctly", () => {
    let mounted = false;
    let unmounted = false;

    const contract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract,
      fn: (_s, ctx) => {
        const mountFx = createEffect(() => { mounted = true; });
        const unmountFx = createEffect(() => { unmounted = true; });
        sample({ clock: ctx.mounted, target: mountFx });
        sample({ clock: ctx.unmounted, target: unmountFx });
        return {};
      },
    });

    function Inner() {
      useModel(vm);
      return <div>alive</div>;
    }

    const { unmount } = render(() => (
      <View model={vm}>
        <Inner />
      </View>
    ));

    expect(mounted).toBe(true);
    expect(unmounted).toBe(false);

    unmount();
    expect(unmounted).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. <View> + <Each> nesting
// ═══════════════════════════════════════════════════════════════════════════════

describe("<View> + <Each> nesting", () => {
  it("both contexts accessible from nested child", () => {
    const vm = makeSimpleVM();
    const model = makeTodoModel();
    model.create({ id: "t1", title: "Task A" });
    model.create({ id: "t2", title: "Task B" });

    function TodoItem() {
      const todo = useModel(model);
      const vmShape = useUnit(useModel(vm)) as any;
      const title = useUnit(todo.$title);
      return (
        <div data-testid="item">
          <span data-testid="title">{title()}</span>
          <span data-testid="vm-count">{vmShape.$count()}</span>
        </div>
      );
    }

    render(() => (
      <View model={vm}>
        <Each model={model} source={model.$ids}>
          <TodoItem />
        </Each>
      </View>
    ));

    expect(screen.getAllByTestId("item")).toHaveLength(2);
    const titles = screen.getAllByTestId("title").map((el) => el.textContent);
    expect(titles).toContain("Task A");
    expect(titles).toContain("Task B");
    // VM context is accessible from within Each
    const vmCounts = screen.getAllByTestId("vm-count").map((el) => el.textContent);
    expect(vmCounts).toEqual(["0", "0"]);

    model.clear();
  });

  it("<Each> inside <View> reacts to model changes", () => {
    const vm = makeSimpleVM();
    const model = makeTodoModel();
    model.create({ id: "t1", title: "First" });

    function TodoItem() {
      const todo = useModel(model);
      const title = useUnit(todo.$title);
      return <div data-testid="item">{title()}</div>;
    }

    render(() => (
      <View model={vm}>
        <Each model={model} source={model.$ids}>
          <TodoItem />
        </Each>
      </View>
    ));

    expect(screen.getAllByTestId("item")).toHaveLength(1);

    model.create({ id: "t2", title: "Second" });
    expect(screen.getAllByTestId("item")).toHaveLength(2);

    model.delete("t1");
    expect(screen.getAllByTestId("item")).toHaveLength(1);
    expect(screen.getByText("Second")).toBeTruthy();

    model.clear();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Error: useModel(vmDefinition) without <View>
// ═══════════════════════════════════════════════════════════════════════════════

describe("useModel error without <View>", () => {
  it("throws when useModel(vmDefinition) used outside <View>", () => {
    const vm = makeSimpleVM();

    function Bad() {
      useModel(vm);
      return null;
    }

    expect(() => render(() => <Bad />)).toThrow(/no <View> ancestor/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. useModel for models inside Each — basic replacement test
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// 8. useView type inference (compile-time)
// ═══════════════════════════════════════════════════════════════════════════════

describe("useView type inference", () => {
  it("accepts a fully-typed ViewModelDefinition without a private-field clash", () => {
    // Reproduces user-reported TS2345:
    //   Argument of type ViewModelDefinition<Record<string, unknown>,
    //     Record<"route", StoreMeta<Route, true, false, false>>, {}, {}, {}>
    //     is not assignable to parameter of type
    //     ViewModelDefinition<Record<string, unknown>, any, any, any, any>
    //   Types have separate declarations of a private property contract
    type Route = { name: string; params: Record<string, string> };
    const routerContract = createViewContract().store("route", (s) =>
      s<Route>().default({ name: "home", params: {} }),
    );
    // Providing an `fn` so Shape is a narrow literal type — this is the
    // case that triggered TS2345 on react's useView in page.tsx.
    const routerViewModel = createViewModel({
      contract: routerContract,
      fn: (stores) => ({ $route: stores.$route, navigate: (_to: string) => {} }),
    });

    // This call must compile without TS2345. Previously it failed because
    // `useView`'s `Shape` generic bound collided with the view model's
    // nominal private-field identity when the later generic params were
    // fully instantiated.
    function Inner() {
      const router = useView(routerViewModel);
      expectTypeOf(router).toHaveProperty("$route");
      expectTypeOf(router.$route).toMatchTypeOf<Store<Route>>();
      return null;
    }

    render(() => <Inner />);
  });

  it("infers shape from contract when no fn is provided", () => {
    const contract = createViewContract()
      .store("count", (s) => s<number>().default(0))
      .store("label", (s) => s<string>().default(""));
    const vm = createViewModel({ contract });

    function Inner() {
      const view = useView(vm);
      // Must NOT be Record<string, unknown> — expose $count and $label.
      expectTypeOf(view).toHaveProperty("$count");
      expectTypeOf(view).toHaveProperty("$label");
      expectTypeOf(view.$count).toMatchTypeOf<Store<number>>();
      expectTypeOf(view.$label).toMatchTypeOf<Store<string>>();
      return null;
    }

    render(() => <Inner />);
  });

  it("useModel(vmDefinition) preserves a narrow Shape generic", () => {
    // Mirrors the useView regression but through `useModel(vm)` read from
    // a <View> ancestor.
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

    render(() => (
      <View model={vm}>
        <Inner />
      </View>
    ));
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

    render(() => (
      <View model={vm}>
        <Inner />
      </View>
    ));
  });
});

describe("useModel for models inside Each", () => {
  it("re-creating instance with same ID updates rendered data", () => {
    const model = makeTodoModel();
    model.create({ id: "r1", title: "Original" });

    function Item() {
      const todo = useModel(model);
      const title = useUnit(todo.$title);
      return <span data-testid="title">{title()}</span>;
    }

    render(() => (
      <Each model={model} source={model.$ids}>
        <Item />
      </Each>
    ));

    expect(screen.getByTestId("title").textContent).toBe("Original");

    // Re-create with same ID replaces the instance
    model.create({ id: "r1", title: "Replaced" });
    expect(screen.getByTestId("title").textContent).toBe("Replaced");

    model.clear();
  });

  it("multiple instances render independently", () => {
    const model = makeTodoModel();
    model.create({ id: "a", title: "Alpha" });
    model.create({ id: "b", title: "Beta" });

    function Item() {
      const todo = useModel(model);
      const title = useUnit(todo.$title);
      const id = useUnit(todo.$id);
      return <div data-testid={`item-${id()}`}>{title()}</div>;
    }

    render(() => (
      <Each model={model} source={model.$ids}>
        <Item />
      </Each>
    ));

    expect(screen.getByTestId("item-a").textContent).toBe("Alpha");
    expect(screen.getByTestId("item-b").textContent).toBe("Beta");

    // Replace one, other stays intact
    model.create({ id: "a", title: "Alpha2" });
    expect(screen.getByTestId("item-a").textContent).toBe("Alpha2");
    expect(screen.getByTestId("item-b").textContent).toBe("Beta");

    model.clear();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. View + useModel deep nesting (no <Each>)
// ═══════════════════════════════════════════════════════════════════════════════

describe("View + useModel deep nesting", () => {
  it("useModel works through intermediate wrapper component", () => {
    const vm = makeSimpleVM();

    function DeepChild() {
      const shape = useUnit(useModel(vm)) as any;
      return <span data-testid="count">{shape.$count()}</span>;
    }

    function Wrapper(props: { children?: any }) {
      return <div>{props.children}</div>;
    }

    render(() => (
      <View model={vm}>
        <Wrapper>
          <DeepChild />
        </Wrapper>
      </View>
    ));

    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("useModel works 3 levels deep without <Each>", () => {
    const vm = makeSimpleVM();

    function DeepChild() {
      const shape = useUnit(useModel(vm)) as any;
      return <span data-testid="count">{shape.$count()}</span>;
    }

    function LevelB(props: { children?: any }) {
      return <div>{props.children}</div>;
    }

    function LevelA(props: { children?: any }) {
      return <section>{props.children}</section>;
    }

    render(() => (
      <View model={vm}>
        <LevelA>
          <LevelB>
            <DeepChild />
          </LevelB>
        </LevelA>
      </View>
    ));

    expect(screen.getByTestId("count").textContent).toBe("0");
  });

  it("multiple sibling children can useModel independently", () => {
    const vm = makeSimpleVM();

    function ChildA() {
      const shape = useUnit(useModel(vm)) as any;
      return <span data-testid="a">{shape.$count()}</span>;
    }

    function ChildB() {
      const shape = useUnit(useModel(vm)) as any;
      return <span data-testid="b">{shape.$count()}</span>;
    }

    render(() => (
      <View model={vm}>
        <ChildA />
        <ChildB />
      </View>
    ));

    expect(screen.getByTestId("a").textContent).toBe("0");
    expect(screen.getByTestId("b").textContent).toBe("0");
  });

  it("deep child reacts to shape event updates", () => {
    const vm = makeSimpleVM();

    function DeepChild() {
      const shape = useUnit(useModel(vm)) as any;
      return (
        <div>
          <span data-testid="count">{shape.$count()}</span>
          <button data-testid="inc" onClick={() => shape.inc()}>+</button>
        </div>
      );
    }

    function Wrapper(props: { children?: any }) {
      return <div>{props.children}</div>;
    }

    render(() => (
      <View model={vm}>
        <Wrapper>
          <DeepChild />
        </Wrapper>
      </View>
    ));

    expect(screen.getByTestId("count").textContent).toBe("0");
    fireEvent.click(screen.getByTestId("inc"));
    expect(screen.getByTestId("count").textContent).toBe("1");
    fireEvent.click(screen.getByTestId("inc"));
    expect(screen.getByTestId("count").textContent).toBe("2");
  });

  it("two separate Views with different VMs work independently", () => {
    const vm1 = makeSimpleVM();
    const vm2 = makeSimpleVM();

    function Child1() {
      const shape = useUnit(useModel(vm1)) as any;
      return (
        <div>
          <span data-testid="count1">{shape.$count()}</span>
          <button data-testid="inc1" onClick={() => shape.inc()}>+</button>
        </div>
      );
    }

    function Child2() {
      const shape = useUnit(useModel(vm2)) as any;
      return <span data-testid="count2">{shape.$count()}</span>;
    }

    render(() => (
      <div>
        <View model={vm1}>
          <Child1 />
        </View>
        <View model={vm2}>
          <Child2 />
        </View>
      </div>
    ));

    expect(screen.getByTestId("count1").textContent).toBe("0");
    expect(screen.getByTestId("count2").textContent).toBe("0");

    fireEvent.click(screen.getByTestId("inc1"));
    expect(screen.getByTestId("count1").textContent).toBe("1");
    expect(screen.getByTestId("count2").textContent).toBe("0");
  });
});
