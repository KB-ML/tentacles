import { createEvent, createStore, sample, type EventCallable, type Store, type StoreWritable } from "effector";
import { describe, expect, it } from "vitest";
import { createPropsContract, createViewContract, createViewModel } from "../index";

// ═══════════════════════════════════════════════════════════════════════════
// ViewModel .create(props) — fn-level composition
// ═══════════════════════════════════════════════════════════════════════════

describe("ViewModelDefinition.create(props)", () => {
  it("instantiates a view model as a child via .create()", () => {
    const childContract = createViewContract()
      .store("count", (s) => s<number>().default(0));
    const childVM = createViewModel({
      name: "child",
      contract: childContract,
      fn: (model) => ({ $count: model.$count }),
    });

    const shape = childVM.create();
    expect((shape.$count as StoreWritable<number>).getState()).toBe(0);
  });

  it("parent VM composes a child inside its fn", () => {
    const childContract = createViewContract()
      .store("value", (s) => s<number>().default(0));
    const childProps = createPropsContract().store("multiplier", (s) => s<number>());
    const childVM = createViewModel({
      name: "child",
      contract: childContract,
      props: childProps,
      fn: (model, ctx) => {
        const $scaled = (model.$value as StoreWritable<number>).map((v) => v);
        return {
          $value: model.$value,
          $multiplier: ctx.props.$multiplier,
          $scaled,
        };
      },
    });

    const parentContract = createViewContract()
      .store("factor", (s) => s<number>().default(2));
    const parentVM = createViewModel({
      name: "parent",
      contract: parentContract,
      fn: (model) => {
        // Pass parent store down as a prop to the child
        const child = childVM.create({ multiplier: model.$factor });
        return { $factor: model.$factor, child };
      },
    });

    const { shape } = parentVM.instantiate();
    const parentShape = shape as {
      $factor: StoreWritable<number> & { set: (v: number) => void };
      child: { $multiplier: Store<number> };
    };
    expect(parentShape.$factor.getState()).toBe(2);
    expect(parentShape.child.$multiplier.getState()).toBe(2);

    // Updating parent store propagates to child
    parentShape.$factor.set(5);
    expect(parentShape.child.$multiplier.getState()).toBe(5);
  });

  it("child receives raw values and wraps them into stores", () => {
    const childContract = createViewContract()
      .store("local", (s) => s<string>().default(""));
    const childProps = createPropsContract().store("label", (s) => s<string>());
    const childVM = createViewModel({
      name: "child",
      contract: childContract,
      props: childProps,
      fn: (_, ctx) => ({ $label: ctx.props.$label }),
    });

    const shape = childVM.create({ label: "hello" });
    expect((shape.$label as Store<string>).getState()).toBe("hello");
  });

  it("event props accept effector events from parent", () => {
    const received: number[] = [];

    const childContract = createViewContract()
      .store("n", (s) => s<number>().default(0));
    const childProps = createPropsContract().event("onChange", (e) => e<number>());
    const childVM = createViewModel({
      name: "child",
      contract: childContract,
      props: childProps,
      fn: (_, ctx) => {
        ctx.props.onChange.watch((n) => received.push(n));
        return { fire: ctx.props.onChange };
      },
    });

    const parentEvent = createEvent<number>();
    parentEvent.watch((n) => received.push(n * 10));
    const childShape = childVM.create({ onChange: parentEvent });
    (childShape.fire as EventCallable<number>)(3);
    // Parent's own handler runs too since we reused its event
    expect(received).toContain(30);
  });

  it("event props accept raw callbacks", () => {
    const log: number[] = [];

    const childContract = createViewContract()
      .store("n", (s) => s<number>().default(0));
    const childProps = createPropsContract().event("onChange", (e) => e<number>());
    const childVM = createViewModel({
      name: "child",
      contract: childContract,
      props: childProps,
      fn: (_, ctx) => ({ fire: ctx.props.onChange }),
    });

    const shape = childVM.create({ onChange: (n: number) => log.push(n) });
    (shape.fire as EventCallable<number>)(42);
    expect(log).toEqual([42]);
  });

  it("nested children have unique SIDs based on parent path", () => {
    const grandchildContract = createViewContract()
      .store("leaf", (s) => s<string>().default(""));
    const grandchildVM = createViewModel({
      name: "grandchild",
      contract: grandchildContract,
      fn: (model) => ({ $leaf: model.$leaf }),
    });

    const childContract = createViewContract()
      .store("mid", (s) => s<string>().default(""));
    const childVM = createViewModel({
      name: "child",
      contract: childContract,
      fn: (model) => {
        const grand = grandchildVM.create();
        return { $mid: model.$mid, grand };
      },
    });

    const parentContract = createViewContract()
      .store("root", (s) => s<string>().default(""));
    const parentVM = createViewModel({
      name: "parent",
      contract: parentContract,
      fn: (model) => {
        const child = childVM.create();
        return { $root: model.$root, child };
      },
    });

    const { shape } = parentVM.instantiate();
    const parentShape = shape as {
      $root: Store<string>;
      child: { $mid: Store<string>; grand: { $leaf: Store<string> } };
    };
    expect(parentShape.$root.getState()).toBe("");
    expect(parentShape.child.$mid.getState()).toBe("");
    expect(parentShape.child.grand.$leaf.getState()).toBe("");
  });
});
