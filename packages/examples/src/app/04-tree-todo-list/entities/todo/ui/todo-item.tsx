"use client";

import { Each, useModel } from "@kbml-tentacles/react";
import { Cross1Icon, PlusIcon } from "@radix-ui/react-icons";
import { Box, Checkbox, Flex, IconButton, Text, TextField } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { todoModel } from "../model";
import { treeTodoViewModel } from "../model/view-model";

export function TodoItem() {
  const todo = useModel(todoModel);
  const vm = useModel(treeTodoViewModel);

  const [
    id,
    title,
    done,
    editing,
    titleDraft,
    setDone,
    setEditing,
    setTitle,
    setTitleDraft,
    filterMode,
    createTodo,
    deleteTodo,
  ] = useUnit([
    todo.$id,
    todo.$title,
    todo.$done,
    todo.$editing,
    todo.$titleDraft,
    todo.$done.set,
    todo.$editing.set,
    todo.$title.set,
    todo.$titleDraft.set,
    vm.$filterMode,
    todoModel.createFx,
    todoModel.deleteFx,
  ]);

  const childIds = useUnit(todo.$children);

  const visible =
    filterMode === "all" ||
    (filterMode === "active" && !done) ||
    (filterMode === "completed" && done);

  if (!visible) return null;

  const saveDraft = () => {
    const t = titleDraft.trim();
    if (!t) {
      deleteTodo(id);
      return;
    }
    setTitle(t);
    setEditing(false);
  };

  const startEdit = () => {
    setTitleDraft(title);
    setEditing(true);
  };

  return (
    <Box>
      <Flex align="center" gap="2" py="1">
        <Checkbox checked={done} onCheckedChange={(v) => setDone(v === true)} />

        {editing ? (
          <TextField.Root
            style={{ flex: 1 }}
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveDraft();
              if (e.key === "Escape") {
                if (!title) deleteTodo(id);
                else setEditing(false);
              }
            }}
          />
        ) : (
          <Text
            onDoubleClick={startEdit}
            style={{
              flex: 1,
              textDecoration: done ? "line-through" : undefined,
              opacity: done ? 0.5 : 1,
              cursor: "text",
            }}
          >
            {title}
          </Text>
        )}

        {childIds.length > 0 && (
          <Text size="1" color="gray">
            {childIds.length} subtask{childIds.length === 1 ? "" : "s"}
          </Text>
        )}

        <IconButton
          variant="ghost"
          size="1"
          onClick={() => createTodo({ title: "", parentId: id, editing: true })}
          title="Add subtask"
        >
          <PlusIcon />
        </IconButton>
        <IconButton
          variant="ghost"
          size="1"
          color="red"
          onClick={() => deleteTodo(id)}
          title="Remove"
        >
          <Cross1Icon />
        </IconButton>
      </Flex>

      {childIds.length > 0 && (
        <Box style={{ marginLeft: 24 }}>
          <Each model={todoModel} source={todo.$children}>
            <TodoItem />
          </Each>
        </Box>
      )}
    </Box>
  );
}
