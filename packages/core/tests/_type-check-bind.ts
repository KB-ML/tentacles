import { createContract, createModel } from "../index";
import type { ConnectByPk } from "../layers/model/types/contract-model-ref-data";

// ═══ Basic: one ref with strict typing ═══

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
const todoModel = createModel({ contract: todoContract }).bind({ category: () => catModel });

// ✓ Valid
todoModel.create({ id: 1, title: "ok", category: { connect: 1 } });
todoModel.create({ id: 1, title: "ok", category: { create: { id: 1, title: "x" } } });
todoModel.create({ id: 1, title: "ok", category: { connectOrCreate: { id: 1, title: "x" } } });

// ✗ Missing required field
// @ts-expect-error
todoModel.create({ id: 1, title: "ok", category: { create: { id: 1 } } });

// ✗ Wrong field type
// @ts-expect-error
todoModel.create({ id: 1, title: "ok", category: { create: { id: 1, title: 123 } } });

// ✗ Unknown field
// @ts-expect-error
todoModel.create({ id: 1, title: "ok", category: { create: { id: 1, title: "x", unknown: 1 } } });

// ═══ Compound PK: connect with object ═══

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
const employeeModel = createModel({ contract: employeeContract }).bind({
  company: () => companyModel,
});

// ✓ Connect by scalar (serialized compound key)
employeeModel.create({ id: "e1", name: "Alice", company: { connect: "us\x005" } });

// ✓ Connect by object — only PK fields
employeeModel.create({
  id: "e1",
  name: "Alice",
  company: { connect: { region: "us", code: 5 } },
});

// ✓ Connect with PK fields only (name not required)
employeeModel.create({
  id: "e1",
  name: "Alice",
  company: { connect: { region: "us", code: 5 } },
});

// ✗ Connect with non-PK field only — missing required PK fields
// @ts-expect-error
const _badConnect: ConnectByPk<typeof companyModel> = { name: "Acme" };

// ✗ Connect with wrong PK field type
employeeModel.create({
  id: "e1",
  name: "Alice",
  // @ts-expect-error
  company: { connect: { region: "us", code: "five" } },
});

// ✓ Create with all required fields
employeeModel.create({
  id: "e1",
  name: "Alice",
  company: { create: { region: "us", code: 5, name: "Acme" } },
});

// ✓ Connect with object — only PK fields needed (name not required)
employeeModel.create({
  id: "e1",
  name: "Alice",
  company: { connect: { region: "us", code: 5 } },
});

// ✗ Connect with object wrong type
employeeModel.create({
  id: "e1",
  name: "Alice",
  // @ts-expect-error
  company: { connect: { region: "us", code: "five" } },
});

// ✗ Create missing required field
employeeModel.create({
  id: "e1",
  name: "Alice",
  // @ts-expect-error
  company: { create: { region: "us", code: 5 } },
});

// ═══ Many ref: strict create data ═══

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
const postModel = createModel({ contract: postContract }).bind({ tags: () => tagModel });

// ✓ Valid many ref operations
postModel.create({ id: "p1", body: "hi", tags: { connect: ["t1", "t2"] } });
postModel.create({ id: "p1", body: "hi", tags: { create: [{ id: "t1", label: "ts" }] } });
postModel.create({
  id: "p1",
  body: "hi",
  tags: { connectOrCreate: [{ id: "t1", label: "ts" }] },
});

// ✗ Create missing required field in many ref
// @ts-expect-error
postModel.create({ id: "p1", body: "hi", tags: { create: [{ id: "t1" }] } });

// ✗ Wrong type in many ref create
// @ts-expect-error
postModel.create({ id: "p1", body: "hi", tags: { create: [{ id: "t1", label: 123 }] } });

// ═══ Update: same strict typing ═══

// ✓ Valid update
todoModel.update(1, { category: { connect: 1 } });
todoModel.update(1, { category: { create: { id: 2, title: "new" } } });

// ✗ Update create missing field
// @ts-expect-error
todoModel.update(1, { category: { create: { id: 2 } } });

// ✓ Update: plain object shortcut = connectOrCreate
todoModel.update(1, { category: { id: 2, title: "upserted" } });

// ✓ Update: plain array shortcut for many = add + connectOrCreate
postModel.update("p1", { tags: [{ id: "t1", label: "upserted" }] });

// ✗ Update: plain object with wrong type
// @ts-expect-error
todoModel.update(1, { category: { id: 2, title: 123 } });

// ═══ Query: where + update with ref operations ═══

import { eq, gt } from "../index";

// ✓ query.update accepts ref operations
const todoQuery = todoModel.query().where("title", eq("Task"));
todoQuery.update({ category: { connect: 1 } });
todoQuery.update({ title: "Updated" });

// ✓ chained query with multiple where clauses
todoModel.query().where("id", gt(0)).where("title", eq("x")).update({ title: "y" });

// ✓ query.update with many ref operations
const postQuery = postModel.query().where("body", eq("hi"));
postQuery.update({ tags: { set: ["t1", "t2"] } });
postQuery.update({ tags: { add: [{ create: { id: "t3", label: "new" } }], disconnect: ["t1"] } });

// ✓ query.update: plain object shortcut = connectOrCreate
todoQuery.update({ category: { id: 2, title: "upserted" } });

// ✓ query.update: plain array shortcut for many = add + connectOrCreate
postQuery.update({ tags: [{ id: "t1", label: "upserted" }] });

// ✗ query.update with invalid create data
// @ts-expect-error
postQuery.update({ tags: { add: [{ create: { a: "test", b: "new" } }] } });

// ✗ query.update with invalid store field type
// @ts-expect-error
todoQuery.update({ title: 123 });

// ✗ query.update with wrong ref operation data
// @ts-expect-error
todoQuery.update({ category: { create: { id: 1 } } });

// ✗ query.update: plain array with wrong type
// @ts-expect-error
postQuery.update({ tags: [{ id: "t1", label: 123 }] });

// ✓ query field accessor
todoQuery.field("title").$values;
postQuery.field("body").$values;

// ✓ query delete
todoQuery.delete();

// ✓ query terminals
todoQuery.$count;
todoQuery.$ids;
