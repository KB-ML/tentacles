import { type ContractEntity, ContractFieldKind, type ContractRef } from "../contract";
import { type CompoundKey, InstanceCache } from "./instance-cache";
import { validateCompoundKey } from "./utils";

export type PkFunction = (data: any) => string | number | CompoundKey;

export class PrimaryKeyResolver<
  Contract extends Record<string, ContractEntity<ContractFieldKind, unknown>>,
> {
  constructor(
    private readonly contract: Contract,
    private readonly pk: PkFunction,
    private readonly cache: InstanceCache<any>,
    private readonly resolveTargetModel: (
      entity: ContractRef,
      fieldName: string,
    ) => {
      pkResolver: PrimaryKeyResolver<any>;
    },
  ) {}

  /** Resolve PK from data without stringifying — returns the raw value from the pk function. */
  resolveRaw(data: Record<string, unknown>): string | number | CompoundKey {
    const pkData = { ...data };
    for (const key of Object.keys(this.contract)) {
      const entity = this.contract[key];
      if (!entity || entity.kind !== ContractFieldKind.Ref) continue;
      const fk = (entity as ContractRef).fk;
      if (fk && fk in pkData && !(key in pkData)) {
        pkData[key] = pkData[fk];
        delete pkData[fk];
      }
    }
    return this.pk(pkData);
  }

  resolve(data: Record<string, unknown>): string {
    const pkData = { ...data };

    // Remap FK fields to ref field names before pk resolution
    for (const key of Object.keys(this.contract)) {
      const entity = this.contract[key];
      if (!entity || entity.kind !== ContractFieldKind.Ref) continue;
      const fk = (entity as ContractRef).fk;
      if (fk && fk in pkData && !(key in pkData)) {
        pkData[key] = pkData[fk];
        delete pkData[fk];
      }
    }

    for (const key of Object.keys(this.contract)) {
      const entity = this.contract[key];
      if (!entity || entity.kind !== ContractFieldKind.Ref) continue;

      const val = pkData[key];
      if (val == null) continue;

      const refEntity = entity as ContractRef;
      const target = this.resolveTargetModel(refEntity, key);

      const resolveOne = (v: unknown): string => {
        if (typeof v === "string" || typeof v === "number") return String(v);
        const obj = v as Record<string, unknown>;
        if ("connect" in obj) {
          const c = obj.connect;
          // connect accepts scalar ID or object (extract PK)
          return typeof c === "string" || typeof c === "number"
            ? String(c)
            : target.pkResolver.resolve(c as Record<string, unknown>);
        }
        if ("create" in obj)
          return target.pkResolver.resolve(obj.create as Record<string, unknown>);
        if ("connectOrCreate" in obj)
          return target.pkResolver.resolve(obj.connectOrCreate as Record<string, unknown>);
        return target.pkResolver.resolve(obj);
      };

      let resolved: string | string[];
      if (refEntity.cardinality === "many") {
        if (Array.isArray(val)) {
          // Plain array shortcut: each element is connectOrCreate data
          resolved = (val as Record<string, unknown>[]).map((d) => target.pkResolver.resolve(d));
        } else {
          // Operation object: { connect?, create?, connectOrCreate? }
          const ops = val as Record<string, unknown>;
          const ids: string[] = [];
          if (ops.connect) {
            for (const id of ops.connect as unknown[]) ids.push(resolveOne(id));
          }
          if (ops.create) {
            for (const d of ops.create as Record<string, unknown>[])
              ids.push(target.pkResolver.resolve(d));
          }
          if (ops.connectOrCreate) {
            for (const d of ops.connectOrCreate as Record<string, unknown>[])
              ids.push(target.pkResolver.resolve(d));
          }
          resolved = ids;
        }
      } else {
        resolved = resolveOne(val);
      }
      pkData[key] = resolved;

      // Reverse FK: populate FK field so pk functions using FK names work
      // e.g. pk((d) => [d.categoryId, d.id]) with category: { connect: 1 }
      const fk = refEntity.fk;
      if (fk && !(fk in pkData)) {
        pkData[fk] = resolved;
      }
    }

    const result = this.pk(pkData);

    if (Array.isArray(result)) {
      validateCompoundKey(result);
      const serialized = result.map(String).join(InstanceCache.COMPOUND_PK_DELIMITER);
      this.cache.registerCompoundKey(serialized, result as CompoundKey);
      return serialized;
    }

    return String(result);
  }
}
