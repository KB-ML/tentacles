"use client";

import { useModel, View } from "@kbml-tentacles/react";
import { Badge, Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { todoViewModel } from "../../entities/todo";
import { todoModalViewModel } from "../../entities/todo/model/todo-modal-view-model";
import { SearchInput } from "../../features/search";
import { TodoFilters } from "../../widgets/todo-filters";
import { TodoModal } from "../../widgets/todo-modal";
import { TodoPagination } from "../../widgets/todo-pagination";
import { TodoStatusBar } from "../../widgets/todo-status-bar";
import { TodoTable } from "../../widgets/todo-table";

function TodoHeader() {
  const vm = useModel(todoViewModel);
  const [totalCount, activeCount] = useUnit([vm.$totalCount, vm.$activeCount]);

  return (
    <Flex justify="between" align="center" mb="5">
      <Box>
        <Heading size="7" mb="1">
          Todo Lists
        </Heading>
        <Text size="2" color="gray">
          Search, filter and organize your tasks
        </Text>
      </Box>
      <Flex gap="2">
        <Badge size="2" variant="soft">
          {totalCount} total
        </Badge>
        <Badge size="2" variant="soft" color="blue">
          {activeCount} active
        </Badge>
      </Flex>
    </Flex>
  );
}

function CreateTodoButton() {
  const vm = useModel(todoModalViewModel);
  const setOpen = useUnit(vm.$open.set);
  return <Button onClick={() => setOpen(true)}>Create Todo</Button>;
}

export function TodoPage() {
  return (
    <View model={todoViewModel}>
      <View model={todoModalViewModel}>
        <Box>
          <TodoHeader />
          <SearchInput />
          <Flex mb="5" justify="between" align="end" wrap="wrap" gap="3">
            <TodoFilters />
            <CreateTodoButton />
          </Flex>
          <TodoTable />
          <TodoStatusBar />
          <TodoPagination />
          <TodoModal />
        </Box>
      </View>
    </View>
  );
}
