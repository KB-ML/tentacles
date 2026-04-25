"use client";

import { Each, useModel } from "@kbml-tentacles/react";
import { Box, Heading, Text } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { additiveModel } from "../../entities/additive";
import { dishModel } from "../../entities/dish";
import { AdditiveSelect } from "../../features/additive-select";
import { AdditiveSimple } from "../../features/additive-simple";
import { BottomAction, Title } from "../../shared/ui";
import { dishComposeViewModel } from "../../view-models/dish-compose-view-model";
import { navigationViewModel } from "../../view-models/navigation-view-model";

function DishHead() {
  const dish = useModel(dishModel);
  const nav = useModel(navigationViewModel);

  const [name, price, description, backToMenu] = useUnit([
    dish.$name,
    dish.$price,
    dish.$description,
    nav.backToMenu,
  ]);

  return (
    <>
      <Title text={name} goBack={backToMenu} />
      <Box px="4">
        <Text size="3" color="gray">
          {price}₸
        </Text>
        <Text as="p" size="2" color="gray" mt="2">
          {description}
        </Text>
      </Box>
    </>
  );
}

function AdditiveItem() {
  const additive = useModel(additiveModel);
  const [name, kind, price, amountPerItem, options] = useUnit([
    additive.$name,
    additive.$kind,
    additive.$price,
    additive.$amountPerItem,
    additive.$options,
  ]);

  if (kind === "select") {
    return <AdditiveSelect name={name} options={options} />;
  }
  return (
    <AdditiveSimple additiveName={name} choice={name} price={price} amountPerItem={amountPerItem} />
  );
}

export function DishScreen() {
  const nav = useModel(navigationViewModel);
  const dishVm = useModel(dishComposeViewModel);
  const [dishId, currentPrice, isInCart, addToCart, backToMenu] = useUnit([
    nav.$dishId,
    dishVm.$currentDishTotalPrice,
    dishVm.$isInCart,
    dishVm.addToCart,
    nav.backToMenu,
  ]);

  if (dishId === null) return null;

  const handleAddToCart = () => {
    addToCart();
    backToMenu();
  };

  return (
    <>
      <Box maxWidth="480px" mx="auto" pb="9">
        <Each model={dishModel} id={dishId}>
          <DishHead />
          <Box px="4" mt="4">
            <Heading size="4" mb="2">
              Add-ons:
            </Heading>
            <Each model={additiveModel} from="additives">
              <AdditiveItem />
            </Each>
          </Box>
        </Each>
      </Box>
      <BottomAction onClick={handleAddToCart}>
        {isInCart ? `Update order (${currentPrice}₸)` : `Add to order for ${currentPrice}₸`}
      </BottomAction>
    </>
  );
}
