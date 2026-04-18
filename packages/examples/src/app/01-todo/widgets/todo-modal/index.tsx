"use client";

import { useField } from "@kbml-tentacles/forms-react";
import { Each, useModel } from "@kbml-tentacles/react";
import { Cross1Icon } from "@radix-ui/react-icons";
import {
  Button,
  Dialog,
  Flex,
  IconButton,
  Select,
  Text,
  TextField,
  VisuallyHidden,
} from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { Label } from "../../../../shared/ui";
import {
  CategoryOption,
  categoryModel,
  type TodoPriority,
  todoModalViewModel,
} from "../../entities/todo";

const NEW_CATEGORY_VALUE = "__new__";

export const TodoModal = () => {
  const vm = useModel(todoModalViewModel);
  const [open, todoId] = useUnit([vm.$open, vm.$todoId]);
  const setOpen = useUnit(vm.$open.set);

  const submit = useUnit(vm.form.submit);

  const [title, newCatName] = useField([vm.form.title, vm.form.newCategoryName], true);

  const [priority, categoryId, isCreating] = useField([
    vm.form.priority,
    vm.form.categoryId,
    vm.form.isCreatingNewCategory,
  ]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Content maxWidth="450px">
        <Dialog.Title>{todoId ? "Edit" : "Create"} Todo</Dialog.Title>
        <VisuallyHidden>
          <Dialog.Description>{todoId ? "Edit" : "Create"} Todo</Dialog.Description>
        </VisuallyHidden>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Flex direction="column" gap="3">
            <Label title="Title">
              <TextField.Root
                placeholder="Enter todo title"
                {...title.register()}
                color={title.error ? "red" : undefined}
              />
              {title.error && (
                <Text size="1" color="red">
                  {title.error}
                </Text>
              )}
            </Label>

            <Label title="Priority">
              <Select.Root
                value={priority.value}
                onValueChange={(v) => priority.changed(v as TodoPriority)}
              >
                <Select.Trigger placeholder="Priority" />
                <Select.Content>
                  <Select.Item value="low">Low</Select.Item>
                  <Select.Item value="medium">Medium</Select.Item>
                  <Select.Item value="high">High</Select.Item>
                </Select.Content>
              </Select.Root>
            </Label>

            <Label title="Category">
              {isCreating.value ? (
                <Flex gap="2" align="center">
                  <TextField.Root
                    style={{ flex: 1 }}
                    placeholder="New category name"
                    {...newCatName.register()}
                    color={newCatName.error ? "red" : undefined}
                    autoFocus
                  />
                  <IconButton
                    variant="ghost"
                    color="gray"
                    size="1"
                    onClick={() => isCreating.changed(false)}
                  >
                    <Cross1Icon />
                  </IconButton>
                </Flex>
              ) : (
                <Select.Root
                  value={categoryId.value ? String(categoryId.value) : undefined}
                  onValueChange={(v) =>
                    v === NEW_CATEGORY_VALUE
                      ? isCreating.changed(true)
                      : categoryId.changed(Number(v))
                  }
                >
                  <Select.Trigger placeholder="Select category" />
                  <Select.Content>
                    <Each model={categoryModel} source={categoryModel.$ids}>
                      <CategoryOption />
                    </Each>
                    <Select.Separator />
                    <Select.Item value={NEW_CATEGORY_VALUE}>+ Create new category</Select.Item>
                  </Select.Content>
                </Select.Root>
              )}
              {(isCreating.value ? newCatName.error : categoryId.error) && (
                <Text size="1" color="red">
                  {isCreating.value ? newCatName.error : categoryId.error}
                </Text>
              )}
            </Label>

            <Flex justify="end" gap="2" mt="2">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit">{todoId ? "Update" : "Create"}</Button>
            </Flex>
          </Flex>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
};
