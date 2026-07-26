"use client";

import {
  forwardRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";
import { normalizeNumericDraft } from "@/lib/numericInput";

type NativeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange" | "min" | "max"
>;

export type NumericInputProps = NativeProps & {
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
  integer?: boolean;
  allowNegative?: boolean;
  decimalPlaces?: number;
  min?: number;
  max?: number;
};

/**
 * Numeric editor intentionally rendered as text. Native number inputs and
 * Number(event.target.value) controlled state are the combination that caused
 * Backspace/Delete to restore zero or the previous value in production.
 */
const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  function NumericInput(
    {
      value,
      defaultValue,
      onValueChange,
      integer = false,
      allowNegative = false,
      decimalPlaces = 2,
      inputMode,
      pattern,
      onKeyDown,
      onBeforeInput,
      min,
      max,
      ...props
    },
    ref,
  ) {
    const normalize = (raw: string) =>
      normalizeNumericDraft(raw, {
        integer,
        allowNegative,
        maximumDecimalPlaces: decimalPlaces,
      });
    const controlled = value !== undefined;
    return (
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode={inputMode || (integer ? "numeric" : "decimal")}
        pattern={pattern || (allowNegative ? "-?[0-9]*[.]?[0-9]*" : "[0-9]*[.]?[0-9]*")}
        value={controlled ? String(value) : undefined}
        defaultValue={!controlled && defaultValue !== undefined ? String(defaultValue) : undefined}
        data-numeric-input
        data-min={min}
        data-max={max}
        onBeforeInput={(event) => {
          const inserted = (event.nativeEvent as InputEvent).data || "";
          if (
            [...inserted].some(
              (character) =>
                !/\d/.test(character) &&
                !(character === "." && !integer) &&
                !(character === "-" && allowNegative),
            )
          ) {
            event.preventDefault();
          }
          onBeforeInput?.(event);
        }}
        onChange={(event) => {
          const input = event.currentTarget;
          const raw = input.value;
          const normalized = normalize(raw);
          if (raw !== normalized) {
            const cursor = input.selectionStart ?? raw.length;
            const removedBeforeCursor = Math.max(
              0,
              raw.slice(0, cursor).length -
                normalize(raw.slice(0, cursor)).length,
            );
            input.value = normalized;
            const nextCursor = Math.max(0, cursor - removedBeforeCursor);
            input.setSelectionRange(nextCursor, nextCursor);
            queueMicrotask(() => {
              // React restores controlled input values after the change
              // handler. When normalization yields the same parent state as
              // before, no render follows and that restoration can put the
              // rejected browser draft back. Re-apply the sanitized DOM draft
              // after the event while preserving the caret.
              if (input.isConnected && input.value !== normalized) {
                input.value = normalized;
                input.setSelectionRange(nextCursor, nextCursor);
              }
            });
          }
          onValueChange?.(normalized);
        }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData("text");
          const normalized = normalize(pasted);
          if (!normalized && pasted.trim()) event.preventDefault();
        }}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey &&
            event.key.length === 1 &&
            !/\d/.test(event.key) &&
            !(event.key === "." && !integer) &&
            !(event.key === "-" && allowNegative)
          )
            event.preventDefault();
          onKeyDown?.(event);
        }}
      />
    );
  },
);

export default NumericInput;
