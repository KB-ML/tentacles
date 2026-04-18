"use client";

import { Each, useModel } from "@kbml-tentacles/react";
import { Select } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { categoryModel, todoViewModel } from "../../entities/todo";
import { CategoryOption } from "../../entities/todo/ui";

export function CategoryFilter() {
  const vm = useModel(todoViewModel);
  const categoryId = useUnit(vm.$selectedCategoryId);
  const setCategory = useUnit(vm.$selectedCategoryId.set);

  return (
    <Select.Root
      value={categoryId != null ? String(categoryId) : "all"}
      onValueChange={(v) => setCategory(v === "all" ? null : Number(v))}
    >
      <Select.Trigger style={{ minWidth: 160 }} />
      <Select.Content>
        <Select.Item value="all">All Categories</Select.Item>
        <Select.Separator />
        <Each model={categoryModel} source={vm.$categoryIds}>
          <CategoryOption />
        </Each>
      </Select.Content>
    </Select.Root>
  );
}
