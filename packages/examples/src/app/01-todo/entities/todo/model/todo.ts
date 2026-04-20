import { createContract } from "@kbml-tentacles/core";

export const todoContract = createContract()
  .store("id", (s) => s<number>())
  .store("title", (s) => s<string>())
  .store("priority", (s) => s<"low" | "medium" | "high">())
  .derived("priorityNumber", (s) =>
    s.$priority.map((priority) => (priority === "low" ? 1 : priority === "medium" ? 2 : 3)),
  )
  .store("createdAt", (s) => s<string>())
  .store("categoryId", (s) => s<number>())
  .store("done", (s) => s<boolean>().default(false))
  .ref("category", "one", { fk: "categoryId" })
  .pk("id");
