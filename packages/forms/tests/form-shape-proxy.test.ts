import { describe, expect, it } from "vitest";
import { createFormContract } from "../index";
import { createFormShapeProxy } from "../src/runtime/build-form-shape";
import { createFormRuntimeContext } from "../src/runtime/form-runtime-context";

function setup(contractBuilder: () => ReturnType<typeof createFormContract>) {
  const contract = contractBuilder();
  const context = createFormRuntimeContext("test", contract, {});
  const form = createFormShapeProxy(contract, [], context);
  return { form, context };
}

describe("createFormShapeProxy", () => {
  it("lazy access: first access creates the field, second returns same ref", () => {
    const { form } = setup(() =>
      createFormContract()
        .field("title", (f) => f<string>().default(""))
        .field("count", (f) => f<number>().default(0)),
    );

    const title1 = (form as any).title;
    const title2 = (form as any).title;
    expect(title1).toBe(title2); // exact same reference
    expect(title1.kind).toBe("field");
    expect(title1.$value.getState()).toBe("");
  });

  it("unused fields never create stores", () => {
    const { form, context } = setup(() =>
      createFormContract()
        .field("a", (f) => f<string>().default(""))
        .field("b", (f) => f<string>().default(""))
        .field("c", (f) => f<string>().default("")),
    );

    // Access only "a"
    void (form as any).a;

    // Cache should only have "a" materialized
    expect(context.cache.has("field:a")).toBe(true);
    expect(context.cache.has("field:b")).toBe(false);
    expect(context.cache.has("field:c")).toBe(false);
  });

  it("metadata: __path and kind", () => {
    const { form } = setup(() =>
      createFormContract().field("x", (f) => f<string>()),
    );

    expect(form.__path).toEqual([]);
    expect(form.kind).toBe("form");
  });

  it("$values combines field values", () => {
    const { form } = setup(() =>
      createFormContract()
        .field("name", (f) => f<string>().default("Alice"))
        .field("age", (f) => f<number>().default(30)),
    );

    const values = form.$values.getState();
    expect(values).toEqual({ name: "Alice", age: 30 });
  });

  it("$values updates when a field changes", () => {
    const { form } = setup(() =>
      createFormContract()
        .field("name", (f) => f<string>().default(""))
        .field("count", (f) => f<number>().default(0)),
    );

    (form as any).name.changed("Bob");

    expect(form.$values.getState()).toEqual({ name: "Bob", count: 0 });
  });

  it("$errors combines field errors", () => {
    const { form } = setup(() =>
      createFormContract()
        .field("email", (f) => f<string>().default(""))
        .field("name", (f) => f<string>().default("")),
    );

    (form as any).email.setError("Invalid");

    expect(form.$errors.getState()).toEqual({ email: "Invalid", name: null });
  });

  it("$errorPaths flattens errors to Map", () => {
    const { form } = setup(() =>
      createFormContract()
        .field("email", (f) => f<string>().default(""))
        .field("name", (f) => f<string>().default("")),
    );

    (form as any).email.setError("Invalid email");

    const paths = form.$errorPaths.getState();
    expect(paths.get("email")).toBe("Invalid email");
    expect(paths.size).toBe(1);
  });

  it("$isValid true when no errors, false when errors", () => {
    const { form } = setup(() =>
      createFormContract()
        .field("email", (f) => f<string>().default("")),
    );

    expect(form.$isValid.getState()).toBe(true);

    (form as any).email.setError("bad");
    expect(form.$isValid.getState()).toBe(false);

    (form as any).email.setError(null);
    expect(form.$isValid.getState()).toBe(true);
  });

  it("$isDirty / $isTouched aggregates", () => {
    const { form } = setup(() =>
      createFormContract()
        .field("a", (f) => f<string>().default(""))
        .field("b", (f) => f<string>().default("")),
    );

    expect(form.$isDirty.getState()).toBe(false);
    expect(form.$isTouched.getState()).toBe(false);

    (form as any).a.changed("x");
    expect(form.$isDirty.getState()).toBe(true);
    expect(form.$isTouched.getState()).toBe(true);

    (form as any).a.changed("");
    expect(form.$isDirty.getState()).toBe(false);
    // $isTouched stays true once touched
    expect(form.$isTouched.getState()).toBe(true);
  });

  it("$dirtyFields / $touchedFields path sets", () => {
    const { form } = setup(() =>
      createFormContract()
        .field("a", (f) => f<string>().default(""))
        .field("b", (f) => f<string>().default("")),
    );

    (form as any).a.changed("x");
    (form as any).b.blurred();

    const dirty = form.$dirtyFields.getState();
    expect(dirty.has("a")).toBe(true);
    expect(dirty.has("b")).toBe(false);

    const touched = form.$touchedFields.getState();
    expect(touched.has("a")).toBe(true);
    expect(touched.has("b")).toBe(true);
  });

  it("'in' operator works for declared fields and well-known keys", () => {
    const { form } = setup(() =>
      createFormContract().field("title", (f) => f<string>()),
    );

    expect("title" in form).toBe(true);
    expect("$values" in form).toBe(true);
    expect("submit" in form).toBe(true);
    expect("nonexistent" in form).toBe(false);
  });

  it("__debug() forces full materialization", () => {
    const { form, context } = setup(() =>
      createFormContract()
        .field("a", (f) => f<string>().default(""))
        .field("b", (f) => f<string>().default(""))
        .field("c", (f) => f<string>().default("")),
    );

    expect(context.cache.size).toBe(0);

    (form as any).__debug();

    // All fields should be materialized now
    expect(context.cache.has("field:a")).toBe(true);
    expect(context.cache.has("field:b")).toBe(true);
    expect(context.cache.has("field:c")).toBe(true);
  });
});

describe("sub-form composition", () => {
  it("sub-form is accessible via property and returns a form proxy", () => {
    const address = createFormContract()
      .field("street", (f) => f<string>().default(""))
      .field("zip", (f) => f<string>().default(""));

    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .sub("address", address);

    const context = createFormRuntimeContext("test", contract, {});
    const form = createFormShapeProxy(contract, [], context);

    const addr = (form as any).address;
    expect(addr.kind).toBe("form");
    expect(addr.__path).toEqual(["address"]);
    expect(addr.street.kind).toBe("field");
    expect(addr.street.$value.getState()).toBe("");
  });

  it("same sub-form contract at two slots produces independent state", () => {
    const address = createFormContract()
      .field("street", (f) => f<string>().default(""))
      .field("zip", (f) => f<string>().default(""));

    const contract = createFormContract()
      .sub("billing", address)
      .sub("shipping", address);

    const context = createFormRuntimeContext("test", contract, {});
    const form = createFormShapeProxy(contract, [], context);

    (form as any).billing.street.changed("123 Main St");

    expect((form as any).billing.street.$value.getState()).toBe("123 Main St");
    expect((form as any).shipping.street.$value.getState()).toBe("");
  });

  it("nested $values aggregation includes sub-form values", () => {
    const address = createFormContract()
      .field("city", (f) => f<string>().default("NYC"));

    const contract = createFormContract()
      .field("name", (f) => f<string>().default("Alice"))
      .sub("address", address);

    const context = createFormRuntimeContext("test", contract, {});
    const form = createFormShapeProxy(contract, [], context);

    expect(form.$values.getState()).toEqual({
      name: "Alice",
      address: { city: "NYC" },
    });
  });

  it("nested $errors bubble to root", () => {
    const address = createFormContract()
      .field("zip", (f) => f<string>().default(""));

    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .sub("address", address);

    const context = createFormRuntimeContext("test", contract, {});
    const form = createFormShapeProxy(contract, [], context);

    (form as any).address.zip.setError("Invalid zip");

    expect(form.$isValid.getState()).toBe(false);
    const paths = form.$errorPaths.getState();
    expect(paths.get("address.zip")).toBe("Invalid zip");
  });

  it("3-level deep nesting works", () => {
    const inner = createFormContract()
      .field("value", (f) => f<number>().default(42));

    const middle = createFormContract()
      .sub("inner", inner);

    const outer = createFormContract()
      .sub("middle", middle);

    const context = createFormRuntimeContext("test", outer, {});
    const form = createFormShapeProxy(outer, [], context);

    expect((form as any).middle.inner.value.$value.getState()).toBe(42);
    expect(form.$values.getState()).toEqual({
      middle: { inner: { value: 42 } },
    });
  });

  it("sub-form via thunk (for recursion)", () => {
    const contract: any = createFormContract()
      .field("label", (f) => f<string>().default("root"))
      .sub("child", () => contract);

    const context = createFormRuntimeContext("test", contract, {});
    const form = createFormShapeProxy(contract, [], context);

    expect((form as any).label.$value.getState()).toBe("root");
    const child = (form as any).child;
    expect(child.kind).toBe("form");
    expect(child.label.$value.getState()).toBe("root");
  });

  it("nested $dirtyFields includes sub-form paths", () => {
    const address = createFormContract()
      .field("zip", (f) => f<string>().default("00000"));

    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .sub("address", address);

    const context = createFormRuntimeContext("test", contract, {});
    const form = createFormShapeProxy(contract, [], context);

    (form as any).address.zip.changed("12345");

    const dirty = form.$dirtyFields.getState();
    expect(dirty.has("address.zip")).toBe(true);
    expect(dirty.has("name")).toBe(false);
  });
});
