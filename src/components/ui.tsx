"use client";
import { useEffect, useId, useState, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Select from "@radix-ui/react-select";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  CalendarDays,
} from "lucide-react";
import { ar } from "@/messages/ar";
import { useDigits } from "./format-context";
import { number } from "@/lib/format";
import { Button } from "./form-controls";
export { Button, Field, Checkbox, Message, command } from "./form-controls";
export function SelectBox({
  value,
  onChange,
  options,
  placeholder = ar.common.select,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <Select.Root
      dir="rtl"
      value={value || undefined}
      onValueChange={onChange}
      disabled={disabled}
    >
      <Select.Trigger
        className="select-trigger"
        aria-label={
          options.find((option) => option.value === value)?.label || placeholder
        }
      >
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown size={15} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className="select-content"
          position="popper"
          sideOffset={6}
        >
          <Select.Viewport>
            {options.map((o) => (
              <Select.Item
                key={o.value}
                value={o.value}
                className="select-item"
              >
                <Select.ItemText>{o.label}</Select.ItemText>
                <Select.ItemIndicator>
                  <Check size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
export function Lookup({
  resource,
  value,
  onChange,
  project,
  initialLabel,
  allowNone = false,
  onlyLevel,
  defaultOpen = false,
}: {
  resource: string;
  value: string;
  onChange: (v: string, label?: string) => void;
  project?: string;
  initialLabel?: string;
  allowNone?: boolean;
  onlyLevel?: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen),
    [q, setQ] = useState(""),
    [items, setItems] = useState<
      {
        id: string;
        name: string;
        code?: string;
        level?: number;
        active?: boolean;
        archived?: boolean;
      }[]
    >([]),
    [next, setNext] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [label, setLabel] = useState(initialLabel || ""),
    [error, setError] = useState("");
  async function fetchOptions(cursor?: string, signal?: AbortSignal) {
    setBusy(true);
    try {
      const params = new URLSearchParams({
        resource,
        q,
        ...(project ? { project } : {}),
        ...(cursor ? { cursor } : {}),
      });
      const response = await fetch(`/api/options?${params}`, { signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNext(data.next);
      setError("");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(ar.common.failed);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(
      () => void fetchOptions(undefined, controller.signal),
      180,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, q, project, resource]);
  const visible = items.filter(
    (x) =>
      (onlyLevel === undefined || x.level === onlyLevel) &&
      x.active !== false &&
      !x.archived,
  );
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="select-trigger">
          <span>
            {value
              ? label || initialLabel || ar.common.select
              : initialLabel || ar.common.select}
          </span>
          <ChevronDown size={15} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog" aria-describedby={undefined}>
          <div className="dialog-head">
            <Dialog.Title className="dialog-title">
              {ar.common.select}
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button
                type="button"
                className="icon"
                aria-label={ar.common.close}
              >
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>
          <div className="stack">
            <input
              className="input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={ar.common.search}
              aria-label={ar.common.search}
            />
            {allowNone ? (
              <Button
                type="button"
                onClick={() => {
                  onChange("");
                  setLabel("");
                  setOpen(false);
                }}
              >
                {ar.common.all}
              </Button>
            ) : null}
            <div className="stack gap-sm">
              {visible.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    const text = [item.code, item.name]
                      .filter(Boolean)
                      .join(" · ");
                    setLabel(text);
                    onChange(item.id, text);
                    setOpen(false);
                  }}
                >
                  {item.code ? <bdi className="code">{item.code}</bdi> : null}
                  {item.name}
                  {value === item.id ? <Check size={15} /> : null}
                </Button>
              ))}
            </div>
            {error ? (
              <p role="alert" className="error-message">
                {error}
              </p>
            ) : null}
            {!busy && !visible.length ? (
              <p className="muted">{ar.common.empty}</p>
            ) : null}
            {next ? (
              <Button
                type="button"
                pending={busy}
                onClick={() => void fetchOptions(next)}
              >
                {ar.common.more}
              </Button>
            ) : busy ? (
              <div className="lookup-skeleton" aria-busy="true">
                <span className="skeleton" />
                <span className="skeleton" />
                <span className="skeleton" />
              </div>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Modal({
  title,
  trigger,
  children,
  wide = false,
  open,
  onOpenChange,
  className = "",
}: {
  title: string;
  trigger?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {trigger ? <Dialog.Trigger asChild>{trigger}</Dialog.Trigger> : null}
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          aria-describedby={undefined}
          className={`dialog ${wide ? "wide-dialog" : ""} ${className}`}
        >
          <div className="dialog-head">
            <Dialog.Title className="dialog-title">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button
                type="button"
                className="icon"
                aria-label={ar.common.close}
              >
                <X size={18} />
              </Button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function DateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const digits = useDigits();
  const [open, setOpen] = useState(false),
    [month, setMonth] = useState(
      () => new Date(value ? `${value}T12:00:00` : Date.now()),
    );
  const year = month.getFullYear(),
    m = month.getMonth(),
    first = new Date(year, m, 1).getDay(),
    days = new Date(year, m + 1, 0).getDate();
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat("ar-SA", { weekday: "short" }).format(
      new Date(2024, 0, 7 + i),
    ),
  );
  return (
    <div>
      <button
        type="button"
        className="select-trigger"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <bdi>{value || ar.common.date}</bdi>
        <CalendarDays size={16} />
      </button>
      {open ? (
        <div className="calendar">
          <div className="row between">
            <Button
              type="button"
              className="icon small"
              aria-label={ar.common.previous}
              onClick={() => setMonth(new Date(year, m - 1, 1))}
            >
              <ChevronRight size={16} />
            </Button>
            <span>
              {new Intl.DateTimeFormat(
                digits
                  ? "ar-SA-u-ca-gregory-nu-arab"
                  : "ar-SA-u-ca-gregory-nu-latn",
                { month: "long", year: "numeric" },
              ).format(month)}
            </span>
            <Button
              type="button"
              className="icon small"
              aria-label={ar.common.next}
              onClick={() => setMonth(new Date(year, m + 1, 1))}
            >
              <ChevronLeft size={16} />
            </Button>
          </div>
          <div className="calendar-grid">
            {weekdays.map((d) => (
              <span key={d} className="day-name">
                {d}
              </span>
            ))}
            {Array.from({ length: first }, (_, i) => (
              <span key={`e${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const date = `${year}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
              return (
                <button
                  type="button"
                  className={value === date ? "chosen" : ""}
                  key={i}
                  aria-pressed={value === date}
                  onClick={() => {
                    onChange(date);
                    setOpen(false);
                  }}
                >
                  {number(i + 1, digits, 0)}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
export function FilePicker({
  accept,
  onChange,
}: {
  accept: string;
  onChange: (file: File | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null),
    [name, setName] = useState("");
  return (
    <div className="row">
      <input
        ref={ref}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0] || null;
          setName(file?.name || "");
          onChange(file);
        }}
      />
      <Button type="button" onClick={() => ref.current?.click()}>
        {ar.files.choose}
      </Button>
      <span className="muted">{name || ar.files.none}</span>
    </div>
  );
}
