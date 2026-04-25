import type { AdditiveOption, AdditiveSelection } from "../entities/additive";

export type AdditiveRecord = {
  name: string;
  price: number;
  amountPerItem: "single" | "many";
  options: AdditiveOption[];
};

export type DishRecord = {
  id: number;
  price: number;
};

export type CartItemRecord = {
  dishId: number;
  selections: AdditiveSelection[];
};

export type SelectionRow = {
  choice: string;
  amount: number;
  total: number;
  showAmount: boolean;
};

export function priceForSelection(
  additive: AdditiveRecord | undefined,
  choice: string,
  amount: number,
): number {
  if (!additive) return 0;
  if (additive.options.length === 0) return additive.price * amount;
  const option = additive.options.find((o) => o.name === choice);
  return option ? option.price * amount : 0;
}

export function itemTotal(
  dishPrice: number,
  selections: AdditiveSelection[],
  additives: AdditiveRecord[],
): number {
  let total = dishPrice;
  for (const sel of selections) {
    const additive = additives.find((a) => a.name === sel.additiveName);
    total += priceForSelection(additive, sel.choice, sel.amount);
  }
  return total;
}

export function cartTotal(
  cartItems: CartItemRecord[],
  dishes: DishRecord[],
  additives: AdditiveRecord[],
): number {
  let total = 0;
  for (const item of cartItems) {
    const dish = dishes.find((d) => d.id === item.dishId);
    if (!dish) continue;
    total += itemTotal(dish.price, item.selections, additives);
  }
  return total;
}

export function selectionRows(
  selections: AdditiveSelection[],
  additives: AdditiveRecord[],
): SelectionRow[] {
  return selections.map((sel) => {
    const additive = additives.find((a) => a.name === sel.additiveName);
    if (!additive) return { choice: sel.choice, amount: sel.amount, total: 0, showAmount: false };
    if (additive.options.length === 0) {
      return {
        choice: sel.choice,
        amount: sel.amount,
        total: additive.price * sel.amount,
        showAmount: additive.amountPerItem === "many",
      };
    }
    const option = additive.options.find((o) => o.name === sel.choice);
    return {
      choice: sel.choice,
      amount: sel.amount,
      total: (option?.price ?? 0) * sel.amount,
      showAmount: option?.amountPerItem === "many",
    };
  });
}
