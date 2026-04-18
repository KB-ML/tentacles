import { describe, expect, it } from "vitest";
import { createContract, createModel } from "../index";
import { allSettled, createEvent, fork, sample } from "effector";

function createTodoModel(name?: string) {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .store("done", (s) => s<boolean>())
    .pk("id");

  return createModel({
    contract,
    name,
    fn: ({ $title, $done }) => ({ $title, $done }),
  });
}

describe("Reactive Effects API", () => {
  describe("createFx", () => {
    it("can be used as sample target", () => {
      const model = createTodoModel();
      const trigger = createEvent<{ id: string; title: string; done: boolean }>();

      sample({
        clock: trigger,
        target: model.createFx,
      });

      trigger({ id: "t1", title: "Test", done: false });
      expect(model.instance("t1").getState()).not.toBeNull();
      expect(model.instance("t1").getState()!.$title.getState()).toBe("Test");

      model.clear();
    });

    it("doneData fires with created instance", () => {
      const model = createTodoModel();
      const results: unknown[] = [];

      model.createFx.doneData.watch((instance) => {
        results.push(instance.__id);
      });

      model.createFx({ id: "t1", title: "Hello", done: false });
      expect(results).toEqual(["t1"]);

      model.clear();
    });

    it("fires model.created event", () => {
      const model = createTodoModel();
      const created: string[] = [];

      model.created.watch((instance) => {
        created.push(instance.__id as string);
      });

      model.createFx({ id: "t1", title: "Hello", done: false });
      expect(created).toEqual(["t1"]);

      model.clear();
    });
  });

  describe("createManyFx", () => {
    it("creates multiple instances", () => {
      const model = createTodoModel();

      model.createManyFx([
        { id: "t1", title: "First", done: false },
        { id: "t2", title: "Second", done: true },
      ]);

      expect(model.instance("t1").getState()!.$title.getState()).toBe("First");
      expect(model.instance("t2").getState()!.$done.getState()).toBe(true);

      model.clear();
    });
  });

  describe("deleteFx", () => {
    it("can be used as sample target", () => {
      const model = createTodoModel();
      const trigger = createEvent<string>();

      sample({
        clock: trigger,
        target: model.deleteFx,
      });

      model.create({ id: "t1", title: "Test", done: false });
      expect(model.instance("t1").getState()).not.toBeNull();

      trigger("t1");
      expect(model.instance("t1").getState()).toBeNull();

      model.clear();
    });

    it("fires model.deleted event", () => {
      const model = createTodoModel();
      const deleted: unknown[] = [];

      model.deleted.watch((id) => {
        deleted.push(id);
      });

      model.create({ id: "t1", title: "Hello", done: false });
      model.deleteFx("t1");

      expect(deleted).toEqual(["t1"]);

      model.clear();
    });
  });

  describe("clearFx", () => {
    it("clears all instances", () => {
      const model = createTodoModel();

      model.create({ id: "t1", title: "First", done: false });
      model.create({ id: "t2", title: "Second", done: true });
      expect(model.$ids.getState()).toHaveLength(2);

      model.clearFx();
      expect(model.$ids.getState()).toHaveLength(0);
    });

    it("fires model.cleared event", () => {
      const model = createTodoModel();
      let clearedFired = false;

      model.cleared.watch(() => {
        clearedFired = true;
      });

      model.create({ id: "t1", title: "Test", done: false });
      model.clearFx();

      expect(clearedFired).toBe(true);
    });
  });

  describe("updateFx", () => {
    it("updates store values on existing instance", () => {
      const model = createTodoModel();

      model.create({ id: "t1", title: "Original", done: false });

      model.updateFx({ id: "t1", data: { title: "Updated", done: true } });

      expect(model.instance("t1").getState()!.$title.getState()).toBe("Updated");
      expect(model.instance("t1").getState()!.$done.getState()).toBe(true);

      model.clear();
    });

    it("supports partial updates", () => {
      const model = createTodoModel();

      model.create({ id: "t1", title: "Original", done: false });

      model.updateFx({ id: "t1", data: { title: "Updated" } });

      expect(model.instance("t1").getState()!.$title.getState()).toBe("Updated");
      expect(model.instance("t1").getState()!.$done.getState()).toBe(false);

      model.clear();
    });

    it("throws for non-existent instance", () => {
      const model = createTodoModel();
      const errors: unknown[] = [];

      model.updateFx.failData.watch((err) => errors.push(err));

      model.updateFx({ id: "nonexistent", data: { title: "X" } });

      expect(errors).toHaveLength(1);
      expect((errors[0] as Error).message).toContain("nonexistent");
    });

    it("returns the updated instance via doneData", () => {
      const model = createTodoModel();
      const results: unknown[] = [];

      model.updateFx.doneData.watch((instance) => {
        results.push(instance.__id);
      });

      model.create({ id: "t1", title: "Original", done: false });
      model.updateFx({ id: "t1", data: { title: "New" } });

      expect(results).toEqual(["t1"]);

      model.clear();
    });
  });

  describe("model.updated event", () => {
    it("fires on store.set", () => {
      const model = createTodoModel();
      const updates: { id: unknown; field: string; value: unknown }[] = [];

      model.updated.watch((u) => updates.push(u));

      const instance = model.create({ id: "t1", title: "Hello", done: false });
      // Clear initial creation updates
      updates.length = 0;

      instance.$title.set("World");

      expect(updates).toEqual([{ id: "t1", field: "title", value: "World" }]);

      model.clear();
    });

    it("fires for each field in updateFx", () => {
      const model = createTodoModel();
      const updates: { field: string; value: unknown }[] = [];

      model.updated.watch((u) => updates.push({ field: u.field, value: u.value }));

      model.create({ id: "t1", title: "Hello", done: false });
      updates.length = 0;

      model.updateFx({ id: "t1", data: { title: "World", done: true } });

      expect(updates).toContainEqual({ field: "title", value: "World" });
      expect(updates).toContainEqual({ field: "done", value: true });

      model.clear();
    });

    it("fires for different instances", () => {
      const model = createTodoModel();
      const updates: { id: unknown; field: string }[] = [];

      model.updated.watch((u) => updates.push({ id: u.id, field: u.field }));

      model.create({ id: "t1", title: "First", done: false });
      model.create({ id: "t2", title: "Second", done: false });
      updates.length = 0;

      model.instance("t1").getState()!.$title.set("Changed 1");
      model.instance("t2").getState()!.$title.set("Changed 2");

      expect(updates).toEqual([
        { id: "t1", field: "title" },
        { id: "t2", field: "title" },
      ]);

      model.clear();
    });
  });

  describe("derived stores", () => {
    it("$count reflects number of instances", () => {
      const model = createTodoModel();

      expect(model.$count.getState()).toBe(0);

      model.create({ id: "t1", title: "First", done: false });
      expect(model.$count.getState()).toBe(1);

      model.create({ id: "t2", title: "Second", done: false });
      expect(model.$count.getState()).toBe(2);

      model.delete("t1");
      expect(model.$count.getState()).toBe(1);

      model.clear();
      expect(model.$count.getState()).toBe(0);
    });

    it("$instances reflects all current instances", () => {
      const model = createTodoModel();

      expect(model.$instances.getState()).toEqual([]);

      model.create({ id: "t1", title: "First", done: false });
      model.create({ id: "t2", title: "Second", done: true });

      const instances = model.$instances.getState();
      expect(instances).toHaveLength(2);
      expect(instances[0]!.__id).toBe("t1");
      expect(instances[1]!.__id).toBe("t2");

      model.clear();
    });
  });

  describe("backward compatibility", () => {
    it("imperative create() still works", () => {
      const model = createTodoModel();

      const instance = model.create({ id: "t1", title: "Test", done: false });

      expect(instance.__id).toBe("t1");
      expect(instance.$title.getState()).toBe("Test");

      model.clear();
    });

    it("imperative delete() still works", () => {
      const model = createTodoModel();

      model.create({ id: "t1", title: "Test", done: false });
      model.delete("t1");

      expect(model.instance("t1").getState()).toBeNull();
    });

    it("imperative clear() still works", () => {
      const model = createTodoModel();

      model.create({ id: "t1", title: "First", done: false });
      model.create({ id: "t2", title: "Second", done: false });
      model.clear();

      expect(model.$ids.getState()).toHaveLength(0);
    });
  });

  describe("effects have deterministic SIDs", () => {
    it("effects have correct SID format", () => {
      const model = createTodoModel("todo");

      expect(model.createFx.sid).toBe("tentacles:todo:__fx__:create");
      expect(model.createManyFx.sid).toBe("tentacles:todo:__fx__:createMany");
      expect(model.deleteFx.sid).toBe("tentacles:todo:__fx__:delete");
      expect(model.clearFx.sid).toBe("tentacles:todo:__fx__:clear");
      expect(model.updateFx.sid).toBe("tentacles:todo:__fx__:update");
    });
  });

  describe("scoped effects", () => {
    it("createFx works via allSettled with scope", async () => {
      const model = createTodoModel();
      const scope = fork();

      await allSettled(model.createFx, {
        scope,
        params: { id: "t1", title: "Scoped", done: false },
      });

      expect(scope.getState(model.$ids)).toContain("t1");
      expect(scope.getState(model.$count)).toBe(1);

      model.clear();
    });

    it("deleteFx works via allSettled with scope", async () => {
      const model = createTodoModel();
      const scope = fork();

      await allSettled(model.createFx, {
        scope,
        params: { id: "t1", title: "Test", done: false },
      });

      await allSettled(model.deleteFx, { scope, params: "t1" });

      expect(model.instance("t1").getState()).toBeNull();

      model.clear();
    });
  });

  describe("composability with sample/split", () => {
    it("created event can be piped to another effect", () => {
      const model = createTodoModel();
      const log: string[] = [];

      sample({
        clock: model.created,
        fn: (instance) => `Created: ${instance.__id}`,
      }).watch((msg) => log.push(msg));

      model.createFx({ id: "t1", title: "Test", done: false });

      expect(log).toEqual(["Created: t1"]);

      model.clear();
    });

    it("deleted event can trigger cleanup logic", () => {
      const model = createTodoModel();
      const cleanedUp: unknown[] = [];

      model.deleted.watch((id) => cleanedUp.push(id));

      model.create({ id: "t1", title: "Test", done: false });
      model.create({ id: "t2", title: "Test2", done: false });

      model.deleteFx("t1");
      model.deleteFx("t2");

      expect(cleanedUp).toEqual(["t1", "t2"]);
    });

    it("updated event can be used with sample", () => {
      const model = createTodoModel();
      const changes: string[] = [];

      sample({
        clock: model.updated,
        fn: ({ id, field, value }) => `${id}.${field}=${value}`,
      }).watch((msg) => changes.push(msg));

      model.create({ id: "t1", title: "Hello", done: false });
      changes.length = 0;

      model.instance("t1").getState()!.$done.set(true);

      expect(changes).toEqual(["t1.done=true"]);

      model.clear();
    });
  });

  describe("model.updated strict typing", () => {
    it("field is narrowed to store field names", () => {
      const model = createTodoModel();

      model.updated.watch((payload) => {
        // field is "id" | "title" | "done" — not arbitrary string
        if (payload.field === "title") {
          const _v: string = payload.value;
          void _v;
        } else if (payload.field === "done") {
          const _v: boolean = payload.value;
          void _v;
        } else if (payload.field === "id") {
          const _v: string = payload.value;
          void _v;
        }
      });

      const instance = model.create({ id: "t1", title: "Hello", done: false });
      instance.$title.set("World");

      model.clear();
    });
  });
});
