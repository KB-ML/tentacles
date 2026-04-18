import type { Store } from "effector";
import type { ModelInstanceId } from "../model/types";
import { CollectionQuery } from "./collection-query";
import { GroupedQuery } from "./grouped-query";
import { QueryDescriptor } from "./query-descriptor";
import type { QueryContext } from "./types";

type InstanceWithId = { __id: ModelInstanceId };

export class QueryRegistry<
  Contract extends Record<string, unknown>,
  Generics extends Record<string, unknown>,
  Ext extends Record<string, unknown>,
  Instance extends InstanceWithId = InstanceWithId,
> {
  private readonly queries = new Map<string, CollectionQuery<Contract, Generics, Ext, Instance>>();
  private readonly groupedQueries = new Map<
    string,
    GroupedQuery<Contract, Generics, Ext, unknown, Instance>
  >();

  constructor(private readonly context: QueryContext<Instance>) {}

  getOrCreate(descriptor: QueryDescriptor): CollectionQuery<Contract, Generics, Ext, Instance> {
    const key = descriptor.toKey();
    let query = this.queries.get(key);
    if (query) return query;
    query = new CollectionQuery(descriptor, this.context, this);
    this.queries.set(key, query);
    return query;
  }

  getOrCreateGrouped(
    descriptor: QueryDescriptor,
    parentIds: () => Store<ModelInstanceId[]>,
  ): GroupedQuery<Contract, Generics, Ext, unknown, Instance> {
    const key = descriptor.toKey();
    let query = this.groupedQueries.get(key);
    if (query) return query;
    query = new GroupedQuery(descriptor, parentIds, this.context, this);
    this.groupedQueries.set(key, query);
    return query;
  }

  createFromStore(
    ids: Store<ModelInstanceId[]>,
  ): CollectionQuery<Contract, Generics, Ext, Instance> {
    return new CollectionQuery(QueryDescriptor.empty(), this.context, this, ids);
  }

  /** Clear all cached queries. Called by model.clear() to prevent unbounded growth
   *  in applications that build many dynamic query shapes over time. */
  dispose(): void {
    this.queries.clear();
    this.groupedQueries.clear();
  }
}
