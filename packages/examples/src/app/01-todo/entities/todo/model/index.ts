import { categoryModel as categoryModelBase } from "./category";
import { todoModel as todoModelBase } from "./todo";

export const todoModel = todoModelBase.bind({ category: () => categoryModelBase });
export const categoryModel = categoryModelBase.bind({ todos: () => todoModelBase });

export { todoModalViewModel } from "./todo-modal-view-model";
export { todoViewModel } from "./todo-view-model";
export * from "./types";
