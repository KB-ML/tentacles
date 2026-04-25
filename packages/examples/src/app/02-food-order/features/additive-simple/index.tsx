"use client";

import { useModel } from "@kbml-tentacles/react";
import { MinusIcon, PlusIcon } from "@radix-ui/react-icons";
import { Checkbox, Flex, IconButton, Text } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { dishComposeViewModel } from "../../view-models/dish-compose-view-model";

export function AdditiveSimple({
  additiveName,
  choice,
  price,
  amountPerItem,
}: {
  additiveName: string;
  choice: string;
  price: number;
  amountPerItem: "single" | "many";
}) {
  const dishVm = useModel(dishComposeViewModel);
  const [selections, chooseAdditive, removeAdditive] = useUnit([
    dishVm.$selections,
    dishVm.chooseAdditive,
    dishVm.removeAdditive,
  ]);

  const selection = selections.find((s) => s.additiveName === additiveName);
  const amount = selection && selection.choice === choice ? selection.amount : 0;
  const selected = amount > 0;

  return (
    <Flex justify="between" align="center" py="1">
      <Flex align="center" gap="2">
        <Text size="2">{choice}</Text>
        <Text size="2" style={{ color: "var(--accent-a11)" }}>
          +{price}₸
        </Text>
      </Flex>
      {amountPerItem === "single" ? (
        <Checkbox
          checked={selected}
          onCheckedChange={(value) =>
            value ? chooseAdditive({ additiveName, choice }) : removeAdditive(additiveName)
          }
        />
      ) : amount === 0 ? (
        <IconButton
          size="1"
          variant="ghost"
          onClick={() => chooseAdditive({ additiveName, choice })}
          aria-label="Add"
        >
          <PlusIcon />
        </IconButton>
      ) : (
        <Flex align="center" gap="2">
          <IconButton size="1" onClick={() => removeAdditive(additiveName)} aria-label="Remove">
            <MinusIcon />
          </IconButton>
          <Text size="2">{amount}</Text>
          <IconButton
            size="1"
            onClick={() => chooseAdditive({ additiveName, choice })}
            aria-label="Add"
          >
            <PlusIcon />
          </IconButton>
        </Flex>
      )}
    </Flex>
  );
}
