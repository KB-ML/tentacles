import { createViewContract, eq } from "@kbml-tentacles/core";
import { sample } from "effector";
import { todoModel } from "./todo";
import { todoFormViewModel } from "./todo-form-view-model";

function resolveCategory(values: {
  isCreatingNewCategory: boolean;
  categoryId: number | null;
  newCategoryName: string;
}) {
  return values.isCreatingNewCategory
    ? { category: { id: Date.now(), title: values.newCategoryName.trim() } }
    : { categoryId: values.categoryId! };
}

const modalContract = createViewContract()
  .store("open", (s) => s<boolean>().default(false))
  .store("todoId", (s) => s<number | null>().default(null));

export const todoModalViewModel = todoFormViewModel.extend({
  name: "todoModal",
  contract: modalContract,
  fn: (model, { base }) => {
    sample({
      source: model.$open.set,
      filter: (open) => !open,
      fn: () => null,
      target: [base.reset, model.$todoId.set],
    });

    sample({
      clock: model.$todoId,
      source: todoModel.query().where("id", eq(model.$todoId)).$first,
      target: base.resetTo,
    });

    sample({
      clock: base.submitted,
      source: model.$todoId,
      filter: (todoId) => todoId === null,
      fn: (_, values) => ({
        id: Date.now(),
        title: values.title.trim(),
        priority: values.priority,
        createdAt: new Date().toISOString(),
        ...resolveCategory(values),
      }),
      target: todoModel.createFx,
    });

    sample({
      clock: base.submitted,
      source: model.$todoId,
      filter: (todoId) => todoId !== null,
      fn: (id, values) => ({
        id: id!,
        data: {
          title: values.title.trim(),
          priority: values.priority,
          ...resolveCategory(values),
        },
      }),
      target: todoModel.updateFx,
    });

    sample({ clock: base.submitted, fn: () => false, target: model.$open.set });

    return { ...model, form: base };
  },
});
