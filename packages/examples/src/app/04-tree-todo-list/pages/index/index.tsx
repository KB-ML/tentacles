"use client";

import { Each, useModel, View } from "@kbml-tentacles/react";
import {
  Box,
  Button,
  Checkbox,
  Flex,
  Heading,
  SegmentedControl,
  Text,
  TextField,
} from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { type FilterMode, todoModel, treeTodoViewModel } from "../../entities/todo/model";
import { TodoItem } from "../../entities/todo/ui/todo-item";

function DraftInput() {
  const vm = useModel(treeTodoViewModel);
  const [draft, setDraft, addTopLevel] = useUnit([vm.$draft, vm.$draft.set, vm.addTopLevel]);

  return (
    <TextField.Root
      placeholder="What needs to be done?"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") addTopLevel();
      }}
    />
  );
}

function ToggleAll() {
  const vm = useModel(treeTodoViewModel);
  const [allDone, toggleAll, totalCount] = useUnit([vm.$allDone, vm.toggleAll, vm.$totalCount]);
  if (totalCount === 0) return null;
  return (
    <Text as="label" size="2">
      <Flex gap="2" align="center">
        <Checkbox checked={allDone} onCheckedChange={() => toggleAll()} />
        Mark all as {allDone ? "active" : "done"}
      </Flex>
    </Text>
  );
}

function RootList() {
  const vm = useModel(treeTodoViewModel);
  return (
    <Each
      model={todoModel}
      source={vm.$rootIds}
      fallback={
        <Text color="gray" size="2">
          Nothing here yet. Type above and press Enter.
        </Text>
      }
    >
      <TodoItem />
    </Each>
  );
}

function Footer() {
  const vm = useModel(treeTodoViewModel);
  const [total, completed, filter, setFilter, clear] = useUnit([
    vm.$totalCount,
    vm.$completedCount,
    vm.$filterMode,
    vm.$filterMode.set,
    vm.clearCompleted,
  ]);

  if (total === 0) return null;

  return (
    <Flex justify="between" align="center" mt="4" gap="3" wrap="wrap">
      <Text size="2" color="gray">
        {total} todo{total === 1 ? "" : "s"} total
      </Text>
      <SegmentedControl.Root value={filter} onValueChange={(v) => setFilter(v as FilterMode)}>
        <SegmentedControl.Item value="all">All</SegmentedControl.Item>
        <SegmentedControl.Item value="active">Active</SegmentedControl.Item>
        <SegmentedControl.Item value="completed">Completed</SegmentedControl.Item>
      </SegmentedControl.Root>
      <Button variant="soft" color="gray" disabled={completed === 0} onClick={() => clear()}>
        Clear completed
      </Button>
    </Flex>
  );
}

export function TreeTodoPage() {
  return (
    <View model={treeTodoViewModel}>
      <Box>
        <Heading size="7" mb="1">
          Tree todo list
        </Heading>
        <Text size="2" color="gray" as="p" mb="5">
          Nested todos — each item can have its own subtasks of any depth.
        </Text>
        <Flex direction="column" gap="3">
          <DraftInput />
          <ToggleAll />
          <Box>
            <RootList />
          </Box>
          <Footer />
        </Flex>
      </Box>
    </View>
  );
}
