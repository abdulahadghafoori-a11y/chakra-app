"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Makes line unit, qty, and courier amounts easy to overwrite (clears misleading zeros). */
export type DraftNumericVariant =
  | "unitUsd"
  | "unitAfn"
  | "qty"
  | "courierUsd"
  | "courierAfn";

type Props = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type" | "defaultValue"
> & {
  value: number;
  onValueChange: (n: number) => void;
  variant: DraftNumericVariant;
};

function displayFromValue(value: number, variant: DraftNumericVariant): string {
  if (!Number.isFinite(value)) return "";
  if (variant === "qty") return String(Math.trunc(value));
  if (variant === "unitAfn" || variant === "courierAfn") {
    return String(Math.round(value + Number.EPSILON));
  }
  const s = value.toFixed(2).replace(/\.?0+$/, "");
  return s === "-0" ? "0" : s;
}

function mergeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined>
): React.RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (typeof ref === "function") ref(node);
      else if (ref && "current" in ref)
        (ref as React.MutableRefObject<T | null>).current = node;
    }
  };
}

export const DraftNumericInput = React.forwardRef<HTMLInputElement, Props>(
  function DraftNumericInput(
    { value, onValueChange, variant, className, onBlur, onFocus, ...rest },
    ref,
  ) {
    const innerRef = React.useRef<HTMLInputElement>(null);
    const [focused, setFocused] = React.useState(false);
    const [text, setText] = React.useState(() =>
      displayFromValue(value, variant),
    );

    React.useEffect(() => {
      if (!focused) {
        setText(displayFromValue(value, variant));
      }
    }, [value, variant, focused]);

    const sanitizeTyping = React.useCallback(
      (raw: string) => {
        if (variant === "qty") {
          return raw.replace(/\D/g, "").slice(0, 6);
        }
        if (variant === "unitAfn" || variant === "courierAfn") {
          return raw.replace(/\D/g, "").slice(0, 12);
        }
        let next = raw.replace(/,/g, ".");
        next = next.replace(/[^\d.]/g, "");
        const dot = next.indexOf(".");
        if (dot === -1) return next.slice(0, 12);
        const intPart = next.slice(0, dot).replace(/\./g, "");
        const frac = next
          .slice(dot + 1)
          .replace(/\./g, "")
          .slice(0, 2);
        return `${intPart}.${frac}`;
      },
      [variant],
    );

    const handleBlur = React.useCallback(
      (e: React.FocusEvent<HTMLInputElement>) => {
        setFocused(false);
        const trimmed = text.trim();

        const revert = () => {
          const d = displayFromValue(value, variant);
          setText(d);
        };

        if (trimmed === "") {
          if (variant === "unitUsd" || variant === "unitAfn") {
            onValueChange(0);
            setText(displayFromValue(0, variant));
            onBlur?.(e);
            return;
          }
          if (variant === "qty") {
            onValueChange(1);
            setText(displayFromValue(1, variant));
            onBlur?.(e);
            return;
          }
          onValueChange(0);
          setText(displayFromValue(0, variant));
          onBlur?.(e);
          return;
        }

        if (variant === "qty") {
          const n = Number.parseInt(trimmed, 10);
          if (!Number.isFinite(n) || n < 1 || n > 99_999) {
            revert();
            onBlur?.(e);
            return;
          }
          onValueChange(n);
          setText(displayFromValue(n, variant));
          onBlur?.(e);
          return;
        }

        if (variant === "unitAfn") {
          const n = Number.parseInt(trimmed, 10);
          if (!Number.isFinite(n) || n < 1 || n > 9_999_999_999_999) {
            revert();
            onBlur?.(e);
            return;
          }
          onValueChange(n);
          setText(displayFromValue(n, variant));
          onBlur?.(e);
          return;
        }

        if (variant === "courierAfn") {
          const n = Number.parseInt(trimmed, 10);
          if (!Number.isFinite(n) || n < 0 || n > 9_999_999_999_999) {
            revert();
            onBlur?.(e);
            return;
          }
          onValueChange(n);
          setText(displayFromValue(n, variant));
          onBlur?.(e);
          return;
        }

        const x = Number.parseFloat(trimmed);
        if (!Number.isFinite(x)) {
          revert();
          onBlur?.(e);
          return;
        }

        if (variant === "unitUsd") {
          if (x <= 0) {
            revert();
            onBlur?.(e);
            return;
          }
          onValueChange(Number(x.toFixed(4)));
          setText(displayFromValue(x, variant));
          onBlur?.(e);
          return;
        }

        if (x < 0) {
          revert();
          onBlur?.(e);
          return;
        }
        onValueChange(Number(x.toFixed(4)));
        setText(displayFromValue(x, variant));
        onBlur?.(e);
      },
      [onBlur, onValueChange, text, value, variant],
    );

    return (
      <Input
        ref={mergeRefs(ref, innerRef)}
        type="text"
        autoComplete="off"
        spellCheck={false}
        inputMode={
          variant === "qty" ||
          variant === "unitAfn" ||
          variant === "courierAfn"
            ? "numeric"
            : "decimal"
        }
        className={cn(className)}
        value={text}
        onFocus={(e) => {
          setFocused(true);
          if (variant === "unitUsd" && value <= 0) {
            setText("");
          } else if (variant === "unitAfn" && value <= 0) {
            setText("");
          } else if (variant === "courierUsd" && value === 0) {
            setText("");
          } else if (variant === "courierAfn" && value === 0) {
            setText("");
          } else if (variant === "qty" && value === 1) {
            setText("");
          } else {
            innerRef.current?.select();
          }
          onFocus?.(e);
        }}
        onChange={(e) => {
          const nextRaw = sanitizeTyping(e.target.value);
          setText(nextRaw);
          if (variant === "qty") {
            if (nextRaw === "") return;
            const n = Number.parseInt(nextRaw, 10);
            if (Number.isFinite(n)) onValueChange(n);
            return;
          }
          if (variant === "unitAfn") {
            if (nextRaw === "") return;
            const n = Number.parseInt(nextRaw, 10);
            if (Number.isFinite(n) && n > 0) onValueChange(n);
            return;
          }
          if (variant === "courierAfn") {
            if (nextRaw === "") return;
            const n = Number.parseInt(nextRaw, 10);
            if (Number.isFinite(n) && n >= 0) onValueChange(n);
            return;
          }
          if (nextRaw === "" || nextRaw === ".") return;
          if (/^\d*\.$/.test(nextRaw)) return;
          const x = Number.parseFloat(nextRaw);
          if (!Number.isFinite(x)) return;
          if (variant === "unitUsd" && x > 0) onValueChange(x);
          else if (variant === "courierUsd" && x >= 0) onValueChange(x);
        }}
        onBlur={handleBlur}
        {...rest}
      />
    );
  },
);
