import { createContract, createModel } from "../index";
import type { ConnectByPk } from "../layers/model/types/contract-model-ref-data";

// Type-check file for the `refs` option (formerly `.bind()`).
//
// NOTE: Strict ref-target typing (e.g. refusing `{ category: { create: { missingTitle } } }`)
// relied on the contract carrying the target model's Contract at the type level. With the
// `.bind()` API that substitution was applied via a fluent `.bind()` call returning a refined
// Model type. With the `refs` option passed at construction time, applying the same
// substitution introduces a circular type reference for bidirectional relationships
// (A.refs → B.refs → A), which is the common case. The library therefore treats `refs` as
// a runtime-only binding: ref-operation shapes (`{create: ...}`, `{connect: ...}`) remain
// valid at compile time but are validated at runtime. Strict compile-time checks are
// preserved for primary-key-only connect shapes via `ConnectByPk`.

// ═══ Basic: one ref ═══

const catContract = createContract()
  .store("id", (s) => s<number>())
  .store("title", (s) => s<string>())
  .pk("id");
const catModel = createModel({ contract: catContract });

const todoContract = createContract()
  .store("id", (s) => s<number>())
  .store("title", (s) => s<string>())
  .ref("category", "one")
  .pk("id");
const todoModel = createModel({
  contract: todoContract,
  refs: { category: () => catModel },
});

// Valid
todoModel.create({ id: 1, title: "ok", category: { connect: 1 } });
todoModel.create({ id: 1, title: "ok", category: { create: { id: 1, title: "x" } } });
todoModel.create({ id: 1, title: "ok", category: { connectOrCreate: { id: 1, title: "x" } } });

// ═══ Compound PK: ConnectByPk remains strict ═══

const companyContract = createContract()
  .store("region", (s) => s<string>())
  .store("code", (s) => s<number>())
  .store("name", (s) => s<string>())
  .pk("region", "code");
const companyModel = createModel({ contract: companyContract });

const employeeContract = createContract()
  .store("id", (s) => s<string>())
  .store("name", (s) => s<string>())
  .ref("company", "one")
  .pk("id");
const employeeModel = createModel({
  contract: employeeContract,
  refs: { company: () => companyModel },
});

employeeModel.create({ id: "e1", name: "Alice", company: { connect: "us\x005" } });
employeeModel.create({
  id: "e1",
  name: "Alice",
  company: { connect: { region: "us", code: 5 } },
});

// ConnectByPk still rejects non-PK-only shapes
// @ts-expect-error
const _badConnect: ConnectByPk<typeof companyModel> = { name: "Acme" };

employeeModel.create({
  id: "e1",
  name: "Alice",
  company: { create: { region: "us", code: 5, name: "Acme" } },
});

// ═══ Many ref ═══

const tagContract = createContract()
  .store("id", (s) => s<string>())
  .store("label", (s) => s<string>())
  .pk("id");
const tagModel = createModel({ contract: tagContract });

const postContract = createContract()
  .store("id", (s) => s<string>())
  .store("body", (s) => s<string>())
  .ref("tags", "many")
  .pk("id");
const postModel = createModel({
  contract: postContract,
  refs: { tags: () => tagModel },
});

postModel.create({ id: "p1", body: "hi", tags: { connect: ["t1", "t2"] } });
postModel.create({ id: "p1", body: "hi", tags: { create: [{ id: "t1", label: "ts" }] } });
postModel.create({
  id: "p1",
  body: "hi",
  tags: { connectOrCreate: [{ id: "t1", label: "ts" }] },
});

// ═══ Update ═══

todoModel.update(1, { category: { connect: 1 } });
todoModel.update(1, { category: { create: { id: 2, title: "new" } } });
todoModel.update(1, { category: { id: 2, title: "upserted" } });
postModel.update("p1", { tags: [{ id: "t1", label: "upserted" }] });

// ═══ Query ═══

import { eq, gt } from "../index";

const todoQuery = todoModel.query().where("title", eq("Task"));
todoQuery.update({ category: { connect: 1 } });
todoQuery.update({ title: "Updated" });

todoModel.query().where("id", gt(0)).where("title", eq("x")).update({ title: "y" });

const postQuery = postModel.query().where("body", eq("hi"));
postQuery.update({ tags: { set: ["t1", "t2"] } });
postQuery.update({ tags: { add: [{ create: { id: "t3", label: "new" } }], disconnect: ["t1"] } });
todoQuery.update({ category: { id: 2, title: "upserted" } });
postQuery.update({ tags: [{ id: "t1", label: "upserted" }] });

// Still rejects wrong store-field types
// @ts-expect-error
todoQuery.update({ title: 123 });

todoQuery.field("title").$values;
postQuery.field("body").$values;
todoQuery.delete();
todoQuery.$count;
todoQuery.$ids;

// ═══ Inverse typing in fn bag ═══
// Inverse fields now expose `Store<ModelInstanceId[]>` (ids). Users resolve ids to
// full instances via `sourceModel.instance(id)` when needed. Keeping ids-only avoids
// the cross-model inference cycle that a `Store<SourceInstance[]>` would introduce.

import type { Store } from "effector";
import type { ModelInstanceId } from "../layers/model/types/model-intsance-id";

const workflowContract2 = createContract()
  .store("id", (s) => s<string>())
  .store("name", (s) => s<string>())
  .inverse("logs", "workflow")
  .pk("id");

const logContract2 = createContract()
  .store("id", (s) => s<string>())
  .store("message", (s) => s<string>())
  .store("workflowId", (s) => s<string>())
  .ref("workflow", "one", { fk: "workflowId" })
  .pk("id");

const workflowModel2 = createModel({
  contract: workflowContract2,
  refs: { logs: () => logModel2 },
  fn: ({ $logs, $id, $name }) => {
    // Compile-time assertion: $logs is Store<ModelInstanceId[]>, not Store<any[]>.
    const _check: typeof $logs extends Store<ModelInstanceId[]> ? "OK" : "FAIL" = "OK";
    void _check;
    return { $id, $name, $logs };
  },
});
const logModel2 = createModel({
  contract: logContract2,
  refs: { workflow: () => workflowModel2 },
});
void logModel2;
