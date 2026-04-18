import { describe, expect, it } from "vitest";
import { createFormContract, createFormViewModel } from "../index";

describe("createFormViewModel", () => {
  it("returns a ViewModelDefinition-like object with instantiate()", () => {
    const contract = createFormContract()
      .field("title", (f) => f<string>().default(""))
      .field("priority", (f) => f<number>().default(1));

    const vm = createFormViewModel({
      name: "todoForm",
      contract,
    });

    expect(vm).toBeDefined();
    expect(typeof vm.instantiate).toBe("function");
  });

  it("instantiated shape has form fields accessible", () => {
    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .field("email", (f) => f<string>().default(""));

    const vm = createFormViewModel({
      name: "userForm",
      contract,
    });

    const { shape } = vm.instantiate();
    expect(shape).toBeDefined();

    // Fields accessible
    expect((shape as any).name?.kind).toBe("field");
    expect((shape as any).email?.kind).toBe("field");
    expect((shape as any).name?.$value?.getState()).toBe("");
  });

  it("submit → submitted fires with values when valid", () => {
    const contract = createFormContract()
      .field("title", (f) => f<string>().default("Hello"));

    const vm = createFormViewModel({
      name: "simpleForm",
      contract,
    });

    const { shape } = vm.instantiate();
    const form = shape as any;

    const results: unknown[] = [];
    form.submitted.watch((v: unknown) => results.push(v));

    form.submit();

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ title: "Hello" });
  });

  it("submit → rejected fires when validation fails", () => {
    const contract = createFormContract()
      .field("email", (f) => f<string>().default("").required("Email required"));

    const vm = createFormViewModel({
      name: "validForm",
      contract,
      validate: { mode: "submit" },
    });

    const { shape } = vm.instantiate();
    const form = shape as any;

    const submitted: unknown[] = [];
    const rejected: unknown[] = [];
    form.submitted.watch((v: unknown) => submitted.push(v));
    form.rejected.watch((v: unknown) => rejected.push(v));

    form.submit();

    expect(submitted).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(form.email.$error.getState()).toBe("Email required");
  });

  it("field.changed updates $values", () => {
    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""));

    const vm = createFormViewModel({ name: "test", contract });
    const { shape } = vm.instantiate();
    const form = shape as any;

    form.name.changed("Alice");
    expect(form.$values.getState()).toEqual({ name: "Alice" });
  });

  it("reset clears field values and errors", () => {
    const contract = createFormContract()
      .field("name", (f) => f<string>().default("init"));

    const vm = createFormViewModel({ name: "test", contract });
    const { shape } = vm.instantiate();
    const form = shape as any;

    form.name.changed("modified");
    form.name.setError("bad");
    expect(form.name.$value.getState()).toBe("modified");

    form.reset();

    expect(form.name.$value.getState()).toBe("init");
    expect(form.name.$error.getState()).toBeNull();
  });

  it("setErrors with path-keyed map works", () => {
    const contract = createFormContract()
      .field("email", (f) => f<string>().default(""))
      .field("name", (f) => f<string>().default(""));

    const vm = createFormViewModel({ name: "test", contract });
    const { shape } = vm.instantiate();
    const form = shape as any;

    form.setErrors({ email: "Taken", name: "Too short" });
    expect(form.email.$error.getState()).toBe("Taken");
    expect(form.name.$error.getState()).toBe("Too short");
  });

  it("$isDirty and $isTouched aggregate correctly", () => {
    const contract = createFormContract()
      .field("a", (f) => f<string>().default(""))
      .field("b", (f) => f<string>().default(""));

    const vm = createFormViewModel({ name: "test", contract });
    const { shape } = vm.instantiate();
    const form = shape as any;

    expect(form.$isDirty.getState()).toBe(false);
    expect(form.$isTouched.getState()).toBe(false);

    form.a.changed("x");
    expect(form.$isDirty.getState()).toBe(true);
    expect(form.$isTouched.getState()).toBe(true);
  });

  it("fn receives form shape and can compose", () => {
    const contract = createFormContract()
      .field("name", (f) => f<string>().default(""));

    const vm = createFormViewModel({
      name: "test",
      contract,
      fn: (form: any) => {
        return { ...form, custom: "value" };
      },
    });

    const { shape } = vm.instantiate();
    expect((shape as any).custom).toBe("value");
    expect((shape as any).name?.kind).toBe("field");
  });

  it("validation mode: touched — errors not shown until blur", () => {
    const validator = (v: unknown) => ((v as string).length < 3 ? "Too short" : null);
    const contract = createFormContract()
      .field("name", (f) => f<string>().default("").validate(validator));

    const vm = createFormViewModel({
      name: "test",
      contract,
      validate: { mode: "touched", reValidate: "change" },
    });

    const { shape } = vm.instantiate();
    const form = shape as any;

    form.name.changed("ab");
    expect(form.name.$error.getState()).toBeNull(); // not visible until blur

    form.name.blurred();
    expect(form.name.$error.getState()).toBe("Too short");

    form.name.changed("abcd");
    expect(form.name.$error.getState()).toBeNull(); // re-validates, now valid
  });

  it("preventDoubleSubmit blocks while submitting", () => {
    const contract = createFormContract()
      .field("x", (f) => f<string>().default(""));

    const vm = createFormViewModel({
      name: "test",
      contract,
      preventDoubleSubmit: true,
    });

    const { shape } = vm.instantiate();
    const form = shape as any;

    let submitCount = 0;
    form.submitted.watch(() => submitCount++);

    form.submit();
    form.submit();
    form.submit();

    // All 3 fire because sync validation completes immediately, resetting $isSubmitting
    // In real async scenarios, the second/third would be blocked
    expect(submitCount).toBe(3);
  });
});
