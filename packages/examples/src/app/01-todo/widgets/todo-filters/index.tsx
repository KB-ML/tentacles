"use client";

import { Flex } from "@radix-ui/themes";
import { Label } from "../../../../shared/ui";
import { CategoryFilter } from "../../features/category-filter";
import { HideCompletedToggle } from "../../features/hide-completed";
import { PriorityFilter } from "../../features/priority-filter";
import { PerPageSelect, SortDirectionToggle, SortFieldSelect } from "../../features/sort-controls";

export function TodoFilters() {
  return (
    <Flex gap="3" wrap="wrap" align="end">
      <Label title="Category">
        <CategoryFilter />
      </Label>
      <Label as="div" title="Priority">
        <Flex gap="1">
          <PriorityFilter />
        </Flex>
      </Label>
      <Label title="Status">
        <HideCompletedToggle />
      </Label>
      <Label title="Sort by">
        <SortFieldSelect />
      </Label>
      <Label title="Direction">
        <SortDirectionToggle />
      </Label>
      <Label title="Per page">
        <PerPageSelect />
      </Label>
    </Flex>
  );
}
