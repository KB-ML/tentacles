import { describe, expect, it } from "vitest";
import { createEvent, createStore } from "effector";
import { wireSubmitOrchestrator } from "../src/orchestrators/submit-orchestrator";

function setup(overrides: { preventDoubleSubmit?: boolean; valid?: boolean } = {}) {
  const submit = createEvent<void>();
  const $isSubmitting = createStore(false);
  const $isSubmitted = createStore(false);
  const $isSubmitSuccessful = createStore(false);
  const $submitCount = createStore(0);
  const $isValid = createStore(overrides.valid ?? true);
  const $values = createStore({ name: "test" });
  const $errors = createStore({});
  const validateAll = createEvent<void>();
  const showAllErrors = createEvent<void>();

  const result = wireSubmitOrchestrator({
    submit,
    $isSubmitting: $isSubmitting as any,
    $isSubmitted: $isSubmitted as any,
    $isSubmitSuccessful: $isSubmitSuccessful as any,
    $submitCount: $submitCount as any,
    $isValid,
    $values,
    $errors,
    preventDoubleSubmit: overrides.preventDoubleSubmit ?? true,
    validateAll,
    showAllErrors,
  });

  return {
    submit,
    $isSubmitting,
    $isSubmitted,
    $isSubmitSuccessful,
    $submitCount,
    ...result,
  };
}

describe("SubmitOrchestrator", () => {
  it("valid submit fires submitted with values", () => {
    const { submit, submitted, rejected, $isSubmitSuccessful, $submitCount } = setup({ valid: true });
    const results: unknown[] = [];
    submitted.watch((v) => results.push(v));

    submit();

    expect(results).toEqual([{ name: "test" }]);
    expect($isSubmitSuccessful.getState()).toBe(true);
    expect($submitCount.getState()).toBe(1);
  });

  it("invalid submit fires rejected with errors", () => {
    const { submit, submitted, rejected, $isSubmitSuccessful } = setup({ valid: false });
    const subResults: unknown[] = [];
    const rejResults: unknown[] = [];
    submitted.watch((v) => subResults.push(v));
    rejected.watch((v) => rejResults.push(v));

    submit();

    expect(subResults).toEqual([]);
    expect(rejResults).toHaveLength(1);
    expect($isSubmitSuccessful.getState()).toBe(false);
  });

  it("$isSubmitted is set on submit", () => {
    const { submit, $isSubmitted } = setup();
    expect($isSubmitted.getState()).toBe(false);
    submit();
    expect($isSubmitted.getState()).toBe(true);
  });

  it("$submitCount increments on each submit", () => {
    const { submit, $submitCount } = setup();
    submit();
    submit();
    submit();
    expect($submitCount.getState()).toBe(3);
  });

  it("preventDoubleSubmit blocks while submitting", () => {
    const submit = createEvent<void>();
    const $isSubmitting = createStore(true); // already submitting
    const $isSubmitted = createStore(false);
    const $isSubmitSuccessful = createStore(false);
    const $submitCount = createStore(0);
    const validateAll = createEvent<void>();
    const showAllErrors = createEvent<void>();

    const { submitted } = wireSubmitOrchestrator({
      submit,
      $isSubmitting: $isSubmitting as any,
      $isSubmitted: $isSubmitted as any,
      $isSubmitSuccessful: $isSubmitSuccessful as any,
      $submitCount: $submitCount as any,
      $isValid: createStore(true),
      $values: createStore({}),
      $errors: createStore({}),
      preventDoubleSubmit: true,
      validateAll,
      showAllErrors,
    });

    const results: unknown[] = [];
    submitted.watch((v) => results.push(v));

    submit();
    expect(results).toEqual([]); // blocked
    expect($submitCount.getState()).toBe(0);
  });

  it("$isSubmitting is false after completion", () => {
    const { submit, $isSubmitting } = setup({ valid: true });

    submit();
    // After sync validation + routing, submitting should be false
    expect($isSubmitting.getState()).toBe(false);
  });
});
