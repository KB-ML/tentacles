"use client";

import { useModel } from "@kbml-tentacles/react";
import { Button } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { todoViewModel } from "../../entities/todo";

export function HideCompletedToggle() {
  const vm = useModel(todoViewModel);
  const hideCompleted = useUnit(vm.$hideCompleted);
  const setHideCompleted = useUnit(vm.$hideCompleted.set);

  return (
    <Button
      variant={hideCompleted ? "solid" : "outline"}
      size="2"
      onClick={() => setHideCompleted(!hideCompleted)}
    >
      {hideCompleted ? "✓ Active only" : "Show all"}
    </Button>
  );
}
