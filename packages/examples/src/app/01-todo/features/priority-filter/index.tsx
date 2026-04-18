"use client";

import { useModel } from "@kbml-tentacles/react";
import { Button } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { ALL_PRIORITIES, type TodoPriority, todoViewModel } from "../../entities/todo";

const priorityLabels: Record<TodoPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export function PriorityFilter() {
  const vm = useModel(todoViewModel);
  const selected = useUnit(vm.$selectedPriorities);
  const setSelected = useUnit(vm.$selectedPriorities.set);

  const toggle = (p: TodoPriority) => {
    if (selected === null) {
      // Nothing filtered yet — select only this one
      setSelected([p]);
    } else if (selected.includes(p)) {
      const next = selected.filter((s) => s !== p);
      setSelected(next.length === 0 ? null : next);
    } else {
      const next = [...selected, p];
      // All selected = same as no filter
      setSelected(next.length === ALL_PRIORITIES.length ? null : next);
    }
  };

  return (
    <>
      {ALL_PRIORITIES.map((p) => {
        return (
          <Button
            key={p}
            variant={selected?.includes(p) ? "solid" : "outline"}
            size="1"
            style={{ cursor: "pointer" }}
            onClick={() => toggle(p)}
          >
            {priorityLabels[p]}
          </Button>
        );
      })}
    </>
  );
}
