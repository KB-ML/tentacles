import { NextResponse } from "next/server";

const categories = [
  { id: 1, title: "Work" },
  { id: 2, title: "Personal" },
  { id: 3, title: "School" },
  { id: 4, title: "Health" },
  { id: 5, title: "Finance" },
  { id: 6, title: "Shopping" },
  { id: 7, title: "Home" },
];

const todos = [
  // Work
  {
    id: 1,
    priority: "high",
    createdAt: "2026-03-25T09:00:00Z",
    title: "Prepare quarterly report",
    categoryId: 1,
  },
  {
    id: 2,
    priority: "medium",
    createdAt: "2026-03-26T10:30:00Z",
    title: "Review pull requests",
    categoryId: 1,
  },
  {
    id: 3,
    priority: "low",
    createdAt: "2026-03-27T14:00:00Z",
    title: "Update team wiki",
    categoryId: 1,
  },
  {
    id: 4,
    priority: "high",
    createdAt: "2026-03-28T08:15:00Z",
    title: "Fix production bug in auth flow",
    categoryId: 1,
  },
  {
    id: 5,
    priority: "medium",
    createdAt: "2026-03-29T11:00:00Z",
    title: "Write migration script for v2 schema",
    categoryId: 1,
  },
  {
    id: 6,
    priority: "low",
    createdAt: "2026-03-30T16:45:00Z",
    title: "Organize shared drive folders",
    categoryId: 1,
  },

  // Personal
  {
    id: 7,
    priority: "medium",
    createdAt: "2026-03-25T07:00:00Z",
    title: "Call dentist for appointment",
    categoryId: 2,
  },
  {
    id: 8,
    priority: "low",
    createdAt: "2026-03-26T19:00:00Z",
    title: "Finish reading Dune",
    categoryId: 2,
  },
  {
    id: 9,
    priority: "high",
    createdAt: "2026-03-27T08:00:00Z",
    title: "Renew passport",
    categoryId: 2,
  },
  {
    id: 10,
    priority: "medium",
    createdAt: "2026-03-28T20:30:00Z",
    title: "Plan birthday surprise for Alex",
    categoryId: 2,
  },
  {
    id: 11,
    priority: "low",
    createdAt: "2026-03-30T12:00:00Z",
    title: "Sort through old photos",
    categoryId: 2,
  },

  // School
  {
    id: 12,
    priority: "high",
    createdAt: "2026-03-25T08:00:00Z",
    title: "Finish homework on linear algebra",
    categoryId: 3,
  },
  {
    id: 13,
    priority: "high",
    createdAt: "2026-03-26T09:30:00Z",
    title: "Submit research paper draft",
    categoryId: 3,
  },
  {
    id: 14,
    priority: "medium",
    createdAt: "2026-03-27T13:00:00Z",
    title: "Study for chemistry midterm",
    categoryId: 3,
  },
  {
    id: 15,
    priority: "low",
    createdAt: "2026-03-28T15:00:00Z",
    title: "Return library books",
    categoryId: 3,
  },
  {
    id: 16,
    priority: "medium",
    createdAt: "2026-03-29T10:00:00Z",
    title: "Meet study group for history project",
    categoryId: 3,
  },

  // Health
  {
    id: 17,
    priority: "high",
    createdAt: "2026-03-25T06:00:00Z",
    title: "Schedule annual check-up",
    categoryId: 4,
  },
  {
    id: 18,
    priority: "medium",
    createdAt: "2026-03-26T06:30:00Z",
    title: "Go for a 5k run",
    categoryId: 4,
  },
  {
    id: 19,
    priority: "low",
    createdAt: "2026-03-27T07:00:00Z",
    title: "Try new yoga class",
    categoryId: 4,
  },
  {
    id: 20,
    priority: "high",
    createdAt: "2026-03-28T18:00:00Z",
    title: "Pick up prescription from pharmacy",
    categoryId: 4,
  },
  {
    id: 21,
    priority: "medium",
    createdAt: "2026-03-30T07:00:00Z",
    title: "Meal prep for the week",
    categoryId: 4,
  },

  // Finance
  { id: 22, priority: "high", createdAt: "2026-03-25T10:00:00Z", title: "Pay rent", categoryId: 5 },
  {
    id: 23,
    priority: "medium",
    createdAt: "2026-03-26T11:00:00Z",
    title: "Review monthly subscriptions",
    categoryId: 5,
  },
  {
    id: 24,
    priority: "high",
    createdAt: "2026-03-27T09:00:00Z",
    title: "File tax return",
    categoryId: 5,
  },
  {
    id: 25,
    priority: "low",
    createdAt: "2026-03-29T14:00:00Z",
    title: "Research new savings accounts",
    categoryId: 5,
  },
  {
    id: 26,
    priority: "medium",
    createdAt: "2026-03-30T10:00:00Z",
    title: "Set up automatic bill payments",
    categoryId: 5,
  },

  // Shopping
  {
    id: 27,
    priority: "medium",
    createdAt: "2026-03-25T12:00:00Z",
    title: "Buy groceries for the week",
    categoryId: 6,
  },
  {
    id: 28,
    priority: "low",
    createdAt: "2026-03-26T13:00:00Z",
    title: "Order new running shoes",
    categoryId: 6,
  },
  {
    id: 29,
    priority: "high",
    createdAt: "2026-03-27T17:00:00Z",
    title: "Get birthday gift for mom",
    categoryId: 6,
  },
  {
    id: 30,
    priority: "low",
    createdAt: "2026-03-28T11:00:00Z",
    title: "Look for a new desk lamp",
    categoryId: 6,
  },
  {
    id: 31,
    priority: "medium",
    createdAt: "2026-03-30T09:00:00Z",
    title: "Restock cleaning supplies",
    categoryId: 6,
  },

  // Home
  {
    id: 32,
    priority: "high",
    createdAt: "2026-03-25T15:00:00Z",
    title: "Fix leaking kitchen faucet",
    categoryId: 7,
  },
  {
    id: 33,
    priority: "medium",
    createdAt: "2026-03-26T16:00:00Z",
    title: "Mow the lawn",
    categoryId: 7,
  },
  {
    id: 34,
    priority: "low",
    createdAt: "2026-03-27T18:00:00Z",
    title: "Reorganize garage shelves",
    categoryId: 7,
  },
  {
    id: 35,
    priority: "high",
    createdAt: "2026-03-28T14:00:00Z",
    title: "Replace smoke detector batteries",
    categoryId: 7,
  },
  {
    id: 36,
    priority: "medium",
    createdAt: "2026-03-29T09:00:00Z",
    title: "Deep clean the bathroom",
    categoryId: 7,
  },
  {
    id: 37,
    priority: "low",
    createdAt: "2026-03-30T11:00:00Z",
    title: "Hang new shelves in the office",
    categoryId: 7,
  },
];

export function GET() {
  return NextResponse.json({ todos, categories });
}
