import { createModel } from "@kbml-tentacles/core";
import {
  combine,
  createEvent,
  createStore,
  type EventCallable,
  type Store,
  sample,
} from "effector";
import type { FormContractChainImpl } from "../contract/form-contract-chain";
import type { FormArrayDescriptor } from "../contract/form-contract-descriptors";
import type { FormArrayShape } from "../types/form-array-shape";
import type { DeepErrors } from "../types/form-shape";
import { buildField } from "./build-field";
import { createFormShapeProxy } from "./build-form-shape";
import { applyDefaults, formContractToModelContract } from "./form-contract-to-model-contract";
import type { FormRuntimeContext } from "./form-runtime-context";

/**
 * Build a FormArrayShape backed by a real @kbml-tentacles/core Model.
 *
 * Each row is a model instance whose `fn` produces a FormRowShape —
 * fields, sub-form proxies, aggregates, and row-specific metadata.
 */
export function buildFormArray<Row extends Record<string, unknown>>(
  descriptor: FormArrayDescriptor,
  path: readonly (string | number)[],
  context: FormRuntimeContext,
): FormArrayShape<Row> {
  // 1. Resolve the row contract (handle thunks for recursive arrays)
  const rowContract: FormContractChainImpl<any, any> = descriptor.isThunk
    ? (descriptor.contract as () => FormContractChainImpl<any, any>)()
    : (descriptor.contract as FormContractChainImpl<any, any>);

  // 2. Convert form contract → model contract (adds __rowId autoincrement + pk)
  const rowModelContract = formContractToModelContract(rowContract);

  // 3. Create the model. The `fn` builds a FormRowShape per instance.
  const rowModel = createModel({
    contract: rowModelContract,
    name: `${context.formName}.${path.join(".")}`,
    fn: (stores: any) => {
      // defaultState is the value assigned during create() — no getState() needed
      const rowId = (stores.$__rowId as any).defaultState as number;
      const rowPath = [...path, rowId];

      // Build fields from the row contract's descriptors
      const fields: Record<string, unknown> = {};
      for (const [name, desc] of Object.entries(rowContract.getFieldDescriptors())) {
        fields[name] = buildField(desc as any, {
          path: [...rowPath, name],
          makeSid: context.makeSid,
        });
        // Sync model store → field.$value via sample (reactive, SSR-safe)
        const field = fields[name] as { $value: Store<unknown>; changed: EventCallable<unknown> };
        const modelStore = stores[`$${name}`] as Store<unknown> | undefined;
        if (modelStore) {
          sample({ clock: modelStore, target: field.$value as any });
        }
      }

      // Build sub-form proxies for nested subs
      for (const [name, desc] of Object.entries(rowContract.getSubDescriptors())) {
        const subContract = desc.isThunk
          ? (desc.contract as () => FormContractChainImpl<any, any>)()
          : (desc.contract as FormContractChainImpl<any, any>);
        fields[name] = createFormShapeProxy(subContract, [...rowPath, name], context);
      }

      // Build nested arrays (recursive)
      for (const [name, desc] of Object.entries(rowContract.getArrayDescriptors())) {
        fields[name] = buildFormArray(desc, [...rowPath, name], context);
      }

      // Row-level aggregate stores
      const fieldEntries = Object.entries(fields).filter(
        ([, v]) => v && (v as any).kind === "field",
      );

      const $values =
        fieldEntries.length > 0
          ? combine(
              Object.fromEntries(
                fieldEntries.map(([k, f]) => [k, (f as any).$value as Store<unknown>]),
              ),
              (snapshot) => ({ ...snapshot }),
            )
          : combine(() => ({}));

      const $errors =
        fieldEntries.length > 0
          ? combine(
              Object.fromEntries(
                fieldEntries.map(([k, f]) => [k, (f as any).$error as Store<string | null>]),
              ),
              (snapshot) => ({ ...snapshot }),
            )
          : combine(() => ({}));

      const $isDirty =
        fieldEntries.length > 0
          ? combine(
              fieldEntries.map(([, f]) => (f as any).$dirty as Store<boolean>),
              (list) => list.some(Boolean),
            )
          : combine(() => false);

      const $isTouched =
        fieldEntries.length > 0
          ? combine(
              fieldEntries.map(([, f]) => (f as any).$touched as Store<boolean>),
              (list) => list.some(Boolean),
            )
          : combine(() => false);

      const $isValidating =
        fieldEntries.length > 0
          ? combine(
              fieldEntries.map(([, f]) => (f as any).$validating),
              (list) => list.some(Boolean),
            )
          : combine(() => false);

      const $errorPaths = combine($errors, (errObj) => {
        const map = new Map<string, string>();
        for (const [k, v] of Object.entries(errObj)) {
          if (typeof v === "string") map.set(k, v);
        }
        return map;
      });

      const $isValid = $errorPaths.map((m) => m.size === 0);

      // Push row aggregate state into shared $rowStates — fully reactive, no getState
      const rowIdStr = String(rowId);
      sample({
        clock: $values as Store<Record<string, unknown>>,
        fn: (values) => ({ id: rowIdStr, state: { values } }),
        target: _setRowState,
      });
      sample({
        clock: $errors as Store<Record<string, unknown>>,
        fn: (errors) => ({
          id: rowIdStr,
          state: {
            errors,
            hasError: Object.values(errors).some((v) => v != null),
          },
        }),
        target: _setRowState,
      });
      sample({
        clock: $isDirty as Store<boolean>,
        fn: (v) => ({ id: rowIdStr, state: { isDirty: v } }),
        target: _setRowState,
      });
      sample({
        clock: $isTouched as Store<boolean>,
        fn: (v) => ({ id: rowIdStr, state: { isTouched: v } }),
        target: _setRowState,
      });
      sample({
        clock: $isValidating as Store<boolean>,
        fn: (v) => ({ id: rowIdStr, state: { isValidating: v } }),
        target: _setRowState,
      });

      // Row remove shortcut → forwards to shared _rowSelfRemove with this row's key
      const removeRow = createEvent<void>();
      sample({
        clock: removeRow,
        fn: () => String(rowId),
        target: _rowSelfRemove,
      });

      return {
        ...fields,
        ...stores,
        $values,
        $errors,
        $errorPaths,
        $isValid,
        $isDirty,
        $isTouched,
        $isValidating,
        // Row-level infrastructure — reuse from form context where available
        $isSubmitting:
          (context.infrastructure.$isSubmitting as Store<boolean>) ?? createStore(false),
        $isSubmitted: (context.infrastructure.$isSubmitted as Store<boolean>) ?? createStore(false),
        $isSubmitSuccessful:
          (context.infrastructure.$isSubmitSuccessful as Store<boolean>) ?? createStore(false),
        $submitCount: (context.infrastructure.$submitCount as Store<number>) ?? createStore(0),
        $formError: createStore<string | null>(null),
        $disabled: (context.infrastructure.$disabled as Store<boolean>) ?? createStore(false),
        $dirtyFields: combine(() => new Set<string>()),
        $touchedFields: combine(() => new Set<string>()),
        $validatingFields: combine(() => new Set<string>()),
        key: rowId,
        remove: removeRow,
        __path: rowPath,
        kind: "form",
      };
    },
  });

  // Eagerly capture model APIs (getters may be lazy)
  const reorderEvent = (rowModel as any).reorder;

  // Shared event for row self-removal — each row's `remove` maps to this with its key
  const _rowSelfRemove = createEvent<string>();
  sample({ clock: _rowSelfRemove, target: rowModel.deleteFx });

  // Shared per-row state registry — each row pushes aggregate changes here via events.
  // Array-level aggregates derive from this + $ids. Zero getState() calls.
  interface RowState {
    values: Record<string, unknown>;
    errors: Record<string, unknown>;
    hasError: boolean; // pre-computed O(1) flag — avoids O(F) iteration per row in aggregates
    isDirty: boolean;
    isTouched: boolean;
    isValidating: boolean;
  }
  const EMPTY_ROW: RowState = {
    values: {},
    errors: {},
    hasError: false,
    isDirty: false,
    isTouched: false,
    isValidating: false,
  };
  const _setRowState = createEvent<{ id: string; state: Partial<RowState> }>();
  const _removeRowState = createEvent<string>();
  const $rowStates = createStore<Record<string, RowState>>({})
    .on(_setRowState, (map, { id, state }) => ({
      ...map,
      [id]: { ...(map[id] ?? EMPTY_ROW), ...state },
    }))
    .on(_removeRowState, (map, id) => {
      const { [id]: _, ...rest } = map;
      return rest;
    })
    .on(rowModel.cleared, () => ({}));

  // Clean up row state on delete — reactive via sample
  sample({
    clock: rowModel.deleted,
    filter: (inst: any) => inst?.__id != null,
    fn: (inst: any) => String(inst.__id),
    target: _removeRowState,
  });

  // 4. Form-array operation events
  const appendEv = createEvent<any>();
  const prependEv = createEvent<any>();
  const insertEv = createEvent<{ index: number; value: any }>();
  const removeEv = createEvent<number | number[] | undefined>();
  const removeKeyEv = createEvent<string | number>();
  const moveEv = createEvent<{ from: number; to: number }>();
  const swapEv = createEvent<{ a: number; b: number }>();
  const updateEv = createEvent<{ index: number; value: any }>();
  const replaceEv = createEvent<any[]>();
  const clearEv = createEvent<void>();

  // append → defaults + createFx
  sample({
    clock: appendEv,
    fn: (data: any) => {
      const items = Array.isArray(data) ? data : [data ?? {}];
      return items.map((d: any) => applyDefaults(rowContract, d ?? {}));
    },
    target: rowModel.createManyFx,
  });

  // prepend → create + reorder (move to front)
  const $prependPending = createStore<number>(0);

  sample({
    clock: prependEv,
    fn: (data: any) => {
      const items = Array.isArray(data) ? data : [data ?? {}];
      return items.map((d: any) => applyDefaults(rowContract, d ?? {}));
    },
    target: rowModel.createManyFx,
  });

  sample({
    clock: prependEv,
    fn: (data: any) => (Array.isArray(data) ? data.length : 1),
    target: $prependPending,
  });

  sample({
    clock: rowModel.created,
    source: { ids: rowModel.$ids, pending: $prependPending },
    filter: ({ pending }) => pending > 0,
    fn: ({ ids, pending }) => {
      const newItems = ids.slice(-pending);
      const existing = ids.slice(0, -pending);
      return [...newItems, ...existing];
    },
    target: reorderEvent,
  });

  sample({
    clock: reorderEvent,
    source: $prependPending,
    filter: (pending: number) => pending > 0,
    fn: () => 0,
    target: $prependPending,
  });

  // insert at index
  sample({
    clock: insertEv,
    fn: ({ value }) => {
      const items = Array.isArray(value) ? value : [value];
      return items.map((d: any) => applyDefaults(rowContract, d));
    },
    target: rowModel.createManyFx,
  });

  const $insertAt = createStore<number | null>(null);
  sample({
    clock: insertEv,
    fn: ({ index }) => index,
    target: $insertAt,
  });

  sample({
    clock: rowModel.created,
    source: { ids: rowModel.$ids, at: $insertAt },
    filter: ({ at }) => at !== null,
    fn: ({ ids, at }) => {
      const newId = ids[ids.length - 1]!;
      const rest = ids.slice(0, -1);
      const result = [...rest];
      result.splice(at!, 0, newId);
      return result;
    },
    target: reorderEvent,
  });

  sample({
    clock: reorderEvent,
    source: $insertAt,
    filter: (at: number | null) => at !== null,
    fn: () => null,
    target: $insertAt,
  });

  // remove by index → resolve index to ID via $ids, then deleteFx
  // Single index: one sample chain, no fan-out needed
  sample({
    clock: removeEv,
    source: rowModel.$ids,
    filter: (_, idx) => typeof idx === "number",
    fn: (ids, idx) => String(ids[idx as number]),
    target: rowModel.deleteFx,
  });

  // Array of indices → resolve to array of IDs, clear all via sequential deleteFx
  // Use an intermediate store to hold pending deletions, then drain one at a time
  const $pendingDeletes = createStore<string[]>([]);
  const _drainNext = createEvent<void>();

  sample({
    clock: removeEv,
    source: rowModel.$ids,
    filter: (_, idx) => Array.isArray(idx),
    fn: (ids, indices) =>
      (indices as number[])
        .map((i) => ids[i])
        .filter((id): id is string | number => id != null)
        .map(String),
    target: $pendingDeletes,
  });

  // When pending deletes are set, drain first item
  sample({
    clock: $pendingDeletes,
    filter: (list) => list.length > 0,
    target: _drainNext,
  });

  // Drain: take first ID, delete it, then shift the queue
  sample({
    clock: _drainNext,
    source: $pendingDeletes,
    filter: (list) => list.length > 0,
    fn: (list) => list[0]!,
    target: rowModel.deleteFx,
  });

  sample({
    clock: _drainNext,
    source: $pendingDeletes,
    filter: (list) => list.length > 0,
    fn: (list) => list.slice(1),
    target: $pendingDeletes,
  });

  // remove all when undefined
  sample({
    clock: removeEv,
    filter: (idx) => idx === undefined,
    target: clearEv,
  });

  // removeKey → deleteFx
  sample({ clock: removeKeyEv, fn: (id) => String(id), target: rowModel.deleteFx });

  // move
  sample({
    clock: moveEv,
    source: rowModel.$ids,
    fn: (ids, { from, to }) => {
      const next = [...ids];
      const [item] = next.splice(from, 1);
      if (item != null) next.splice(to, 0, item);
      return next;
    },
    target: reorderEvent,
  });

  // swap
  sample({
    clock: swapEv,
    source: rowModel.$ids,
    fn: (ids, { a, b }) => {
      const next = [...ids];
      if (next[a] != null && next[b] != null) {
        [next[a], next[b]] = [next[b]!, next[a]!];
      }
      return next;
    },
    target: reorderEvent,
  });

  // update at index
  sample({
    clock: updateEv,
    source: rowModel.$ids,
    fn: (ids, { index, value }) => ({
      id: String(ids[index]),
      data: value,
    }),
    target: rowModel.updateFx,
  });

  // replace → clear + createMany
  sample({
    clock: replaceEv,
    target: rowModel.clearFx,
  });
  sample({
    clock: replaceEv,
    fn: (items: any[]) => items.map((d) => applyDefaults(rowContract, d)),
    target: rowModel.createManyFx,
  });

  // clear
  sample({ clock: clearEv, target: rowModel.clearFx });

  // 5. Row self-removal is wired inside the model fn via sample → _rowSelfRemove

  // 6. Form-array aggregates — derived from $rowStates + $ids via combine (no getState)

  const $arrayValues: Store<Row[]> = combine(rowModel.$ids, $rowStates, (ids, states) =>
    ids.map((id) => (states[String(id)]?.values ?? {}) as Row),
  ) as Store<Row[]>;

  // $errors uses pre-computed hasError flag — O(N) instead of O(N×F)
  const $arrayErrors: Store<ReadonlyArray<DeepErrors<Row> | null>> = combine(
    rowModel.$ids,
    $rowStates,
    (ids, states) =>
      ids.map((id) => {
        const s = states[String(id)];
        if (!s) return null;
        return s.hasError ? s.errors : null;
      }),
  ) as Store<ReadonlyArray<DeepErrors<Row> | null>>;

  const $arrayIsDirty = combine(rowModel.$ids, $rowStates, (ids, states) =>
    ids.some((id) => states[String(id)]?.isDirty === true),
  );

  const $arrayIsTouched = combine(rowModel.$ids, $rowStates, (ids, states) =>
    ids.some((id) => states[String(id)]?.isTouched === true),
  );

  const $arrayIsValidating = combine(rowModel.$ids, $rowStates, (ids, states) =>
    ids.some((id) => states[String(id)]?.isValidating === true),
  );

  // min/max constraints → $arrayError
  const minVal =
    typeof descriptor.min === "number" ? descriptor.min : (descriptor.min?.value ?? null);
  const minMsg =
    typeof descriptor.min === "object" && descriptor.min
      ? descriptor.min.message
      : minVal != null
        ? `At least ${minVal} required`
        : null;
  const maxVal =
    typeof descriptor.max === "number" ? descriptor.max : (descriptor.max?.value ?? null);
  const maxMsg =
    typeof descriptor.max === "object" && descriptor.max
      ? descriptor.max.message
      : maxVal != null
        ? `At most ${maxVal} allowed`
        : null;

  const $arrayError: Store<string | null> = rowModel.$count.map((count: number) => {
    if (minVal != null && count < minVal) return minMsg;
    if (maxVal != null && count > maxVal) return maxMsg;
    return null;
  });

  const $arrayIsValid = combine($arrayErrors, $arrayError, (errList, arrErr) => {
    if (arrErr !== null) return false;
    return errList.every((e) => e === null || (typeof e === "object" && isEmptyErrors(e)));
  });

  // 7. Positional helpers — reactive, O(1) via model.instance() memoized lookup
  const $at = (index: number) =>
    combine(rowModel.$ids, (ids) => {
      const id = ids[index];
      if (id == null) return null;
      return rowModel.instance(id);
    });

  // 8. Assemble FormArrayShape
  const arrayShape: FormArrayShape<Row> = {
    // Spread model APIs
    $ids: rowModel.$ids,
    $count: rowModel.$count,
    $instances: rowModel.$instances,
    instance: rowModel.instance.bind(rowModel),
    createFx: rowModel.createFx,
    createManyFx: rowModel.createManyFx,
    deleteFx: rowModel.deleteFx,
    clearFx: rowModel.clearFx,
    updateFx: rowModel.updateFx,
    created: rowModel.created,
    deleted: rowModel.deleted,
    cleared: rowModel.cleared,
    updated: rowModel.updated,
    reorder: reorderEvent,
    query: rowModel.query.bind(rowModel),

    // Form-array aggregates
    $values: $arrayValues,
    $errors: $arrayErrors,
    $isValid: $arrayIsValid,
    $isDirty: $arrayIsDirty,
    $isTouched: $arrayIsTouched,
    $isValidating: $arrayIsValidating,
    $arrayError,

    // Form-array operations
    append: appendEv,
    prepend: prependEv,
    insert: insertEv,
    remove: removeEv,
    removeKey: removeKeyEv,
    move: moveEv,
    swap: swapEv,
    update: updateEv,
    replace: replaceEv,
    clear: clearEv,

    // Positional (reactive only — use $at for Store-based access)
    $at,

    // Metadata
    __path: path,
    kind: "array",
  } as FormArrayShape<Row>;

  // Cache the array shape for proxy resolution
  const cacheKey = `array:${path.join(".")}`;
  context.cache.set(cacheKey, arrayShape);

  return arrayShape;
}

function isEmptyErrors(err: unknown): boolean {
  if (err == null) return true;
  if (typeof err === "string") return false;
  if (Array.isArray(err)) return err.every(isEmptyErrors);
  if (typeof err === "object") return Object.values(err).every(isEmptyErrors);
  return true;
}
