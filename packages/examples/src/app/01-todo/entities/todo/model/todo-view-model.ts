import { createViewContract, createViewModel, eq, includes, oneOf } from "@kbml-tentacles/core";
import { combine, createEffect, sample } from "effector";
import { categoryModel, todoModel } from "./index";
import type { TodoPerPage, TodoPriority, TodoSortingDirection, TodoSortingField } from "./types";

const contract = createViewContract()
  .store("search", (s) => s<string>().default(""))
  .store("selectedCategoryId", (s) => s<number | null>().default(null))
  .store("sortField", (s) => s<TodoSortingField>().default("createdAt"))
  .store("sortDirection", (s) => s<TodoSortingDirection>().default("desc"))
  .store("perPage", (s) => s<TodoPerPage>().default(10))
  .store("hideCompleted", (s) => s<boolean>().default(false))
  .store("selectedPriorities", (s) => s<TodoPriority[] | null>().default(null))
  .store("page", (s) =>
    s<number>()
      .default(0)
      .resetOn("perPage", "search", "selectedCategoryId", "hideCompleted", "selectedPriorities"),
  )
  .derived("offset", (s) => combine(s.$page, s.$perPage, (page, perPage) => page * perPage));

export const todoViewModel = createViewModel({
  contract,
  fn: (model, { mounted, unmounted }) => {
    const fetchTodosFx = createEffect(async () => (await fetch("/api/01-todo")).json());

    sample({
      clock: mounted,
      source: todoModel.$ids,
      filter: (ids) => ids.length === 0,
      target: fetchTodosFx,
    });
    sample({ clock: unmounted, target: [todoModel.clearFx, categoryModel.clearFx] });
    sample({
      clock: fetchTodosFx.doneData,
      fn: ({ todos }) => todos,
      target: todoModel.createManyFx,
    });
    sample({
      clock: fetchTodosFx.doneData,
      fn: ({ categories }) => categories,
      target: categoryModel.createManyFx,
    });

    const todosQuery = todoModel
      .query()
      .when(model.$selectedCategoryId, (q, id) => q.where("categoryId", eq(id)))
      .when(model.$hideCompleted, (q) => q.where("done", eq(false)))
      .when(model.$selectedPriorities, (q, priorities) => q.where("priority", oneOf(priorities)))
      .where("title", includes(model.$search))
      .orderBy(model.$sortField, model.$sortDirection)
      .limit(model.$perPage)
      .offset(model.$offset);

    // Completed todos query for "clear completed" action
    const completedQuery = todoModel.query().where("done", eq(true));

    // Active count query (not done)
    const activeQuery = todoModel.query().where("done", eq(false));

    // Priority stats via separate queries
    const highQuery = todoModel.query().where("priority", eq<TodoPriority>("high"));
    const mediumQuery = todoModel.query().where("priority", eq<TodoPriority>("medium"));
    const lowQuery = todoModel.query().where("priority", eq<TodoPriority>("low"));

    return {
      ...model,
      $pagesCount: combine(todosQuery.$totalCount, model.$perPage, (total, pageSize) =>
        Math.ceil(total / pageSize),
      ),
      $todoIds: todosQuery.$ids,
      $totalCount: todosQuery.$totalCount,
      $shownCount: todosQuery.$count,
      $categoryIds: categoryModel.$ids,
      // New: active/completed counts
      $activeCount: activeQuery.$count,
      $completedCount: completedQuery.$count,
      clearCompleted: completedQuery.delete,
      // New: priority stats
      $priorityStats: combine(
        highQuery.$count,
        mediumQuery.$count,
        lowQuery.$count,
        (high, medium, low) => ({ high, medium, low }),
      ),
    };
  },
});
