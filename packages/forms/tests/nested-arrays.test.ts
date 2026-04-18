import { describe, expect, it } from "vitest";
import { createFormContract } from "../index";
import { createFormShapeProxy } from "../src/runtime/build-form-shape";
import { createFormRuntimeContext } from "../src/runtime/form-runtime-context";

describe("nested arrays — 4-level survey structure", () => {
  const choiceContract = createFormContract()
    .field("label", (f) => f<string>().default(""))
    .field("value", (f) => f<string>().default(""));

  const questionContract = createFormContract()
    .field("prompt", (f) => f<string>().default(""))
    .array("choices", choiceContract, { min: 2 });

  const sectionContract = createFormContract()
    .field("title", (f) => f<string>().default(""))
    .array("questions", questionContract, { min: 1 });

  const surveyContract = createFormContract()
    .field("title", (f) => f<string>().default("My Survey"))
    .array("sections", sectionContract, { min: 1 });

  function setup() {
    const context = createFormRuntimeContext("survey", surveyContract, {});
    const form = createFormShapeProxy(surveyContract, [], context) as any;
    return { form };
  }

  it("root form has title field and sections array", () => {
    const { form } = setup();
    expect(form.title.kind).toBe("field");
    expect(form.sections.kind).toBe("array");
  });

  it("can add a section with a question with choices", () => {
    const { form } = setup();

    form.sections.append({ title: "Section 1" });
    expect(form.sections.$count.getState()).toBe(1);

    const sectionIds = form.sections.$ids.getState();
    const section = form.sections.instance(sectionIds[0]!).getState();
    expect(section).not.toBeNull();

    section.questions.append({ prompt: "What color?" });
    expect(section.questions.$count.getState()).toBe(1);

    const questionIds = section.questions.$ids.getState();
    const question = section.questions.instance(questionIds[0]!).getState();
    expect(question).not.toBeNull();

    question.choices.append({ label: "Red", value: "red" });
    question.choices.append({ label: "Blue", value: "blue" });
    expect(question.choices.$count.getState()).toBe(2);
  });

  it("sections $arrayError reflects min constraint", () => {
    const { form } = setup();

    // min: 1, starts empty
    expect(form.sections.$arrayError.getState()).toBe("At least 1 required");

    form.sections.append({ title: "S1" });
    expect(form.sections.$arrayError.getState()).toBeNull();
  });
});

describe("array inside sub-form", () => {
  it("sub-form containing an array works", () => {
    const tag = createFormContract()
      .field("name", (f) => f<string>().default(""));

    const contract = createFormContract()
      .sub(
        "settings",
        createFormContract()
          .field("theme", (f) => f<string>().default("dark"))
          .array("tags", tag),
      );

    const context = createFormRuntimeContext("test", contract, {});
    const form = createFormShapeProxy(contract, [], context) as any;

    expect(form.settings.kind).toBe("form");
    expect(form.settings.tags.kind).toBe("array");

    form.settings.tags.append({ name: "important" });
    expect(form.settings.tags.$count.getState()).toBe(1);
  });
});

describe("sub-form inside array row", () => {
  it("array rows can contain sub-forms", () => {
    const address = createFormContract()
      .field("city", (f) => f<string>().default(""));

    const personContract = createFormContract()
      .field("name", (f) => f<string>().default(""))
      .sub("address", address);

    const contract = createFormContract()
      .array("people", personContract);

    const context = createFormRuntimeContext("test", contract, {});
    const form = createFormShapeProxy(contract, [], context) as any;

    form.people.append({ name: "Alice" });

    const ids = form.people.$ids.getState();
    const person = form.people.instance(ids[0]!).getState();
    expect(person).not.toBeNull();
    expect(person.address).toBeDefined();
    expect(person.address.kind).toBe("form");
    expect(person.address.city.kind).toBe("field");
  });
});
