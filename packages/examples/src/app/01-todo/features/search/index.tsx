"use client";

import { useModel } from "@kbml-tentacles/react";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { Box, TextField } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { todoViewModel } from "../../entities/todo";

export function SearchInput() {
  const vm = useModel(todoViewModel);
  const search = useUnit(vm.$search);
  const setSearch = useUnit(vm.$search.set);

  return (
    <Box mb="4">
      <TextField.Root
        size="3"
        placeholder="Search todos by title..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      >
        <TextField.Slot>
          <MagnifyingGlassIcon />
        </TextField.Slot>
      </TextField.Root>
    </Box>
  );
}
