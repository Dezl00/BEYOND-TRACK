"use client";
import { useLanguage } from "@/components/language-context";

import { useEffect, useId, useLayoutEffect, useRef } from "react";
import Decimal from "decimal.js";
import { ChevronDown, ChevronUp } from "lucide-react";
import { decimalText } from "@/lib/format";

type Props = {
  label?: string;
  ariaLabel?: string;
  value: string | number;
  onChange: (value: string) => void;
  precision?: number;
  min?: number;
  max?: number;
  emptyOnBlur?: string;
  className?: string;
};

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 1776))
    .replaceAll("٫", ".")
    .replaceAll("٬", "");
}

export function NumberField({
  label,
  ariaLabel,
  value,
  onChange,
  precision = 3,
  min = 0,
  max,
  emptyOnBlur = "",
  className = "",
}: Props) {
  const { m: msg } = useLanguage();
  
  const inputId = useId(),
    name = ariaLabel ?? label;
  const upper =
    max ??
    Number("999999999999" + (precision ? "." + "9".repeat(precision) : ""));
  const current = useRef(String(value)),
    change = useRef(onChange);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const repeated = useRef(false);
  useLayoutEffect(() => {
    current.current = String(value);
    change.current = onChange;
  }, [value, onChange]);

  function stop() {
    clearTimeout(timer.current);
    timer.current = undefined;
  }
  useEffect(() => {
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      stop();
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, []);
  function publish(next: string) {
    current.current = next;
    change.current(next);
  }
  function step(direction: number) {
    const next = Decimal.max(
      min,
      Decimal.min(upper, new Decimal(current.current || "0").plus(direction)),
    ).toFixed();
    if (next !== current.current) publish(next);
  }
  function start(
    event: React.PointerEvent<HTMLButtonElement>,
    direction: number,
  ) {
    if (event.button !== 0 || event.isPrimary === false) return;
    stop();
    repeated.current = false;
    const button = event.currentTarget;
    button.setPointerCapture?.(event.pointerId);
    const tick = () => {
      if (button.matches(":disabled")) {
        stop();
        return;
      }
      repeated.current = true;
      step(direction);
      timer.current = setTimeout(tick, 110);
    };
    timer.current = setTimeout(tick, 420);
  }
  return (
    <div className={"field number-field " + className}>
      {label && <label htmlFor={inputId}>{label}</label>}
      <div className="number-control" dir="ltr">
        <input
          id={inputId}
          type="text"
          role="spinbutton"
          className="input numeric"
          inputMode={precision ? "decimal" : "numeric"}
          aria-label={ariaLabel}
          aria-valuemin={min}
          aria-valuemax={upper}
          aria-valuenow={value === "" ? undefined : Number(value)}
          value={value}
          onFocus={(e) => e.target.select()}
          onChange={(e) => {
            let next = normalizeDigits(e.target.value);
            if (next.startsWith(".")) next = "0" + next;
            const valid = precision
              ? new RegExp("^\\d{0,12}(?:\\.\\d{0," + precision + "})?$")
              : /^\d{0,12}$/;
            if (valid.test(next)) publish(next);
          }}
          onBlur={() => {
            const next = decimalText(current.current) || emptyOnBlur;
            if (next !== current.current) publish(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              step(e.key === "ArrowUp" ? 1 : -1);
            }
          }}
        />
        <div className="number-buttons">
          {([1, -1] as const).map((direction) => {
            const Icon = direction === 1 ? ChevronUp : ChevronDown;
            return (
              <button
                type="button"
                key={direction}
                aria-label={
                  (direction === 1 ? msg.interface.increase + " " : msg.interface.decrease + " ") + (name ?? "")
                }
                onPointerDown={(e) => start(e, direction)}
                onPointerUp={stop}
                onPointerCancel={stop}
                onLostPointerCapture={stop}
                onBlur={(e) => {
                  if (!e.currentTarget.parentElement?.contains(e.relatedTarget))
                    stop();
                }}
                onContextMenu={(e) => e.preventDefault()}
                onClick={(e) => {
                  if (!repeated.current || e.detail === 0) step(direction);
                  repeated.current = false;
                }}
              >
                <Icon size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
