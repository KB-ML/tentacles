import { afterEach, describe, expect, it } from "vitest";
import { createContract, createModel } from "@kbml-tentacles/core";
import { allSettled, fork, serialize } from "effector";
import { useUnit } from "effector-react";
import { Provider } from "effector-react";
import { cleanup, render, screen } from "@testing-library/react";
import { Each, useModel } from "../index";

afterEach(cleanup);

// Regression: under SSR with `fork({ values })`, <Each> and useModel(model, id)
// must read instance data from the provided scope's $dataMap, not from the
// global one (which is empty on the client after hydration). Before the fix,
// `model.get(id)` was called unconditionally, producing null — rows rendered
// empty even though `$idSet` reported the id as present on the scope.

function makeTodoModel() {
  const contract = createContract()
    .store("id", (s) => s<string>())
    .store("title", (s) => s<string>())
    .store("done", (s) => s<boolean>().default(false))
    .pk("id");

  return createModel({
    contract,
    fn: ({ $id, $title, $done }) => ({ $id, $title, $done }),
  });
}

describe("SSR scope awareness", () => {
  it("<Each source> renders rows from a forked scope with empty global cache", async () => {
    // Simulate server: populate data in a scope only (no global .create calls).
    const model = makeTodoModel();

    const serverScope = fork();
    await allSettled(model.createFx, {
      scope: serverScope,
      params: { id: "t1", title: "first" },
    });
    await allSettled(model.createFx, {
      scope: serverScope,
      params: { id: "t2", title: "second" },
    });

    // Serialize the scope as SSR would ship to the client.
    const serialized = serialize(serverScope);

    // Client-side: fresh scope from serialized values. The global $dataMap
    // remains empty — only the scope knows about these instances.
    const clientScope = fork({ values: serialized });

    function Row() {
      const { $title } = useModel(model);
      const title = useUnit($title);
      return <div data-testid="title">{title}</div>;
    }

    render(
      <Provider value={clientScope}>
        <Each model={model} source={model.$ids}>
          <Row />
        </Each>
      </Provider>,
    );

    const titles = screen.getAllByTestId("title").map((n) => n.textContent);
    expect(titles).toEqual(["first", "second"]);
  });

  it("<Each id> and useModel(model, id) resolve through scope", async () => {
    const model = makeTodoModel();
    const serverScope = fork();
    await allSettled(model.createFx, {
      scope: serverScope,
      params: { id: "only", title: "hello" },
    });
    const clientScope = fork({ values: serialize(serverScope) });

    function Row() {
      const { $title } = useModel(model);
      const title = useUnit($title);
      return <div data-testid="via-each">{title}</div>;
    }

    function DirectTitle({ inst }: { inst: NonNullable<ReturnType<typeof model.get>> }) {
      const title = useUnit(inst.$title);
      return <>{title}</>;
    }

    function Direct() {
      const inst = useModel(model, "only");
      return (
        <div data-testid="via-use-model">{inst ? <DirectTitle inst={inst} /> : ""}</div>
      );
    }

    render(
      <Provider value={clientScope}>
        <Each model={model} id="only">
          <Row />
        </Each>
        <Direct />
      </Provider>,
    );

    expect(screen.getByTestId("via-each").textContent).toBe("hello");
    expect(screen.getByTestId("via-use-model").textContent).toBe("hello");
  });
});
