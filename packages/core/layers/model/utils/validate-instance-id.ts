import { TentaclesError } from "../../shared/tentacles-error";
import type { ModelInstanceId } from "../types";

export function validateInstanceId(id: ModelInstanceId): void {
  const stringId = String(id);
  if (stringId === "" || /[:|]/.test(stringId)) {
    throw new TentaclesError(
      `Instance ID must not be empty or contain ":" or "|" characters, got: "${stringId}"`,
    );
  }
}

export function validateCompoundKey(parts: (string | number)[]): void {
  if (parts.length < 2) {
    throw new TentaclesError(`Compound PK must have at least 2 elements, got ${parts.length}`);
  }
  for (const part of parts) {
    validateInstanceId(part);
  }
}
