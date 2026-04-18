import { afterEach, describe, expect, it } from "vitest";
import { createContract, createModel, createPropsContract, createViewModel, eq, gt } from "@kbml-tentacles/core";
import { createEffect, createEvent, createStore, sample } from "effector";
import { useUnit } from "effector-react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Each, useModel, useView } from "../index";

afterEach(cleanup);

// ─── Helpers ───

function makeCounterModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("count", (s) => s<number>())
    .event("inc", (e) => e<void>())
    .event("set", (e) => e<number>())
    .pk("id");

  return createModel({
    contract,
    fn: ({ $id, $count, inc, set }) => {
      $count.on(inc, (n) => n + 1);
      $count.on(set, (_, v) => v);
      return { $id, $count, inc, set };
    },
  });
}

function makeUserModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("name", (s) => s<string>())
    .store("age", (s) => s<number>())
    .store("role", (s) => s<string>().default("user"))
    .pk("id");

  return createModel({
    contract,
    fn: ({ $id, $name, $age, $role }) => ({ $id, $name, $age, $role }),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODEL CRUD
// ═══════════════════════════════════════════════════════════════════════════════

describe("model CRUD through components", () => {
  it("update via event reflects in UI", () => {
    const model = makeCounterModel();
    const inst = model.create({ id: "c1", count: 0 });

    function Counter() {
      const m = useModel(model);
      const count = useUnit(m.$count);
      return <span data-testid="count">{count}</span>;
    }

    render(
      <Each model={model} id="c1">
        <Counter />
      </Each>,
    );

    expect(screen.getByTestId("count").textContent).toBe("0");
    act(() => inst.inc());
    expect(screen.getByTestId("count").textContent).toBe("1");
    act(() => inst.set(10));
    expect(screen.getByTestId("count").textContent).toBe("10");

    model.clear();
  });

  it("reads multiple store fields from instance", () => {
    const model = makeUserModel();
    model.create({ id: "u1", name: "Alice", age: 30 });

    function UserView() {
      const user = useModel(model);
      const name = useUnit(user.$name);
      const age = useUnit(user.$age);
      const role = useUnit(user.$role);
      return (
        <div>
          <span data-testid="name">{name}</span>
          <span data-testid="age">{age}</span>
          <span data-testid="role">{role}</span>
        </div>
      );
    }

    render(
      <Each model={model} id="u1">
        <UserView />
      </Each>,
    );

    expect(screen.getByTestId("name").textContent).toBe("Alice");
    expect(screen.getByTestId("age").textContent).toBe("30");
    expect(screen.getByTestId("role").textContent).toBe("user");

    model.clear();
  });

  it("delete then re-create shows updated data", () => {
    const model = makeCounterModel();
    model.create({ id: "d1", count: 5 });

    function Counter() {
      const m = useModel(model);
      const count = useUnit(m.$count);
      return <span data-testid="count">{count}</span>;
    }

    render(
      <Each model={model} source={model.$ids}>
        <Counter />
      </Each>,
    );

    expect(screen.getByTestId("count").textContent).toBe("5");
    act(() => model.delete("d1"));
    expect(screen.queryByTestId("count")).toBeNull();
    act(() => {
      model.create({ id: "d1", count: 99 });
    });
    expect(screen.getByTestId("count").textContent).toBe("99");

    model.clear();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REACTIVE QUERIES
// ═══════════════════════════════════════════════════════════════════════════════

describe("reactive queries in components", () => {
  it("query.$ids drives <Each> with filtered results", () => {
    const model = makeUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });
    model.create({ id: "3", name: "Charlie", age: 45 });

    const query = model.query().where("age", gt(30));

    function UserItem() {
      const user = useModel(model);
      const name = useUnit(user.$name);
      return <div data-testid="item">{name}</div>;
    }

    function Count() {
      const count = useUnit(query.$count);
      return <span data-testid="count">{count}</span>;
    }

    render(
      <div>
        <Count />
        <Each model={model} source={query.$ids}>
          <UserItem />
        </Each>
      </div>,
    );

    expect(screen.getByTestId("count").textContent).toBe("2");
    expect(screen.getAllByTestId("item")).toHaveLength(2);
    expect(screen.queryByText("Alice")).toBeNull();

    model.clear();
  });

  it("dynamic filter via Store updates results", () => {
    const model = makeUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });
    model.create({ id: "2", name: "Bob", age: 35 });
    model.create({ id: "3", name: "Charlie", age: 45 });

    const setMin = createEvent<number>();
    const $min = createStore(30).on(setMin, (_, v) => v);
    const query = model.query().where("age", gt($min));

    function Count() {
      const count = useUnit(query.$count);
      return <span data-testid="count">{count}</span>;
    }

    render(<Count />);
    expect(screen.getByTestId("count").textContent).toBe("2");

    act(() => setMin(40));
    expect(screen.getByTestId("count").textContent).toBe("1");

    act(() => setMin(10));
    expect(screen.getByTestId("count").textContent).toBe("3");

    model.clear();
  });

  it("adding/deleting instances updates query reactively", () => {
    const model = makeUserModel();
    model.create({ id: "1", name: "Alice", age: 25 });

    const query = model.query().where("age", gt(30));

    function Count() {
      const count = useUnit(query.$count);
      return <span data-testid="count">{count}</span>;
    }

    render(<Count />);
    expect(screen.getByTestId("count").textContent).toBe("0");

    act(() => {
      model.create({ id: "2", name: "Bob", age: 35 });
    });
    expect(screen.getByTestId("count").textContent).toBe("1");

    act(() => model.delete("2"));
    expect(screen.getByTestId("count").textContent).toBe("0");

    model.clear();
  });

  it("orderBy changes render order", () => {
    const model = makeUserModel();
    model.create({ id: "1", name: "Charlie", age: 30 });
    model.create({ id: "2", name: "Alice", age: 25 });
    model.create({ id: "3", name: "Bob", age: 35 });

    const query = model.query().orderBy("name", "asc");

    function UserItem() {
      const user = useModel(model);
      const name = useUnit(user.$name);
      return <div data-testid="item">{name}</div>;
    }

    render(
      <Each model={model} source={query.$ids}>
        <UserItem />
      </Each>,
    );

    const items = screen.getAllByTestId("item").map((el) => el.textContent);
    expect(items).toEqual(["Alice", "Bob", "Charlie"]);

    model.clear();
  });

  it("limit/offset pagination", () => {
    const model = makeUserModel();
    for (let i = 1; i <= 5; i++) {
      model.create({ id: String(i), name: `User${i}`, age: 20 + i });
    }

    const query = model.query().orderBy("name", "asc").offset(1).limit(2);

    function UserItem() {
      const user = useModel(model);
      const name = useUnit(user.$name);
      return <div data-testid="item">{name}</div>;
    }

    function Total() {
      const total = useUnit(query.$totalCount);
      return <span data-testid="total">{total}</span>;
    }

    render(
      <div>
        <Total />
        <Each model={model} source={query.$ids}>
          <UserItem />
        </Each>
      </div>,
    );

    expect(screen.getByTestId("total").textContent).toBe("5");
    const items = screen.getAllByTestId("item").map((el) => el.textContent);
    expect(items).toEqual(["User2", "User3"]);

    model.clear();
  });

  it("when() conditional filter toggles", () => {
    const model = makeUserModel();
    model.create({ id: "1", name: "Alice", age: 25, role: "admin" });
    model.create({ id: "2", name: "Bob", age: 35, role: "user" });
    model.create({ id: "3", name: "Charlie", age: 45, role: "admin" });

    const setRole = createEvent<string | null>();
    const $role = createStore<string | null>(null).on(setRole, (_, v) => v);
    const query = model.query().when($role, (q, role) => q.where("role", eq(role)));

    function Count() {
      const count = useUnit(query.$count);
      return <span data-testid="count">{count}</span>;
    }

    render(<Count />);
    expect(screen.getByTestId("count").textContent).toBe("3");

    act(() => setRole("admin"));
    expect(screen.getByTestId("count").textContent).toBe("2");

    act(() => setRole("user"));
    expect(screen.getByTestId("count").textContent).toBe("1");

    act(() => setRole(null));
    expect(screen.getByTestId("count").textContent).toBe("3");

    model.clear();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VIEWMODEL (useView)
// ═══════════════════════════════════════════════════════════════════════════════

describe("useView integration", () => {
  it("renders stores, events, and derived stores", () => {
    const vmContract = createContract()
      .store("count", (s) => s<number>().default(0))
      .event("inc", (e) => e<void>())
      .derived("doubled", (s) => s.$count.map((n) => n * 2));
    const vm = createViewModel({
      contract: vmContract,
      fn: (stores) => {
        stores.$count.on(stores.inc, (n) => n + 1);
        return { $count: stores.$count, inc: stores.inc, $doubled: stores.$doubled };
      },
    });

    function Counter() {
      const view = useUnit(useView(vm)) as any;
      return (
        <div>
          <span data-testid="count">{view.$count}</span>
          <span data-testid="doubled">{view.$doubled}</span>
          <button data-testid="inc" onClick={() => view.inc()}>
            +
          </button>
        </div>
      );
    }

    render(<Counter />);
    expect(screen.getByTestId("count").textContent).toBe("0");
    expect(screen.getByTestId("doubled").textContent).toBe("0");

    fireEvent.click(screen.getByTestId("inc"));
    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("doubled").textContent).toBe("2");
  });

  it("lifecycle: mount/unmount fire", async () => {
    let mounted = false;
    let unmounted = false;

    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract: vmContract,
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

    function Comp() {
      useView(vm);
      return <div>alive</div>;
    }

    const { unmount } = render(<Comp />);
    expect(mounted).toBe(true);
    expect(unmounted).toBe(false);

    unmount();
    await Promise.resolve();
    expect(unmounted).toBe(true);
  });

  it("prop sync on re-render", () => {
    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract: vmContract,
      props: createPropsContract().store("input", (s) => s<number>().optional()),
      fn: (_s, ctx) => ({ input: ctx.props.$input }),
    });

    function Display({ value }: { value: number }) {
      const view = useUnit(useView(vm, { input: value })) as any;
      return <span data-testid="val">{view.input}</span>;
    }

    const { rerender } = render(<Display value={10} />);
    expect(screen.getByTestId("val").textContent).toBe("10");

    rerender(<Display value={42} />);
    expect(screen.getByTestId("val").textContent).toBe("42");
  });

  it("event prop fires callback", () => {
    let received: string | null = null;

    const vmContract = createContract()
      .store("v", (s) => s<string>().default(""));
    const vm = createViewModel({
      contract: vmContract,
      props: createPropsContract().event("onSubmit", (e) => e<string>().optional()),
      fn: (_s, ctx) => ({ submit: ctx.props.onSubmit }),
    });

    function Form() {
      const view = useUnit(useView(vm, {
        onSubmit: (val: string) => {
          received = val;
        },
      })) as any;
      return (
        <button data-testid="btn" onClick={() => view.submit("hello")}>
          Go
        </button>
      );
    }

    render(<Form />);
    fireEvent.click(screen.getByTestId("btn"));
    expect(received).toBe("hello");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VIEWMODEL PROPS — passing and changing
// ═══════════════════════════════════════════════════════════════════════════════

describe("useView props", () => {
  it("optional store prop is undefined when not passed", () => {
    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract: vmContract,
      props: createPropsContract().store("label", (s) => s<string>().optional()),
      fn: (_s, ctx) => ({ label: ctx.props.$label }),
    });

    function Comp() {
      const view = useUnit(useView(vm)) as any;
      return <span data-testid="label">{view.label ?? "missing"}</span>;
    }

    render(<Comp />);
    expect(screen.getByTestId("label").textContent).toBe("missing");
  });

  it("store prop overrides default when passed", () => {
    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract: vmContract,
      props: createPropsContract().store("label", (s) => s<string>().optional()),
      fn: (_s, ctx) => ({ label: ctx.props.$label }),
    });

    function Comp() {
      const view = useUnit(useView(vm, { label: "custom" })) as any;
      return <span data-testid="label">{view.label}</span>;
    }

    render(<Comp />);
    expect(screen.getByTestId("label").textContent).toBe("custom");
  });

  it("multiple store props change independently", () => {
    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract: vmContract,
      props: createPropsContract()
        .store("first", (s) => s<string>().optional())
        .store("second", (s) => s<number>().optional()),
      fn: (_s, ctx) => ({ first: ctx.props.$first, second: ctx.props.$second }),
    });

    function Comp({ first, second }: { first: string; second: number }) {
      const view = useUnit(useView(vm, { first, second })) as any;
      return (
        <div>
          <span data-testid="first">{view.first}</span>
          <span data-testid="second">{view.second}</span>
        </div>
      );
    }

    const { rerender } = render(<Comp first="a" second={1} />);
    expect(screen.getByTestId("first").textContent).toBe("a");
    expect(screen.getByTestId("second").textContent).toBe("1");

    // Change only first
    rerender(<Comp first="b" second={1} />);
    expect(screen.getByTestId("first").textContent).toBe("b");
    expect(screen.getByTestId("second").textContent).toBe("1");

    // Change only second
    rerender(<Comp first="b" second={99} />);
    expect(screen.getByTestId("first").textContent).toBe("b");
    expect(screen.getByTestId("second").textContent).toBe("99");
  });

  it("store prop survives rapid changes", () => {
    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract: vmContract,
      props: createPropsContract().store("val", (s) => s<number>().optional()),
      fn: (_s, ctx) => ({ val: ctx.props.$val }),
    });

    function Comp({ val }: { val: number }) {
      const view = useUnit(useView(vm, { val })) as any;
      return <span data-testid="val">{view.val}</span>;
    }

    const { rerender } = render(<Comp val={0} />);
    for (let i = 1; i <= 10; i++) {
      rerender(<Comp val={i} />);
    }
    expect(screen.getByTestId("val").textContent).toBe("10");
  });

  it("event prop callback updates between renders", () => {
    const calls: string[] = [];

    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract: vmContract,
      props: createPropsContract().event("onAction", (e) => e<void>().optional()),
      fn: (_s, ctx) => ({ fire: ctx.props.onAction }),
    });

    function Comp({ tag }: { tag: string }) {
      const view = useUnit(useView(vm, { onAction: () => calls.push(tag) })) as any;
      return (
        <button data-testid="btn" onClick={() => view.fire()}>
          go
        </button>
      );
    }

    const { rerender } = render(<Comp tag="first" />);
    fireEvent.click(screen.getByTestId("btn"));
    expect(calls).toEqual(["first"]);

    rerender(<Comp tag="second" />);
    fireEvent.click(screen.getByTestId("btn"));
    expect(calls).toEqual(["first", "second"]);
  });

  it("store prop feeds internal derived state", () => {
    const vmContract = createContract()
      .store("base", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract: vmContract,
      props: createPropsContract().store("multiplier", (s) => s<number>().optional()),
      fn: (stores, ctx) => {
        const $result = stores.$base.map((b) => b * 2);
        return { $base: stores.$base, multiplier: ctx.props.$multiplier, result: $result };
      },
    });

    function Comp({ mult }: { mult: number }) {
      const view = useUnit(useView(vm, { multiplier: mult })) as any;
      return (
        <div>
          <span data-testid="mult">{view.multiplier}</span>
          <span data-testid="result">{view.result}</span>
        </div>
      );
    }

    const { rerender } = render(<Comp mult={3} />);
    expect(screen.getByTestId("mult").textContent).toBe("3");
    expect(screen.getByTestId("result").textContent).toBe("0");

    rerender(<Comp mult={5} />);
    expect(screen.getByTestId("mult").textContent).toBe("5");
  });

  it("mixed store and event props work together", () => {
    const log: string[] = [];

    const vmContract = createContract()
      .store("n", (s) => s<number>().default(0));
    const vm = createViewModel({
      contract: vmContract,
      props: createPropsContract()
        .store("title", (s) => s<string>().optional())
        .event("onSave", (e) => e<string>().optional()),
      fn: (_s, ctx) => ({
        title: ctx.props.$title,
        save: ctx.props.onSave,
      }),
    });

    function Form({ title }: { title: string }) {
      const view = useUnit(useView(vm, {
        title,
        onSave: (val: string) => log.push(`saved:${val}`),
      })) as any;
      return (
        <div>
          <span data-testid="title">{view.title}</span>
          <button data-testid="save" onClick={() => view.save("data")}>
            save
          </button>
        </div>
      );
    }

    const { rerender } = render(<Form title="Draft" />);
    expect(screen.getByTestId("title").textContent).toBe("Draft");

    fireEvent.click(screen.getByTestId("save"));
    expect(log).toEqual(["saved:data"]);

    rerender(<Form title="Final" />);
    expect(screen.getByTestId("title").textContent).toBe("Final");

    fireEvent.click(screen.getByTestId("save"));
    expect(log).toEqual(["saved:data", "saved:data"]);
  });
});
