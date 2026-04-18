"use client";

import { Each, useModel } from "@kbml-tentacles/react";
import { Flex, Table, Text } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { todoModel, todoViewModel } from "../../entities/todo";
import { TodoRow } from "../../entities/todo/ui";

function ResultsSummary() {
  const vm = useModel(todoViewModel);
  const [shownCount, totalCount, search] = useUnit([vm.$shownCount, vm.$totalCount, vm.$search]);

  return (
    <Text size="2" color="gray" mb="3" asChild>
      <p>
        Showing {shownCount} of {totalCount} results
        {search ? ` matching "${search}"` : ""}
      </p>
    </Text>
  );
}

export function TodoTable() {
  const vm = useModel(todoViewModel);

  return (
    <>
      <ResultsSummary />
      <Table.Root variant="surface">
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeaderCell width="40px" />
            <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell width="100px">Priority</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell width="120px">Category</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell width="100px">Created</Table.ColumnHeaderCell>
            <Table.ColumnHeaderCell width="70px" />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          <Each
            model={todoModel}
            source={vm.$todoIds}
            fallback={
              <Table.Row>
                <Table.Cell colSpan={6}>
                  <Flex justify="center" py="6">
                    <Text color="gray" size="2">
                      No todos found. Try adjusting your filters.
                    </Text>
                  </Flex>
                </Table.Cell>
              </Table.Row>
            }
          >
            <TodoRow />
          </Each>
        </Table.Body>
      </Table.Root>
    </>
  );
}
