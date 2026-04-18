"use client";

import { useModel } from "@kbml-tentacles/react";
import { Badge, Button, Flex, Text } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { todoViewModel } from "../../entities/todo";

function ActiveCount() {
  const vm = useModel(todoViewModel);
  const activeCount = useUnit(vm.$activeCount);

  return (
    <Text size="2" weight="medium">
      {activeCount} item{activeCount !== 1 ? "s" : ""} left
    </Text>
  );
}

function ClearCompleted() {
  const vm = useModel(todoViewModel);
  const completedCount = useUnit(vm.$completedCount);
  const clearCompleted = useUnit(vm.clearCompleted);

  if (completedCount === 0) return null;

  return (
    <Button variant="ghost" size="1" color="red" onClick={() => clearCompleted()}>
      Clear completed ({completedCount})
    </Button>
  );
}

function PriorityStats() {
  const vm = useModel(todoViewModel);
  const stats = useUnit(vm.$priorityStats);

  return (
    <Flex gap="2" align="center">
      <Badge color="red" variant="soft" size="1">
        {stats.high} high
      </Badge>
      <Badge color="orange" variant="soft" size="1">
        {stats.medium} medium
      </Badge>
      <Badge color="gray" variant="soft" size="1">
        {stats.low} low
      </Badge>
    </Flex>
  );
}

export function TodoStatusBar() {
  return (
    <Flex justify="between" align="center" py="3" wrap="wrap" gap="3">
      <Flex gap="4" align="center">
        <ActiveCount />
        <PriorityStats />
      </Flex>
      <ClearCompleted />
    </Flex>
  );
}
