import { createFormContract, createFormViewModel } from "@kbml-tentacles/forms";
import type { TodoPriority } from "./";

const contract = createFormContract()
  .field("title", (f) => f<string>().default("").required("Title is required"))
  .field("priority", (f) => f<TodoPriority>().default("medium"))
  .field("isCreatingNewCategory", (f) => f<boolean>().default(false))
  .field("categoryId", (f) =>
    f<number | null>()
      .default(null)
      .dependsOn("isCreatingNewCategory")
      .custom((v, ctx) => {
        if (!ctx.values.isCreatingNewCategory && v === null) return "Please select a category";
        return null;
      }),
  )
  .field("newCategoryName", (f) =>
    f<string>()
      .default("")
      .dependsOn("isCreatingNewCategory")
      .custom((v, ctx) => {
        if (ctx.values.isCreatingNewCategory && !v.trim()) return "Category name is required";
        return null;
      }),
  );

export const todoFormViewModel = createFormViewModel({
  contract,
  validate: { mode: "submit", reValidate: "change" },
});
