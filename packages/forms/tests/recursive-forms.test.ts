import { describe, expect, it } from "vitest";
import { createFormContract } from "../index";
import { createFormShapeProxy } from "../src/runtime/build-form-shape";
import { createFormRuntimeContext } from "../src/runtime/form-runtime-context";

describe("recursive forms", () => {
  const commentContract: any = createFormContract()
    .field("author", (f) => f<string>().default(""))
    .field("body", (f) => f<string>().default(""))
    .array("replies", () => commentContract);

  function setup() {
    const context = createFormRuntimeContext("comments", commentContract, {});
    const form = createFormShapeProxy(commentContract, [], context) as any;
    return { form };
  }

  it("root has fields and replies array", () => {
    const { form } = setup();
    expect(form.author.kind).toBe("field");
    expect(form.body.kind).toBe("field");
    expect(form.replies.kind).toBe("array");
  });

  it("replies start empty (no infinite instantiation)", () => {
    const { form } = setup();
    expect(form.replies.$count.getState()).toBe(0);
  });

  it("can add a reply and it has the same shape (recursive)", () => {
    const { form } = setup();

    form.replies.append({ author: "Alice", body: "Hello" });
    expect(form.replies.$count.getState()).toBe(1);

    const replyIds = form.replies.$ids.getState();
    const reply = form.replies.instance(replyIds[0]!).getState();
    expect(reply).not.toBeNull();
    expect(reply.author).toBeDefined();
    expect(reply.body).toBeDefined();
    expect(reply.replies).toBeDefined();
    expect(reply.replies.kind).toBe("array");
  });

  it("nested replies work to 3 levels", () => {
    const { form } = setup();

    // Level 1
    form.replies.append({ author: "A", body: "Root reply" });
    const l1Ids = form.replies.$ids.getState();
    const l1 = form.replies.instance(l1Ids[0]!).getState();

    // Level 2
    l1.replies.append({ author: "B", body: "Nested reply" });
    const l2Ids = l1.replies.$ids.getState();
    const l2 = l1.replies.instance(l2Ids[0]!).getState();

    // Level 3
    l2.replies.append({ author: "C", body: "Deep reply" });
    expect(l2.replies.$count.getState()).toBe(1);

    const l3Ids = l2.replies.$ids.getState();
    const l3 = l2.replies.instance(l3Ids[0]!).getState();
    expect(l3).not.toBeNull();
    expect(l3.replies.kind).toBe("array");
    expect(l3.replies.$count.getState()).toBe(0);
  });
});

describe("recursive tree (sub via thunk)", () => {
  it("tree node with .sub() thunk works", () => {
    const nodeContract: any = createFormContract()
      .field("label", (f) => f<string>().default(""))
      .sub("child", () => nodeContract);

    const context = createFormRuntimeContext("tree", nodeContract, {});
    const form = createFormShapeProxy(nodeContract, [], context) as any;

    expect(form.label.kind).toBe("field");
    expect(form.child.kind).toBe("form");
    expect(form.child.label.kind).toBe("field");
    expect(form.child.child.kind).toBe("form");
  });
});
