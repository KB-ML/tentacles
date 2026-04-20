import { createContract } from "@kbml-tentacles/core";

export const categoryContract = createContract()
  .store("id", (s) => s<number>())
  .store("title", (s) => s<string>())
  .inverse("todos", "category")
  .pk("id");
