import type { ReValidationMode, ValidationMode } from "../contract/types/validator";

export interface ValidationConfig {
  readonly mode: ValidationMode;
  readonly reValidate: ReValidationMode;
  readonly criteriaMode: "firstError" | "all";
  readonly delayError: number;
}

export const DEFAULT_VALIDATION_CONFIG: ValidationConfig = {
  mode: "submit",
  reValidate: "change",
  criteriaMode: "firstError",
  delayError: 0,
};

/**
 * Should we run validation when the field's value changes?
 * Depends on mode (first-time trigger) and whether the field already has an error
 * (re-validation trigger).
 */
export function shouldRunOnChange(
  mode: ValidationMode,
  reValidate: ReValidationMode,
  hasError: boolean,
): boolean {
  // First-time: modes that validate on change
  if (!hasError) {
    return mode === "change" || mode === "all";
  }
  // Re-validation after first error
  return reValidate === "change";
}

/**
 * Should we run validation when the field is blurred?
 */
export function shouldRunOnBlur(
  mode: ValidationMode,
  reValidate: ReValidationMode,
  hasError: boolean,
): boolean {
  if (!hasError) {
    return mode === "blur" || mode === "touched" || mode === "all";
  }
  return reValidate === "blur";
}

/**
 * Should errors be visible to the user?
 * In "submit" mode, errors are hidden until first submit.
 * In "touched" mode, errors show after first blur.
 */
export function isErrorVisible(
  mode: ValidationMode,
  isSubmitted: boolean,
  isTouched: boolean,
): boolean {
  switch (mode) {
    case "submit":
      return isSubmitted;
    case "blur":
    case "touched":
      return isTouched || isSubmitted;
    case "change":
    case "all":
      return true;
  }
}
