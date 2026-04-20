import { createModel } from "@kbml-tentacles/core";
import { categoryContract } from "./category";
import { todoContract } from "./todo";

export const todoModel = createModel({
  contract: todoContract,
  refs: { category: () => categoryModel },
});
export const categoryModel = createModel({
  contract: categoryContract,
  refs: { todos: () => todoModel },
});

export { todoModalViewModel } from "./todo-modal-view-model";
export { todoViewModel } from "./todo-view-model";
export * from "./types";
