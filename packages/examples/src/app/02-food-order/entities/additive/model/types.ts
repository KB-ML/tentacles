export type AdditiveKind = "simple" | "select";

export type AdditiveOption = {
  name: string;
  price: number;
  amountPerItem: "single" | "many";
};

export type AdditiveSelection = {
  additiveName: string;
  choice: string;
  amount: number;
};
