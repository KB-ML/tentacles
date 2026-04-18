export type TodoPriority = "low" | "medium" | "high";
export const ALL_PRIORITIES: TodoPriority[] = ["low", "medium", "high"];
export type TodoSortingDirection = "asc" | "desc";
export type TodoSortingField = "createdAt" | "priorityNumber";
export type TodoPerPage = 5 | 10 | 20;
