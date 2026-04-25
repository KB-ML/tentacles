import { NextResponse } from "next/server";

const todos = [
  { id: 1, title: "🖱 Double-click to edit" },
  { id: 2, title: "Effector models" },
  { id: 3, title: "Example task" },
  { id: 4, title: "subtask #1", parentId: 3 },
  { id: 5, title: "Foo", parentId: 4 },
  { id: 6, title: "Bar", parentId: 4 },
  { id: 7, title: "subtask #2", parentId: 3 },
];

export function GET() {
  return NextResponse.json({ todos });
}
