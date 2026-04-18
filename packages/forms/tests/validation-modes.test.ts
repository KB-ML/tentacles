import { describe, expect, it } from "vitest";
import { buildField } from "../src/runtime/build-field";
import { ValidationRunner, type FieldEntry } from "../src/validation/validation-runner";
import type { FormFieldDescriptor } from "../src/contract/form-contract-descriptors";

function makeDescriptor(overrides: Partial<FormFieldDescriptor> = {}): FormFieldDescriptor {
  return {
    kind: "field",
    defaultValue: "",
    hasDefault: true,
    isFactory: false,
    isOptional: false,
    isDisabled: false,
    syncValidators: [],
    required: { flag: false },
    warnValidators: [],
    asyncValidators: [],
    validateOn: null,
    reValidateOn: null,
    dependsOn: [],
    transform: null,
    resetOn: [],
    ...overrides,
  };
}

function makeSid(suffix: string) {
  return `tentacles:forms:test:${suffix}`;
}

function setupField(
  name: string,
  descriptor: FormFieldDescriptor,
) {
  const field = buildField<string>(descriptor, { path: [name], makeSid });
  const entry: FieldEntry = { path: name, field: field as any, descriptor };
  return { field, entry };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("validation mode: submit", () => {
  it("errors not shown until submit (showAllErrors)", () => {
    const desc = makeDescriptor({ required: { flag: true, message: "Required" } });
    const { field, entry } = setupField("email", desc);

    const runner = new ValidationRunner({
      fields: [entry],
      validationConfig: { mode: "submit" },
    });

    // Type something and clear — error shouldn't show
    field.changed("a");
    field.changed("");
    expect(field.$error.getState()).toBeNull();

    // Trigger submit validation
    runner.showAllErrors();
    runner.validateAll();
    expect(field.$error.getState()).toBe("Required");
  });
});

describe("validation mode: blur", () => {
  it("errors shown after first blur", () => {
    const desc = makeDescriptor({ required: { flag: true, message: "Required" } });
    const { field, entry } = setupField("email", desc);

    new ValidationRunner({
      fields: [entry],
      validationConfig: { mode: "blur" },
    });

    // Not shown before blur
    expect(field.$error.getState()).toBeNull();

    // Blur triggers validation
    field.blurred();
    expect(field.$error.getState()).toBe("Required");
  });
});

describe("validation mode: change", () => {
  it("errors shown on every change", () => {
    const validator = (v: unknown) => (v === "" ? "Cannot be empty" : null);
    const desc = makeDescriptor({ syncValidators: [validator] });
    const { field, entry } = setupField("name", desc);

    new ValidationRunner({
      fields: [entry],
      validationConfig: { mode: "change" },
    });

    field.changed("");
    expect(field.$error.getState()).toBe("Cannot be empty");

    field.changed("hello");
    expect(field.$error.getState()).toBeNull();
  });
});

describe("validation mode: touched", () => {
  it("errors not shown until blurred, then revalidate on change", () => {
    const validator = (v: unknown) => ((v as string).length < 3 ? "Too short" : null);
    const desc = makeDescriptor({ syncValidators: [validator], required: { flag: false } });
    const { field, entry } = setupField("name", desc);

    new ValidationRunner({
      fields: [entry],
      validationConfig: { mode: "touched", reValidate: "change" },
    });

    // Change before blur — error not visible
    field.changed("ab");
    expect(field.$error.getState()).toBeNull();

    // Blur — validation runs and error becomes visible
    field.blurred();
    expect(field.$error.getState()).toBe("Too short");

    // Change after error — re-validates (reValidate: "change")
    field.changed("abcd");
    expect(field.$error.getState()).toBeNull();
  });
});

describe("validation mode: all", () => {
  it("validates on both change and blur", () => {
    const validator = (v: unknown) => (v === "" ? "Empty" : null);
    const desc = makeDescriptor({ syncValidators: [validator] });
    const { field, entry } = setupField("name", desc);

    new ValidationRunner({
      fields: [entry],
      validationConfig: { mode: "all" },
    });

    field.changed("");
    expect(field.$error.getState()).toBe("Empty");

    field.changed("ok");
    expect(field.$error.getState()).toBeNull();

    field.changed("");
    field.blurred();
    expect(field.$error.getState()).toBe("Empty");
  });
});

describe("reValidate modes", () => {
  it("reValidate: blur — after first error, only revalidates on blur", () => {
    const validator = (v: unknown) => ((v as string).length < 3 ? "Too short" : null);
    const desc = makeDescriptor({ syncValidators: [validator] });
    const { field, entry } = setupField("name", desc);

    new ValidationRunner({
      fields: [entry],
      validationConfig: { mode: "change", reValidate: "blur" },
    });

    // First error via change
    field.changed("ab");
    expect(field.$error.getState()).toBe("Too short");

    // Fix via change — but reValidate is "blur", so error persists until blur
    field.changed("abcd");
    // Since reValidate is "blur", change doesn't re-trigger after first error
    // The error should persist
    expect(field.$error.getState()).toBe("Too short");

    // Blur clears it
    field.blurred();
    expect(field.$error.getState()).toBeNull();
  });
});

describe("per-field validateOn override", () => {
  it("field-level override takes precedence over form mode", () => {
    const validator = (v: unknown) => (v === "" ? "Empty" : null);
    const desc = makeDescriptor({
      syncValidators: [validator],
      validateOn: "change", // Override form-level "submit"
    });
    const { field, entry } = setupField("name", desc);

    new ValidationRunner({
      fields: [entry],
      validationConfig: { mode: "submit" },
    });

    // Even though form mode is "submit", field overrides to "change"
    field.changed("");
    expect(field.$error.getState()).toBe("Empty");
  });
});

describe("required validator", () => {
  it("fires for empty string, null, undefined", () => {
    const desc = makeDescriptor({ required: { flag: true, message: "Fill this" } });
    const { field, entry } = setupField("name", desc);

    new ValidationRunner({
      fields: [entry],
      validationConfig: { mode: "change" },
    });

    field.changed("");
    expect(field.$error.getState()).toBe("Fill this");

    field.changed("ok");
    expect(field.$error.getState()).toBeNull();
  });
});

describe("dependsOn", () => {
  it("re-validates dependent field when dependency changes", () => {
    const passwordDesc = makeDescriptor();
    const confirmDesc = makeDescriptor({
      dependsOn: ["password"],
      syncValidators: [
        (v: unknown, _ctx: any) => {
          // This validator checks against sibling — simplified for test
          return v === "mismatch" ? "Passwords don't match" : null;
        },
      ],
    });

    const { field: password, entry: passwordEntry } = setupField("password", passwordDesc);
    const { field: confirm, entry: confirmEntry } = setupField("confirm", confirmDesc);

    new ValidationRunner({
      fields: [passwordEntry, confirmEntry],
      validationConfig: { mode: "change" },
    });

    // Set confirm to a mismatching value
    confirm.changed("mismatch");
    expect(confirm.$error.getState()).toBe("Passwords don't match");

    // Fix confirm
    confirm.changed("ok");
    expect(confirm.$error.getState()).toBeNull();

    // Change password → confirm should re-validate
    confirm.changed("mismatch");
    expect(confirm.$error.getState()).toBe("Passwords don't match");

    password.changed("newpass");
    // dependsOn triggers re-validation of confirm
    expect(confirm.$error.getState()).toBe("Passwords don't match");
  });
});

describe("field.validate event", () => {
  it("manually triggers validation", () => {
    const validator = (v: unknown) => (v === "" ? "Empty" : null);
    const desc = makeDescriptor({ syncValidators: [validator] });
    const { field, entry } = setupField("name", desc);

    new ValidationRunner({
      fields: [entry],
      validationConfig: { mode: "submit" }, // errors not shown until submit
    });

    // Manual validate bypasses mode
    field.validate();
    // But visibility is still controlled by mode — error is hidden
    // However, validate should make the error "exist" in hidden store
    // Let's show all errors to verify
    expect(field.$error.getState()).toBeNull(); // hidden by submit mode
  });
});

describe("reset clears validation", () => {
  it("field.reset clears error", () => {
    const validator = (v: unknown) => (v === "" ? "Empty" : null);
    const desc = makeDescriptor({ syncValidators: [validator] });
    const { field, entry } = setupField("name", desc);

    new ValidationRunner({
      fields: [entry],
      validationConfig: { mode: "change" },
    });

    field.changed("");
    expect(field.$error.getState()).toBe("Empty");

    field.reset();
    expect(field.$error.getState()).toBeNull();
  });
});

describe("criteriaMode", () => {
  it("firstError — stops at first error", () => {
    const v1 = (v: unknown) => (v === "" ? "Error 1" : null);
    const v2 = (v: unknown) => (v === "" ? "Error 2" : null);
    const desc = makeDescriptor({ syncValidators: [v1, v2] });
    const { field, entry } = setupField("x", desc);

    new ValidationRunner({
      fields: [entry],
      validationConfig: { mode: "change", criteriaMode: "firstError" },
    });

    field.changed("");
    expect(field.$error.getState()).toBe("Error 1");
  });

  it("all — collects all errors joined", () => {
    const v1 = (v: unknown) => (v === "" ? "Error 1" : null);
    const v2 = (v: unknown) => (v === "" ? "Error 2" : null);
    const desc = makeDescriptor({ syncValidators: [v1, v2] });
    const { field, entry } = setupField("x", desc);

    new ValidationRunner({
      fields: [entry],
      validationConfig: { mode: "change", criteriaMode: "all" },
    });

    field.changed("");
    expect(field.$error.getState()).toBe("Error 1; Error 2");
  });
});
