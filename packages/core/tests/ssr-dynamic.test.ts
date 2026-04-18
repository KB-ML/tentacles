import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { allSettled, fork, serialize } from "effector";

// ─────────────────────────────────────────────────────────────────────────────
// SSR with in-request dynamic model creation
//
// Simulates the "useModel" pattern: models are created when a component
// mounts and destroyed when it unmounts. On the server, this means models
// are created mid-request inside an existing fork scope.
//
// Without scope support in create(), dynamically created stores are invisible
// to the scope — serialize() misses them and hydration breaks.
// ─────────────────────────────────────────────────────────────────────────────

// ── Contracts ────────────────────────────────────────────────────────────────

const userCardContract = createContract()
  .store("id", (s) => s<string>())
  .store("name", (s) => s<string>())
  .store("bio", (s) => s<string>())
  .event("rename", (e) => e<string>())
  .pk("id");

const userCardModel = createModel({
  contract: userCardContract,
  name: "userCard",
  fn: ({ $name, $bio, rename }) => {
    $name.on(rename, (_, next) => next);
    return { $name, $bio, rename };
  },
});

const todoListContract = createContract()
  .store("id", (s) => s<string>())
  .store("items", (s) => s<string[]>())
  .event("add", (e) => e<string>())
  .event("remove", (e) => e<number>())
  .pk("id");

const todoListModel = createModel({
  contract: todoListContract,
  name: "todoList",
  fn: ({ $items, add, remove }) => {
    $items
      .on(add, (list, item) => [...list, item])
      .on(remove, (list, idx) => list.filter((_, i) => i !== idx));
    return { $items, add, remove };
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Simulates what a `useModel` hook does on the server:
 * creates a model instance scoped to the current SSR request.
 */
async function serverRenderPage(requestData: {
  userId: string;
  userName: string;
  userBio: string;
  todos: string[];
}) {
  const scope = fork();

  // Models are created dynamically during render, just like useModel would do.
  // The scope option registers their stores in this request's scope.
  const userCard = await userCardModel.create(
    { id: `user-card-${requestData.userId}`, name: requestData.userName, bio: requestData.userBio },
    { scope },
  );

  const todoList = await todoListModel.create(
    { id: `todos-${requestData.userId}`, items: requestData.todos },
    { scope },
  );

  // Server-side logic: could be triggered by data loaders, effects, etc.
  await allSettled(userCard.rename, { scope, params: `${requestData.userName} (verified)` });
  await allSettled(todoList.add, { scope, params: "Added by server" });

  const values = serialize(scope);
  return { values, userCard, todoList };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SSR: in-request dynamic model creation", () => {
  it("creates models inside request scope and serializes their state", async () => {
    const { values, userCard, todoList } = await serverRenderPage({
      userId: "alice",
      userName: "Alice",
      userBio: "Loves effector",
      todos: ["Buy milk"],
    });

    // Client hydrates from serialized server state
    const clientScope = fork({ values });

    expect(clientScope.getState(userCard.$name)).toBe("Alice (verified)");
    expect(clientScope.getState(userCard.$bio)).toBe("Loves effector");
    expect(clientScope.getState(todoList.$items)).toEqual(["Buy milk", "Added by server"]);
  });

  it("concurrent requests with different users stay isolated", async () => {
    const [alice, bob] = await Promise.all([
      serverRenderPage({
        userId: "alice",
        userName: "Alice",
        userBio: "Engineer",
        todos: ["Deploy v2"],
      }),
      serverRenderPage({
        userId: "bob",
        userName: "Bob",
        userBio: "Designer",
        todos: ["Update figma", "Review PR"],
      }),
    ]);

    const aliceClient = fork({ values: alice.values });
    const bobClient = fork({ values: bob.values });

    // Alice's state
    expect(aliceClient.getState(alice.userCard.$name)).toBe("Alice (verified)");
    expect(aliceClient.getState(alice.todoList.$items)).toEqual(["Deploy v2", "Added by server"]);

    // Bob's state — completely independent
    expect(bobClient.getState(bob.userCard.$name)).toBe("Bob (verified)");
    expect(bobClient.getState(bob.todoList.$items)).toEqual([
      "Update figma",
      "Review PR",
      "Added by server",
    ]);
  });

  it("client can continue mutating state after hydration", async () => {
    const { values, userCard, todoList } = await serverRenderPage({
      userId: "carol",
      userName: "Carol",
      userBio: "PM",
      todos: [],
    });

    const clientScope = fork({ values });

    // Simulate client-side interactions (what would happen after useModel hydrates)
    await allSettled(todoList.add, { scope: clientScope, params: "Client task 1" });
    await allSettled(todoList.add, { scope: clientScope, params: "Client task 2" });
    await allSettled(todoList.remove, { scope: clientScope, params: 0 });
    await allSettled(userCard.rename, { scope: clientScope, params: "Carol M." });

    expect(clientScope.getState(userCard.$name)).toBe("Carol M.");
    // "Added by server" was at index 0, removed; two client tasks remain
    expect(clientScope.getState(todoList.$items)).toEqual(["Client task 1", "Client task 2"]);
  });

  it("client re-creates model and hydrates after server cleanup", async () => {
    const { values } = await serverRenderPage({
      userId: "dave",
      userName: "Dave",
      userBio: "SRE",
      todos: ["Fix alerts"],
    });

    // Server cleans up the model after response is sent (like useModel unmount)
    userCardModel.delete("user-card-dave");
    todoListModel.delete("todos-dave");

    // Client creates its own instances (same IDs = same SIDs)
    const clientUserCard = userCardModel.create({
      id: "user-card-dave",
      name: "",
      bio: "",
    });
    const clientTodoList = todoListModel.create({
      id: "todos-dave",
      items: [],
    });

    // Hydrate from server-serialized values — SIDs match, state is restored
    const clientScope = fork({ values });

    expect(clientScope.getState(clientUserCard.$name)).toBe("Dave (verified)");
    expect(clientScope.getState(clientUserCard.$bio)).toBe("SRE");
    expect(clientScope.getState(clientTodoList.$items)).toEqual([
      "Fix alerts",
      "Added by server",
    ]);

    // Client continues from hydrated state
    await allSettled(clientUserCard.rename, { scope: clientScope, params: "Dave (edited)" });
    expect(clientScope.getState(clientUserCard.$name)).toBe("Dave (edited)");
  });
});
