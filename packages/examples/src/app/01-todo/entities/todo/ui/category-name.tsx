"use client";

import { useModel } from "@kbml-tentacles/react";
import { Text } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { categoryModel } from "../model";

export function CategoryName() {
  const category = useModel(categoryModel);
  const title = useUnit(category.$title);
  return <Text size="2">{title}</Text>;
}
