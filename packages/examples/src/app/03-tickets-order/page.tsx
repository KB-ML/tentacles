import { EffectorNext } from "@effector/next";
import { fork, serialize } from "effector";
import { TicketsPage } from "./pages/index";

export const dynamic = "force-dynamic";

export default async function Page() {
  const scope = fork();
  const values = serialize(scope);

  return (
    <EffectorNext values={values}>
      <TicketsPage />
    </EffectorNext>
  );
}
