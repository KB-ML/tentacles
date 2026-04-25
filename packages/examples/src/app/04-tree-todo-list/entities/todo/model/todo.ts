import { createContract, createModel } from "@kbml-tentacles/core";

export type FilterMode = "all" | "active" | "completed";

export const todoContract = createContract()
  .store("id", (s) => s<number>().autoincrement())
  .store("title", (s) => s<string>().default(""))
  .store("done", (s) => s<boolean>().default(false))
  .store("editing", (s) => s<boolean>().default(false))
  .store("titleDraft", (s) => s<string>().default(""))
  .store("parentId", (s) => s<number | null>().default(null))
  .ref("parent", "one", { fk: "parentId", onDelete: "cascade" })
  .inverse("children", "parent")
  .pk("id");

export const todoModel = createModel({ contract: todoContract });
