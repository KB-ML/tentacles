import { describe, expect, it } from "vitest";
import { createFormContract } from "../index";
import { createFormShapeProxy } from "../src/runtime/build-form-shape";
import { createFormRuntimeContext } from "../src/runtime/form-runtime-context";

function setupArray() {
  const rowContract = createFormContract()
    .field("name", (f) => f<string>().default(""))
    .field("qty", (f) => f<number>().default(1));

  const contract = createFormContract()
    .field("title", (f) => f<string>().default("Order"))
    .array("items", rowContract, { min: 1, max: 5 });

  const context = createFormRuntimeContext("test", contract, {});
  const form = createFormShapeProxy(contract, [], context) as any;
  return { form, rowContract };
}

describe("form arrays", () => {
  it("array is accessible via property and has correct kind", () => {
    const { form } = setupArray();
    const items = form.items;

    expect(items.kind).toBe("array");
    expect(items.__path).toEqual(["items"]);
  });

  it("array starts empty", () => {
    const { form } = setupArray();
    expect(form.items.$ids.getState()).toEqual([]);
    expect(form.items.$count.getState()).toBe(0);
  });

  it("append() adds a row with contract defaults", () => {
    const { form } = setupArray();

    form.items.append(undefined);

    const ids = form.items.$ids.getState();
    expect(ids).toHaveLength(1);
    expect(form.items.$count.getState()).toBe(1);
  });

  it("append() with data overrides defaults", () => {
    const { form } = setupArray();

    form.items.append({ name: "Widget", qty: 5 });

    const ids = form.items.$ids.getState();
    expect(ids).toHaveLength(1);

    const instance = form.items.instance(ids[0]!).getState();
    expect(instance).not.toBeNull();
    expect(instance.$name.getState()).toBe("Widget");
    expect(instance.$qty.getState()).toBe(5);
  });

  it("append() multiple items via array", () => {
    const { form } = setupArray();

    form.items.append([{ name: "A" }, { name: "B" }]);

    expect(form.items.$count.getState()).toBe(2);
  });

  it("removeKey() removes by model instance ID", () => {
    const { form } = setupArray();

    form.items.append({ name: "A" });
    form.items.append({ name: "B" });

    const ids = form.items.$ids.getState();
    expect(ids).toHaveLength(2);

    form.items.removeKey(ids[0]!);

    expect(form.items.$count.getState()).toBe(1);
    expect(form.items.$ids.getState()).toEqual([ids[1]]);
  });

  it("move() reorders without creating/destroying", () => {
    const { form } = setupArray();

    form.items.append({ name: "A" });
    form.items.append({ name: "B" });
    form.items.append({ name: "C" });

    const [a, b, c] = form.items.$ids.getState();

    form.items.move({ from: 2, to: 0 });

    expect(form.items.$ids.getState()).toEqual([c, a, b]);
    expect(form.items.$count.getState()).toBe(3);
  });

  it("swap() swaps two positions", () => {
    const { form } = setupArray();

    form.items.append({ name: "A" });
    form.items.append({ name: "B" });

    const [a, b] = form.items.$ids.getState();

    form.items.swap({ a: 0, b: 1 });

    expect(form.items.$ids.getState()).toEqual([b, a]);
  });

  it("clear() removes all rows", () => {
    const { form } = setupArray();

    form.items.append({ name: "A" });
    form.items.append({ name: "B" });
    expect(form.items.$count.getState()).toBe(2);

    form.items.clear();

    expect(form.items.$count.getState()).toBe(0);
    expect(form.items.$ids.getState()).toEqual([]);
  });

  it("$arrayError fires on min constraint violation", () => {
    const { form } = setupArray();

    // min: 1, starts empty → should have error
    expect(form.items.$arrayError.getState()).toBe("At least 1 required");

    form.items.append({ name: "A" });
    expect(form.items.$arrayError.getState()).toBeNull();
  });

  it("$arrayError fires on max constraint violation", () => {
    const { form } = setupArray();

    for (let i = 0; i < 6; i++) {
      form.items.append({ name: `Item ${i}` });
    }

    // max: 5, we have 6
    expect(form.items.$arrayError.getState()).toBe("At most 5 allowed");
  });

  it("$isValid reflects array error", () => {
    const { form } = setupArray();

    // Empty, min=1 → invalid
    expect(form.items.$isValid.getState()).toBe(false);

    form.items.append({ name: "A" });
    expect(form.items.$isValid.getState()).toBe(true);
  });

  it("model APIs are accessible: $ids, $count, $instances, instance()", () => {
    const { form } = setupArray();

    form.items.append({ name: "Test" });

    expect(form.items.$ids).toBeDefined();
    expect(form.items.$count).toBeDefined();
    expect(form.items.$instances).toBeDefined();
    expect(typeof form.items.instance).toBe("function");

    const ids = form.items.$ids.getState();
    const inst = form.items.instance(ids[0]!).getState();
    expect(inst).not.toBeNull();
  });

  it("query() is accessible on form arrays", () => {
    const { form } = setupArray();

    expect(typeof form.items.query).toBe("function");
  });

  it("reorder event is accessible", () => {
    const { form } = setupArray();
    expect(form.items.reorder).toBeDefined();
  });
});

describe("form array with custom min/max messages", () => {
  it("uses custom message for min", () => {
    const row = createFormContract().field("x", (f) => f<string>());
    const contract = createFormContract()
      .array("items", row, { min: { value: 2, message: "Need at least two" } });

    const context = createFormRuntimeContext("test", contract, {});
    const form = createFormShapeProxy(contract, [], context) as any;

    expect(form.items.$arrayError.getState()).toBe("Need at least two");
  });
});

describe("nested arrays in root $values", () => {
  it("array $values appears in root $values", () => {
    const row = createFormContract().field("x", (f) => f<string>().default("hello"));
    const contract = createFormContract()
      .field("title", (f) => f<string>().default("T"))
      .array("items", row);

    const context = createFormRuntimeContext("test", contract, {});
    const form = createFormShapeProxy(contract, [], context) as any;

    // Access items to materialize the array
    void form.items;

    // Root $values should include items as empty array initially
    const vals = form.$values.getState();
    expect(vals.title).toBe("T");
    expect(Array.isArray(vals.items)).toBe(true);
    expect(vals.items).toEqual([]);
  });
});
