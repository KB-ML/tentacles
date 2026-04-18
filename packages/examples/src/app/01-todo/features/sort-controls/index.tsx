"use client";

import { useModel } from "@kbml-tentacles/react";
import { Button, Select } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { todoViewModel } from "../../entities/todo";

export function SortFieldSelect() {
  const vm = useModel(todoViewModel);
  const sortField = useUnit(vm.$sortField);
  const setSortField = useUnit(vm.$sortField.set);

  return (
    <Select.Root
      value={sortField}
      onValueChange={(v) => setSortField(v as "createdAt" | "priorityNumber")}
    >
      <Select.Trigger style={{ minWidth: 140 }} />
      <Select.Content>
        <Select.Item value="createdAt">Created Date</Select.Item>
        <Select.Item value="priorityNumber">Priority</Select.Item>
      </Select.Content>
    </Select.Root>
  );
}

export function SortDirectionToggle() {
  const vm = useModel(todoViewModel);
  const sortDirection = useUnit(vm.$sortDirection);
  const setDirection = useUnit(vm.$sortDirection.set);

  return (
    <Button
      variant="outline"
      size="2"
      onClick={() => setDirection(sortDirection === "asc" ? "desc" : "asc")}
    >
      {sortDirection === "asc" ? "\u2191 Ascending" : "\u2193 Descending"}
    </Button>
  );
}

export function PerPageSelect() {
  const vm = useModel(todoViewModel);
  const perPage = useUnit(vm.$perPage);
  const setPerPage = useUnit(vm.$perPage.set);

  return (
    <Select.Root
      value={String(perPage)}
      onValueChange={(v) => {
        const n = Number(v);
        if (n === 5 || n === 10 || n === 20) setPerPage(n);
      }}
    >
      <Select.Trigger style={{ minWidth: 80 }} />
      <Select.Content>
        <Select.Item value="5">5</Select.Item>
        <Select.Item value="10">10</Select.Item>
        <Select.Item value="20">20</Select.Item>
      </Select.Content>
    </Select.Root>
  );
}
