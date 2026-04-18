import { EffectorNext } from "@effector/next";
import { fork, serialize } from "effector";
import { categoryModel, todoModel } from "./entities/todo";
import { TodoPage } from "./pages/index";

export const dynamic = "force-dynamic";

export default async function Page() {
  const res = await fetch("http://localhost:3000/api/01-todo");
  const data = await res.json();

  const scope = fork();

  await categoryModel.createMany(data.categories, { scope });
  await todoModel.createMany(data.todos, { scope });

  const values = serialize(scope);

  return (
    <EffectorNext values={values}>
      <TodoPage />
    </EffectorNext>
  );
}
