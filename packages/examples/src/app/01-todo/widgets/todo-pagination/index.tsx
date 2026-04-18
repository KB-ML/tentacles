"use client";

import { useModel } from "@kbml-tentacles/react";
import { Button, Flex, Text } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { todoViewModel } from "../../entities/todo";

export function TodoPagination() {
  const vm = useModel(todoViewModel);
  const [page, pagesCount] = useUnit([vm.$page, vm.$pagesCount]);
  const setPage = useUnit(vm.$page.set);

  if (pagesCount <= 1) return null;

  return (
    <Flex justify="between" align="center" mt="4" pt="3">
      <Text size="2" color="gray">
        Page {page + 1} of {pagesCount}
      </Text>
      <Flex gap="2">
        <Button variant="soft" size="2" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <Button
          variant="soft"
          size="2"
          disabled={page + 1 >= pagesCount}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </Flex>
    </Flex>
  );
}
