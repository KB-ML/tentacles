import { describe, expect, it } from "vitest";
import { createFormContract, createFormViewModel } from "../index";

describe("Example: Survey editor (4-level nesting)", () => {
  const choiceContract = createFormContract()
    .field("label", (f) => f<string>().default("").required())
    .field("value", (f) => f<string>().default("").required());

  const questionContract = createFormContract()
    .field("prompt", (f) => f<string>().default("").required())
    .field("type", (f) => f<"text" | "choice">().default("text"))
    .array("choices", choiceContract, { min: 2 });

  const sectionContract = createFormContract()
    .field("title", (f) => f<string>().default("").required())
    .array("questions", questionContract, { min: 1 });

  const surveyContract = createFormContract()
    .field("title", (f) => f<string>().default("").required())
    .array("sections", sectionContract, { min: 1 });

  const surveyVM = createFormViewModel({
    name: "survey",
    contract: surveyContract,
  });

  it("creates a 4-level deep survey", () => {
    const { shape } = surveyVM.instantiate();
    const form = shape as any;

    expect(form.title.kind).toBe("field");
    expect(form.sections.kind).toBe("array");

    // Add section
    form.sections.append({ title: "Section 1" });
    expect(form.sections.$count.getState()).toBe(1);

    // Add question to section
    const sectionIds = form.sections.$ids.getState();
    const section = form.sections.instance(sectionIds[0]).getState();
    section.questions.append({ prompt: "What color?" });
    expect(section.questions.$count.getState()).toBe(1);

    // Add choices to question
    const questionIds = section.questions.$ids.getState();
    const question = section.questions.instance(questionIds[0]).getState();
    question.choices.append({ label: "Red", value: "red" });
    question.choices.append({ label: "Blue", value: "blue" });
    expect(question.choices.$count.getState()).toBe(2);
  });

  it("sections $arrayError reflects min constraint", () => {
    const { shape } = surveyVM.instantiate();
    const form = shape as any;

    expect(form.sections.$arrayError.getState()).toBe("At least 1 required");
    form.sections.append({ title: "S1" });
    expect(form.sections.$arrayError.getState()).toBeNull();
  });

  it("submit with valid data", () => {
    const { shape } = surveyVM.instantiate();
    const form = shape as any;
    const submitted: unknown[] = [];
    form.submitted.watch((v: unknown) => submitted.push(v));

    form.title.changed("My Survey");
    form.sections.append({ title: "Part 1" });
    form.submit();

    expect(submitted).toHaveLength(1);
  });
});
