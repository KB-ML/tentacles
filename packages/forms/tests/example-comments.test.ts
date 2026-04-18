import { describe, expect, it } from "vitest";
import { createFormContract, createFormViewModel } from "../index";

describe("Example: Comment thread (recursive)", () => {
  const commentContract: any = createFormContract()
    .field("author", (f) => f<string>().default("").required())
    .field("body", (f) => f<string>().default("").required())
    .array("replies", () => commentContract);

  const commentVM = createFormViewModel({
    name: "commentThread",
    contract: commentContract,
  });

  it("root form has fields and replies array", () => {
    const { shape } = commentVM.instantiate();
    const form = shape as any;

    expect(form.author.kind).toBe("field");
    expect(form.body.kind).toBe("field");
    expect(form.replies.kind).toBe("array");
    expect(form.replies.$count.getState()).toBe(0);
  });

  it("add reply and access its fields", () => {
    const { shape } = commentVM.instantiate();
    const form = shape as any;

    form.replies.append({ author: "Alice", body: "Hello" });
    expect(form.replies.$count.getState()).toBe(1);

    const replyIds = form.replies.$ids.getState();
    const reply = form.replies.instance(replyIds[0]).getState();
    expect(reply.author).toBeDefined();
    expect(reply.body).toBeDefined();
    expect(reply.replies.kind).toBe("array");
  });

  it("nested replies work to 3 levels", () => {
    const { shape } = commentVM.instantiate();
    const form = shape as any;

    // Level 1
    form.replies.append({ author: "A", body: "Top" });
    const l1 = form.replies.instance(form.replies.$ids.getState()[0]).getState();

    // Level 2
    l1.replies.append({ author: "B", body: "Reply" });
    const l2 = l1.replies.instance(l1.replies.$ids.getState()[0]).getState();

    // Level 3
    l2.replies.append({ author: "C", body: "Deep" });
    expect(l2.replies.$count.getState()).toBe(1);
  });
});
