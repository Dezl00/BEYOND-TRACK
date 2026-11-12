"use client";
import { useLanguage } from "@/components/language-context";

import { useState, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Popover from "@radix-ui/react-popover";
import { ChevronLeft, ChevronRight, X, CalendarDays } from "lucide-react";

import { useDigits } from "./format-context";
import { number } from "@/lib/format";
import { Button } from "./form-controls";
export { Button, Field, Checkbox, Message, command } from "./form-controls";
export { SelectBox, Lookup, MultiLookup } from "./dropdown";
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
  const { m: msg } = useLanguage();
  
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
                aria-label={msg.common.close}
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
  const { m: msg, number, dir, intl } = useLanguage();
  
  const digits = useDigits();
  const [open, setOpen] = useState(false),
    [month, setMonth] = useState(
      () => new Date(value ? `${value}T12:00:00` : Date.now()),
    );
  const year = month.getFullYear(),
    monthIndex = month.getMonth(),
    first = new Date(year, monthIndex, 1).getDay(),
    days = new Date(year, monthIndex + 1, 0).getDate();
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(intl(), { weekday: "short" }).format(
      new Date(2024, 0, 7 + i),
    ),
  );
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className="select-trigger"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          <bdi>{value || msg.common.date}</bdi>
          <CalendarDays size={16} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="calendar calendar-popover"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          dir={dir}
        >
          <div className="row between">
            <Button
              type="button"
              className="icon small"
              aria-label={msg.common.previous}
              onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
            >
              <ChevronRight size={16} />
            </Button>
            <span>
              {new Intl.DateTimeFormat(
                intl(digits),
                { month: "long", year: "numeric" },
              ).format(month)}
            </span>
            <Button
              type="button"
              className="icon small"
              aria-label={msg.common.next}
              onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
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
              const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
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
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function FilePicker({
  accept,
  onChange,
}: {
  accept: string;
  onChange: (file: File | null) => void;
}) {
  const { m: msg } = useLanguage();
  
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
        {msg.files.choose}
      </Button>
      <span className="muted">{name || msg.files.none}</span>
    </div>
  );
}
