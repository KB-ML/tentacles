"use client";

import { useModel, View } from "@kbml-tentacles/react";
import { useUnit } from "effector-react";
import { cartOrderViewModel } from "../../view-models/cart-order-view-model";
import { dishComposeViewModel } from "../../view-models/dish-compose-view-model";
import { navigationViewModel } from "../../view-models/navigation-view-model";
import { DishScreen } from "../../widgets/dish-screen";
import { MenuScreen } from "../../widgets/menu-screen";
import { OrderScreen } from "../../widgets/order-screen";
import { RestaurantsScreen } from "../../widgets/restaurants-screen";

function Router() {
  const nav = useModel(navigationViewModel);
  const screen = useUnit(nav.$screen);

  switch (screen) {
    case "restaurants":
      return <RestaurantsScreen />;
    case "menu":
      return <MenuScreen />;
    case "dish":
      return <DishScreen />;
    case "order":
      return <OrderScreen />;
  }
}

function WithNav() {
  const nav = useModel(navigationViewModel);
  const [restaurantName, dishId, onSubmitted] = useUnit([
    nav.$restaurantName,
    nav.$dishId,
    nav.backToRestaurants,
  ]);

  return (
    <View model={dishComposeViewModel} props={{ restaurantName, dishId }}>
      <View model={cartOrderViewModel} props={{ restaurantName, onSubmitted }}>
        <Router />
      </View>
    </View>
  );
}

export function FoodOrderPage() {
  return (
    <View model={navigationViewModel}>
      <WithNav />
    </View>
  );
}
