import { describe, expect, it } from "vitest";
import { createEvent, createStore } from "effector";
import { buildField } from "../src/runtime/build-field";
import { wireSetErrorOrchestrator } from "../src/orchestrators/set-error-orchestrator";
import { createFormContract } from "../index";
import { createFormShapeProxy } from "../src/runtime/build-form-shape";
import { createFormRuntimeContext } from "../src/runtime/form-runtime-context";
import type { SetErrorPayload } from "../src/types/form-shape";

function makeSid(suffix: string) {
  return `tentacles:forms:test:${suffix}`;
}

describe("SetErrorOrchestrator", () => {
  function setup() {
    const address = createFormContract()
      .field("city", (f) => f<string>().default(""))
      .field("zip", (f) => f<string>().default(""));

    const contract = createFormContract()
      .field("email", (f) => f<string>().default(""))
      .field("name", (f) => f<string>().default(""))
      .sub("address", address);

    const context = createFormRuntimeContext("test", contract, {});
    const form = createFormShapeProxy(contract, [], context) as any;

    // Materialize fields
    void form.email;
    void form.name;
    void form.address.city;
    void form.address.zip;

    const setError = createEvent<SetErrorPayload>();
    const setErrors = createEvent<Record<string, string>>();
    const clearErrors = createEvent<void | string | string[]>();
    const setFormError = createEvent<string | null>();
    const $formError = createStore<string | null>(null);

    const fields = [
      { path: "email", field: form.email },
      { path: "name", field: form.name },
      { path: "address.city", field: form.address.city },
      { path: "address.zip", field: form.address.zip },
    ];

    wireSetErrorOrchestrator({
      setError,
      setErrors,
      clearErrors,
      setFormError,
      $formError: $formError as any,
      formProxy: form,
      fields,
    });

    return { form, setError, setErrors, clearErrors, setFormError, $formError };
  }

  it("setError sets error on a single field", () => {
    const { form, setError } = setup();
    setError({ path: "email", error: "Email taken" });
    expect(form.email.$error.getState()).toBe("Email taken");
  });

  it("setError with nested path", () => {
    const { form, setError } = setup();
    setError({ path: "address.zip", error: "Invalid zip" });
    expect(form.address.zip.$error.getState()).toBe("Invalid zip");
  });

  it("setError with __root__ sets form error", () => {
    const { $formError, setError } = setup();
    setError({ path: "__root__", error: "Login failed" });
    expect($formError.getState()).toBe("Login failed");
  });

  it("setErrors with path-keyed map", () => {
    const { form, setErrors } = setup();
    setErrors({
      "email": "Taken",
      "address.zip": "Bad format",
    });
    expect(form.email.$error.getState()).toBe("Taken");
    expect(form.address.zip.$error.getState()).toBe("Bad format");
    expect(form.name.$error.getState()).toBeNull();
  });

  it("clearErrors() clears all", () => {
    const { form, setErrors, clearErrors } = setup();
    setErrors({ email: "err", name: "err" });
    expect(form.email.$error.getState()).toBe("err");

    clearErrors();
    expect(form.email.$error.getState()).toBeNull();
    expect(form.name.$error.getState()).toBeNull();
  });

  it("clearErrors(path) clears one field", () => {
    const { form, setErrors, clearErrors } = setup();
    setErrors({ email: "err", name: "err" });

    clearErrors("email" as any);
    expect(form.email.$error.getState()).toBeNull();
    expect(form.name.$error.getState()).toBe("err");
  });

  it("clearErrors([paths]) clears multiple", () => {
    const { form, setErrors, clearErrors } = setup();
    setErrors({ email: "err", name: "err", "address.city": "err" });

    clearErrors(["email", "address.city"] as any);
    expect(form.email.$error.getState()).toBeNull();
    expect(form.name.$error.getState()).toBe("err");
    expect(form.address.city.$error.getState()).toBeNull();
  });

  it("setFormError sets $formError", () => {
    const { $formError, setFormError } = setup();
    setFormError("Server error");
    expect($formError.getState()).toBe("Server error");

    setFormError(null);
    expect($formError.getState()).toBeNull();
  });
});
