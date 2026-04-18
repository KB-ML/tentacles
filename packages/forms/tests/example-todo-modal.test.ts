import { describe, expect, it } from "vitest";
import { createFormContract, createFormViewModel } from "../index";

describe("Example: Todo modal port", () => {
  const todoFormContract = createFormContract()
    .field("title", (f) => f<string>().default("").required("Title is required"))
    .field("priority", (f) => f<string>().default("medium"))
    .field("categoryId", (f) => f<number | null>().default(null).required("Please select a category"));

  const todoFormViewModel = createFormViewModel({
    name: "todoForm",
    contract: todoFormContract,
    validate: { mode: "touched", reValidate: "change" },
  });

  it("valid submit fires with values", () => {
    const { shape } = todoFormViewModel.instantiate();
    const form = shape as any;
    const results: unknown[] = [];
    form.submitted.watch((v: unknown) => results.push(v));

    form.title.changed("Buy groceries");
    form.priority.changed("high");
    form.categoryId.changed(1);
    form.submit();

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: "Buy groceries",
      priority: "high",
      categoryId: 1,
    });
  });

  it("invalid submit shows errors", () => {
    const { shape } = todoFormViewModel.instantiate();
    const form = shape as any;
    const rejected: unknown[] = [];
    form.rejected.watch((v: unknown) => rejected.push(v));

    form.submit();

    expect(rejected).toHaveLength(1);
    expect(form.title.$error.getState()).toBe("Title is required");
    expect(form.categoryId.$error.getState()).toBe("Please select a category");
  });

  it("reset clears all fields", () => {
    const { shape } = todoFormViewModel.instantiate();
    const form = shape as any;

    form.title.changed("Test");
    form.submit(); // triggers errors on categoryId
    expect(form.title.$value.getState()).toBe("Test");

    form.reset();
    expect(form.title.$value.getState()).toBe("");
    expect(form.title.$error.getState()).toBeNull();
    expect(form.categoryId.$error.getState()).toBeNull();
  });

  it(".extend() works — modal wraps form", () => {
    // Simplified modal extension test
    const extended = todoFormViewModel.extend({
      name: "todoModal",
      fn: (model: any, { base }: any) => {
        return { ...model, ...base, custom: true };
      },
    });

    const { shape } = extended.instantiate();
    expect((shape as any).custom).toBe(true);
    expect((shape as any).title?.kind).toBe("field");
  });
});
