"use client";

import { useModel } from "@kbml-tentacles/react";
import { Select } from "@radix-ui/themes";
import { useUnit } from "effector-react";
import { categoryModel } from "../model";

export function CategoryOption() {
  const cat = useModel(categoryModel);
  const id = useUnit(cat.$id);
  const title = useUnit(cat.$title);
  return <Select.Item value={String(id)}>{title}</Select.Item>;
}
