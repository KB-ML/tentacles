import { EffectorNext } from "@effector/next";
import { fork, serialize } from "effector";
import { todoModel } from "./entities/todo/model";
import { TreeTodoPage } from "./pages/index";

export const dynamic = "force-dynamic";

export default async function Page() {
  const res = await fetch("http://localhost:3000/api/04-tree-todo-list");
  const data = await res.json();

  const scope = fork();
  await todoModel.createMany(data.todos, { scope });
  const values = serialize(scope);

  return (
    <EffectorNext values={values}>
      <TreeTodoPage />
    </EffectorNext>
  );
}
