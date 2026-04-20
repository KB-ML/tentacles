import { afterEach, describe, expect, it } from "vitest";
import { createContract, createModel } from "@kbml-tentacles/core";
import { useUnit } from "effector-react";
import { render, cleanup, act } from "@testing-library/react";
import { memo, useRef } from "react";
import { useModel } from "../index";

afterEach(cleanup);

// Regression: before the $idSet-subscription fix, every row re-rendered on
// any field change in any row (because $idSet = $ids.map(ids => new Set(ids))
// emits a fresh Set reference on every upstream $ids re-emission, and
// effector's default equality doesn't suppress fresh references).
//
// After the fix, <EachItem> no longer subscribes to $idSet; the parent
// <EachSource> already guarantees membership at row-render time.
describe("render isolation", () => {
  function makeModel() {
    const contract = createContract()
      .store("id", (s) => s<string>())
      .store("title", (s) => s<string>())
      .pk("id");
    return createModel({
      contract,
      fn: ({ $id, $title }) => ({ $id, $title }),
    });
  }

  it("useModel(model, id) row does not re-render on unrelated instance changes", () => {
    const model = makeModel();
    for (let i = 0; i < 10; i++) {
      model.create({ id: String(i), title: `t${i}` });
    }

    const renderCounts: Record<string, number> = {};

    // Row component accesses the instance via `useModel(model, id)` — the
    // hook that previously subscribed to `$idSet` (a Set store that emits
    // a new reference on every $ids re-emission, unsuppressed by default
    // effector equality). After the fix, the hook subscribes to the scalar
    // `has(id)` store instead, which only flips on actual membership change.
    const Row = memo(function Row({ id }: { id: string }) {
      const inst = useModel(model, id);
      const countRef = useRef(0);
      countRef.current += 1;
      renderCounts[id] = countRef.current;
      return <div data-testid={`row-${id}`}>{inst ? id : "missing"}</div>;
    });

    function App() {
      const ids = useUnit(model.$ids);
      return (
        <>
          {ids.map((id) => (
            <Row key={String(id)} id={String(id)} />
          ))}
        </>
      );
    }

    render(<App />);

    for (let i = 0; i < 10; i++) {
      expect(renderCounts[String(i)]).toBe(1);
    }

    // Add a new instance — fires registry.add → $ids emits → $idSet emits
    // a fresh Set. Before the fix, every `useModel(model, id)` consumer
    // would re-render; after, only the new row (and the App wrapper) do.
    act(() => {
      model.create({ id: "10", title: "t10" });
    });

    // Existing rows must NOT re-render from the add.
    for (let i = 0; i < 10; i++) {
      expect(renderCounts[String(i)]).toBe(1);
    }
    expect(renderCounts["10"]).toBe(1);

    model.clear();
  });
});
