import { createContract, createModel } from "@kbml-tentacles/core";

const contract = createContract()
  .store("id", (s) => s<number>())
  .store("title", (s) => s<string>())
  .inverse("todos", "category")
  .pk("id");

export const categoryModel = createModel({ contract });
