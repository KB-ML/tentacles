import { EffectorNext } from "@effector/next";
import { fork, serialize } from "effector";
import { restaurantModel } from "./entities/restaurant";
import { FoodOrderPage } from "./pages/index";

export const dynamic = "force-dynamic";

export default async function Page() {
  const res = await fetch("http://localhost:3000/api/02-food-order");
  const data = await res.json();

  const scope = fork();
  await restaurantModel.createMany(data.restaurants, { scope });
  const values = serialize(scope);

  return (
    <EffectorNext values={values}>
      <FoodOrderPage />
    </EffectorNext>
  );
}
