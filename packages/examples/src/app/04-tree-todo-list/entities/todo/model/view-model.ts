import { createViewContract, createViewModel, eq } from "@kbml-tentacles/core";
import { combine, sample } from "effector";
import { spread } from "patronum";
import { type FilterMode, todoModel } from "./todo";

const contract = createViewContract()
  .store("draft", (s) => s<string>().default(""))
  .store("filterMode", (s) => s<FilterMode>().default("all"))
  .event("addTopLevel", (e) => e<void>())
  .event("toggleAll", (e) => e<void>())
  .event("clearCompleted", (e) => e<void>());

export const treeTodoViewModel = createViewModel({
  contract,
  fn: (model) => {
    sample({
      clock: model.addTopLevel,
      source: model.$draft,
      filter: (draft: string) => draft.trim().length > 0,
      fn: (draft) => ({
        create: { title: draft.trim() },
        draft: "",
      }),
      target: spread({
        create: todoModel.createFx,
        draft: model.$draft.set,
      }),
    });

    const completedQuery = todoModel.query().where("done", eq(true));
    const rootQuery = todoModel.query().where("parentId", eq<number | null>(null));
    const doneField = todoModel.query().field("done");

    const $allDone = combine(
      todoModel.$count,
      completedQuery.$count,
      (total, done) => total > 0 && done === total,
    );

    sample({
      clock: model.toggleAll,
      source: $allDone,
      fn: (allDone) => !allDone,
      target: doneField.update,
    });

    sample({ clock: model.clearCompleted, target: completedQuery.delete });

    return {
      ...model,
      $rootIds: rootQuery.$ids,
      $totalCount: todoModel.$count,
      $completedCount: completedQuery.$count,
      $allDone,
    };
  },
});
