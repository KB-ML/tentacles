"use client";

import { Each, useModel } from "@kbml-tentacles/react";
import { Pencil1Icon, TrashIcon } from "@radix-ui/react-icons";
import { Badge, Checkbox, Flex, IconButton, Table, Text } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { categoryModel, todoModalViewModel, todoModel } from "../model";
import { CategoryName } from "./category-name";

const priorityConfig = {
  high: { color: "red" as const, label: "High" },
  medium: { color: "orange" as const, label: "Medium" },
  low: { color: "gray" as const, label: "Low" },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TodoRow() {
  const todo = useModel(todoModel);
  const modal = useModel(todoModalViewModel);

  const [id, title, priority, createdAt, done, setDone, deleteTodo] = useUnit([
    todo.$id,
    todo.$title,
    todo.$priority,
    todo.$createdAt,
    todo.$done,
    todo.$done.set,
    todoModel.deleteFx,
  ]);

  const [setOpen, setTodoId] = useUnit([modal.$open.set, modal.$todoId.set]);

  const cfg = priorityConfig[priority] ?? priorityConfig.low;

  return (
    <Table.Row align="center">
      <Table.Cell width="40px">
        <Flex align="center">
          <Checkbox checked={done} onCheckedChange={() => setDone(!done)} />
        </Flex>
      </Table.Cell>
      <Table.RowHeaderCell>
        <Text
          weight="medium"
          style={done ? { textDecoration: "line-through", opacity: 0.5 } : undefined}
        >
          {title}
        </Text>
      </Table.RowHeaderCell>
      <Table.Cell>
        <Badge color={cfg.color} variant="soft" size="1">
          {cfg.label}
        </Badge>
      </Table.Cell>
      <Table.Cell>
        <Each model={categoryModel} id={todo.category.$id}>
          <CategoryName />
        </Each>
      </Table.Cell>
      <Table.Cell>
        <Text size="2" color="gray">
          {formatDate(createdAt)}
        </Text>
      </Table.Cell>
      <Table.Cell width="70px">
        <Flex align="center" gap="2">
          <IconButton
            variant="ghost"
            size="1"
            onClick={() => {
              setTodoId(id);
              setOpen(true);
            }}
          >
            <Pencil1Icon />
          </IconButton>
          <IconButton variant="ghost" size="1" color="red" onClick={() => deleteTodo(String(id))}>
            <TrashIcon />
          </IconButton>
        </Flex>
      </Table.Cell>
    </Table.Row>
  );
}
