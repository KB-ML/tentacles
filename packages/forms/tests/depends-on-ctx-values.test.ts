import { describe, expect, it } from "vitest";
import { createFormContract, createFormViewModel } from "../index";

describe("dependsOn: ctx.values in custom validators", () => {
  it("ctx.values contains only fields listed in dependsOn", () => {
    const receivedCtxValues: unknown[] = [];

    const contract = createFormContract()
      .field("fieldA", (f) => f<string>().default("a"))
      .field("fieldB", (f) => f<number>().default(42))
      .field("fieldC", (f) => f<boolean>().default(true))
      .field("dependent", (f) =>
        f<string>()
          .default("")
          .dependsOn(["fieldA", "fieldB"])
          .custom((_v, ctx) => {
            receivedCtxValues.push({ ...ctx.values });
            return null;
          }),
      );

    const vm = createFormViewModel({
      name: "ctx-test",
      contract,
      validate: { mode: "touched" },
    });
    const { shape } = vm.instantiate();
    const form = shape as any;

    form.dependent.changed("test");
    form.dependent.blurred();

    expect(receivedCtxValues).toHaveLength(1);
    const values = receivedCtxValues[0] as Record<string, unknown>;

    // Only dependsOn fields are present
    expect(values).toHaveProperty("fieldA", "a");
    expect(values).toHaveProperty("fieldB", 42);

    // Fields NOT in dependsOn must be absent
    expect(values).not.toHaveProperty("fieldC");
    expect(values).not.toHaveProperty("dependent");
  });

  it("ctx.values reflects current dependency values at validation time", () => {
    const contract = createFormContract()
      .field("toggle", (f) => f<boolean>().default(false))
      .field("conditionalField", (f) =>
        f<string>()
          .default("")
          .dependsOn("toggle")
          .custom((v, ctx) => {
            const { toggle } = ctx.values as { toggle: boolean };
            if (toggle && !(v as string).trim()) return "Required when toggle is on";
            return null;
          }),
      );

    const vm = createFormViewModel({
      name: "conditional-test",
      contract,
      validate: { mode: "change" },
    });
    const { shape } = vm.instantiate();
    const form = shape as any;

    // toggle=false, empty string → no error
    form.conditionalField.changed("");
    expect(form.conditionalField.$error.getState()).toBeNull();

    // toggle=true → dependsOn re-validates conditionalField → error
    form.toggle.changed(true);
    expect(form.conditionalField.$error.getState()).toBe("Required when toggle is on");

    // Fill the field → no error
    form.conditionalField.changed("filled");
    expect(form.conditionalField.$error.getState()).toBeNull();

    // Toggle off → re-validates → no error (toggle is false)
    form.toggle.changed(false);
    form.conditionalField.changed("");
    expect(form.conditionalField.$error.getState()).toBeNull();
  });

  it("field without dependsOn gets empty ctx.values", () => {
    const receivedCtxValues: unknown[] = [];

    const contract = createFormContract()
      .field("other", (f) => f<string>().default("x"))
      .field("standalone", (f) =>
        f<string>()
          .default("")
          .custom((_v, ctx) => {
            receivedCtxValues.push({ ...ctx.values });
            return null;
          }),
      );

    const vm = createFormViewModel({
      name: "no-deps-test",
      contract,
      validate: { mode: "touched" },
    });
    const { shape } = vm.instantiate();
    const form = shape as any;

    form.standalone.changed("test");
    form.standalone.blurred();

    expect(receivedCtxValues).toHaveLength(1);
    expect(receivedCtxValues[0]).toEqual({});
  });

  it("confirmPassword pattern: ctx.values.password is available", () => {
    const contract = createFormContract()
      .field("password", (f) => f<string>().default("").required())
      .field("confirmPassword", (f) =>
        f<string>()
          .default("")
          .dependsOn("password")
          .custom((v, ctx) => {
            const { password } = ctx.values as { password: string };
            return v === password ? null : "Passwords do not match";
          }),
      );

    const vm = createFormViewModel({
      name: "password-test",
      contract,
      validate: { mode: "touched", reValidate: "change" },
    });
    const { shape } = vm.instantiate();
    const form = shape as any;

    form.password.changed("secret123");
    form.confirmPassword.changed("secret123");
    form.confirmPassword.blurred();
    expect(form.confirmPassword.$error.getState()).toBeNull();

    // Password changes → dependsOn triggers re-validation → mismatch
    form.password.changed("newpassword");
    expect(form.confirmPassword.$error.getState()).toBe("Passwords do not match");

    // Fix confirm
    form.confirmPassword.changed("newpassword");
    expect(form.confirmPassword.$error.getState()).toBeNull();
  });
});
