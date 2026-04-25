import { NextResponse } from "next/server";

export const restaurants = [
  {
    name: "Corner Cafe",
    description: "Cozy cafe with European cuisine",
    category: ["european"],
    dishes: [
      {
        name: "Latte",
        price: 900,
        description: "Espresso coffee with steamed milk and a thick milk foam",
        additives: [
          {
            name: "Sugar",
            price: 50,
            amountPerItem: "many",
          },
          {
            name: "Beans",
            required: true,
            options: [
              {
                name: "Brazilian coffee",
                price: 0,
                amountPerItem: "single",
              },
              {
                name: "Kenyan coffee",
                price: 0,
                amountPerItem: "single",
              },
              {
                name: "Indonesian coffee",
                price: 150,
                amountPerItem: "single",
              },
            ],
          },
          {
            name: "Syrup",
            required: false,
            options: [
              {
                name: "Vanilla syrup",
                price: 150,
                amountPerItem: "single",
              },
              {
                name: "Caramel syrup",
                price: 150,
                amountPerItem: "single",
              },
              {
                name: "Hazelnut syrup",
                price: 150,
                amountPerItem: "single",
              },
            ],
          },
        ],
      },
      {
        name: "Avocado toast with poached egg",
        price: 2500,
        description: "Whole grain bread with avocado, poached egg, and herbs",
        additives: [
          {
            name: "Salmon",
            price: 300,
            amountPerItem: "single",
          },
          {
            name: "Feta cheese",
            price: 200,
            amountPerItem: "single",
          },
        ],
      },
      {
        name: "Lemon sorbet",
        price: 1800,
        description: "Refreshing dessert made from lemon juice and sugar",
        additives: [],
      },
      {
        name: "Duck breast",
        price: 4500,
        description: "Duck breast with red wine and berry sauce",
        additives: [
          {
            name: "Choice",
            required: false,
            options: [
              {
                name: "Red wine",
                price: 300,
                amountPerItem: "single",
              },
              {
                name: "Black currant",
                price: 200,
                amountPerItem: "many",
              },
              {
                name: "Blueberry",
                price: 200,
                amountPerItem: "many",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    name: "La Bella Vita",
    description: "Authentic Italian restaurant",
    category: ["italian"],
    dishes: [
      {
        name: "Pepperoni Pizza",
        price: 3500,
        description: "Pizza with tomato sauce, mozzarella, and pepperoni",
        additives: [
          {
            name: "Olives",
            price: 200,
            amountPerItem: "many",
          },
          {
            name: "Mushrooms",
            price: 200,
            amountPerItem: "many",
          },
          {
            name: "Chili pepper",
            price: 150,
            amountPerItem: "many",
          },
        ],
      },
      {
        name: "Carbonara Pasta",
        price: 3200,
        description: "Spaghetti with bacon, cream, and parmesan",
        additives: [
          {
            name: "Egg",
            price: 100,
            amountPerItem: "single",
          },
          {
            name: "Mushrooms",
            price: 150,
            amountPerItem: "single",
          },
        ],
      },
      {
        name: "Caesar Salad",
        price: 2800,
        description: "Salad with chicken, parmesan, croutons, and Caesar dressing",
        additives: [
          {
            name: "Anchovies",
            price: 150,
            amountPerItem: "single",
          },
        ],
      },
      {
        name: "Panna Cotta",
        price: 2100,
        description: "Italian cream dessert with berry sauce",
        additives: [],
      },
      {
        name: "Tomato Bruschetta",
        price: 2300,
        description: "Toasted bread with tomatoes, basil, and olive oil",
        additives: [],
      },
    ],
  },
  {
    name: "Green & Fit",
    description: "Healthy restaurant with vegetarian dishes",
    category: ["healthy", "vegetarian"],
    dishes: [
      {
        name: "Mango smoothie bowl",
        price: 2400,
        description: "Smoothie bowl with mango, granola, and chia seeds",
        additives: [
          {
            name: "Almonds",
            price: 100,
            amountPerItem: "single",
          },
          {
            name: "Coconut flakes",
            price: 150,
            amountPerItem: "single",
          },
        ],
      },
      {
        name: "Quinoa and avocado salad",
        price: 2700,
        description: "Salad with quinoa, avocado, tomatoes, and lemon dressing",
        additives: [],
      },
      {
        name: "Green detox juice",
        price: 1800,
        description: "Juice from apple, spinach, cucumber, and celery",
        additives: [],
      },
      {
        name: "Oatmeal with banana",
        price: 2100,
        description: "Oatmeal with banana, berries, and honey",
        additives: [
          {
            name: "Nuts",
            price: 150,
            amountPerItem: "many",
          },
          {
            name: "Cinnamon",
            price: 50,
            amountPerItem: "single",
          },
        ],
      },
      {
        name: "Avocado and tomato toast",
        price: 2500,
        description: "Whole grain bread with avocado, tomatoes, and herbs",
        additives: [
          {
            name: "Salmon",
            price: 300,
            amountPerItem: "single",
          },
          {
            name: "Feta cheese",
            price: 200,
            amountPerItem: "single",
          },
        ],
      },
    ],
  },
];

export function GET() {
  return NextResponse.json({ restaurants });
}
