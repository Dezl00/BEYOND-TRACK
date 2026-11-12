"use client";
import { useLanguage } from "@/components/language-context";

import * as Popover from "@radix-ui/react-popover";
import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

import { number } from "@/lib/format";
import { useDigits } from "./format-context";

type Option = { value: string; label: string; disabled?: boolean };
type DropdownProps = {
  open: boolean;
  setOpen: (value: boolean) => void;
  label: string;
  placeholder?: string;
  q: string;
  setQ: (value: string) => void;
  options: Option[];
  selected: string[];
  choose: (option: Option) => void;
  multiple?: boolean;
  disabled?: boolean;
  busy?: boolean;
  error?: string;
  more?: () => void;
  clear?: () => void;
};
function Dropdown({
  open,
  setOpen,
  label,
  placeholder: placeholderInput,
  q,
  setQ,
  options,
  selected,
  choose,
  multiple,
  disabled,
  busy,
  error,
  more,
  clear,
}: DropdownProps) {
  const { m: msg, number, dir } = useLanguage();
  const placeholder = placeholderInput ?? msg.common.select;
  const digits = useDigits();
  const listId = useId(),
    search = useRef<HTMLInputElement>(null),
    [highlighted, setHighlighted] = useState(-1);
  useEffect(() => {
    setHighlighted(-1);
  }, [q, open]);
  function move(delta: number) {
    if (!options.length) return;
    let next = highlighted < 0 ? (delta < 0 ? 0 : -1) : highlighted;
    for (let i = 0; i < options.length; i++) {
      next = (next + delta + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    setHighlighted(next);
    document
      .getElementById(`${listId}-${next}`)
      ?.scrollIntoView({ block: "nearest" });
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen} modal={false}>
      <Popover.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="select-trigger dropdown-trigger"
          aria-label={label || placeholder}
          aria-haspopup="listbox"
          aria-expanded={open}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <span className={selected.length ? "" : "muted"}>
            {label || placeholder}
          </span>
          {multiple && selected.length ? (
            <bdi className="selection-count">
              {number(selected.length, digits, 0)}
            </bdi>
          ) : null}
          <ChevronDown size={15} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="lookup-dropdown"
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          role="presentation"
          dir={dir}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            search.current?.focus();
          }}
        >
          <div className="dropdown-search">
            <Search size={16} />
            <input
              ref={search}
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={msg.common.search}
              aria-label={msg.common.search}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listId}
              aria-activedescendant={
                highlighted >= 0 ? `${listId}-${highlighted}` : undefined
              }
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  move(event.key === "ArrowDown" ? 1 : -1);
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  const option = options[highlighted];
                  if (option && !option.disabled) choose(option);
                }
              }}
            />
            {q ? (
              <button
                type="button"
                className="dropdown-clear"
                aria-label={msg.common.reset}
                onClick={() => {
                  setQ("");
                  search.current?.focus();
                }}
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
          <div
            className="dropdown-options"
            id={listId}
            role="listbox"
            aria-label={placeholder}
            aria-multiselectable={multiple || undefined}
            aria-busy={busy || undefined}
          >
            {options.map((option, index) => (
              <button
                type="button"
                tabIndex={-1}
                role="option"
                id={`${listId}-${index}`}
                key={option.value}
                disabled={option.disabled}
                aria-selected={selected.includes(option.value)}
                className={`dropdown-option ${highlighted === index ? "highlighted" : ""}`}
                onPointerMove={() => setHighlighted(index)}
                onClick={() => choose(option)}
              >
                <span>{option.label}</span>
                <span className="option-check">
                  {selected.includes(option.value) ? <Check size={15} /> : null}
                </span>
              </button>
            ))}
            {!options.length && busy ? (
              <div className="dropdown-placeholder" aria-hidden="true">
                <span className="skeleton" />
                <span className="skeleton" />
                <span className="skeleton" />
              </div>
            ) : !options.length ? (
              <div className="dropdown-empty">{msg.common.empty}</div>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="error-message dropdown-message">
              {error}
            </p>
          ) : null}
          {more || clear ? (
            <div className="dropdown-footer">
              {clear && selected.length ? (
                <button type="button" onClick={clear}>
                  {msg.common.clearSelection}
                </button>
              ) : null}
              {more ? (
                <button type="button" disabled={busy} onClick={more}>
                  {msg.common.more}
                </button>
              ) : null}
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function SelectBox({
  value,
  onChange,
  options,
  placeholder: placeholderInput,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const { m: msg } = useLanguage();
  const placeholder = placeholderInput ?? msg.common.select;
  const [open, setOpen] = useState(false),
    [q, setQ] = useState("");
  const visible = options.filter((option) =>
    option.label
      .toLocaleLowerCase("ar")
      .includes(q.trim().toLocaleLowerCase("ar")),
  );
  return (
    <Dropdown
      open={open}
      setOpen={setOpen}
      label={
        options.find((option) => option.value === value)?.label || placeholder
      }
      placeholder={placeholder}
      q={q}
      setQ={setQ}
      options={visible}
      selected={[value]}
      disabled={disabled}
      choose={(option) => {
        onChange(option.value);
        setOpen(false);
      }}
    />
  );
}

type Item = {
  id: string;
  name: string;
  code?: string;
  active?: boolean;
  archived?: boolean;
};
type Page = { items: Item[]; next: string | null };
const cache = new Map<string, { page: Page; at: number }>();
type RemoteProps = {
  mains?: string;
  seconds?: string;
  resource: string;
  values: string[];
  onChange: (values: string[], labels: Record<string, string>) => void;
  project?: string;
  initialLabels?: Record<string, string>;
  placeholder?: string;
  allowNone?: boolean;
  allLabel?: string;
  onlyLevel?: number;
  defaultOpen?: boolean;
  multiple?: boolean;
  includeInactive?: boolean;
  disabled?: boolean;
};
function RemoteDropdown({
  resource,
  values,
  onChange,
  project,
  initialLabels = {},
  placeholder: placeholderInput,
  allowNone = false,
  allLabel: allLabelInput,
  onlyLevel,
  mains,
  seconds,
  defaultOpen = false,
  multiple = false,
  includeInactive = false,
  disabled,
}: RemoteProps) {
  const { m: msg,unit,role,locale } = useLanguage();
  const displayName=(value:string)=>resource==="units"?unit(value):resource==="roles"?role(value):value;
  const placeholder = placeholderInput ?? msg.common.select;
  const allLabel = allLabelInput ?? msg.common.all;
  const [open, setOpen] = useState(defaultOpen),
    [q, setQ] = useState(""),
    [page, setPage] = useState<Page>({ items: [], next: null }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [labels, setLabels] = useState<Record<string, string>>(initialLabels);
  const controller = useRef<AbortController | null>(null),
    sequence = useRef(0);
  const params = new URLSearchParams({
    resource,
    q,
    ...(project ? { project } : {}),
    ...(mains ? { mains } : {}),
    ...(seconds ? { seconds } : {}),
    ...(onlyLevel ? { level: String(onlyLevel) } : {}),
    ...(!includeInactive ? { selectable: "1" } : {}),
  });
  const key = params.toString();
  const cacheKey=locale+":"+key;
  useEffect(() => {
    const invalidate = () => {
      cache.clear();
      if (open) void load();
    };
    window.addEventListener("siteflow-update", invalidate);
    return () => window.removeEventListener("siteflow-update", invalidate);
  }, [open, key, locale]);
  async function load(cursor?: string) {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    const token = ++sequence.current;
    setBusy(true);
    try {
      const query = new URLSearchParams(key);
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/options?${query}`, {
        signal: abort.signal,
      });
      const data: Page & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || msg.common.failed);
      if (token !== sequence.current) return;
      setPage((previous) => ({
        items: cursor
          ? [
              ...previous.items,
              ...data.items.filter(
                (item) => !previous.items.some((old) => old.id === item.id),
              ),
            ]
          : data.items,
        next: data.next,
      }));
      setLabels((previous) => ({
        ...previous,
        ...Object.fromEntries(
          data.items.map((item) => [
            item.id,
            [item.code, displayName(item.name)].filter(Boolean).join(" · "),
          ]),
        ),
      }));
      if (!cursor) {
        if (cache.size >= 50) cache.delete(cache.keys().next().value!);
        cache.set(cacheKey, { page: data, at: Date.now() });
      }
      setError("");
    } catch (e) {
      if ((e as Error).name !== "AbortError" && token === sequence.current)
        setError((e as Error).message);
    } finally {
      if (token === sequence.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!open) return;
    const saved = cache.get(cacheKey);
    setPage(saved?.page || { items: [], next: null });
    if (saved && Date.now() - saved.at < 15_000) {
      setBusy(false);
      setLabels((previous) => ({
        ...previous,
        ...Object.fromEntries(
          saved.page.items.map((item) => [
            item.id,
            [item.code, displayName(item.name)].filter(Boolean).join(" · "),
          ]),
        ),
      }));
      return;
    }
    const timer = setTimeout(() => void load(), q ? 160 : 0);
    return () => {
      clearTimeout(timer);
      sequence.current++;
      controller.current?.abort();
    };
  }, [open, key, locale]);
  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );
  const options: Option[] = [
    ...(allowNone ? [{ value: "", label: allLabel }] : []),
    ...page.items.map((item) => ({
      value: item.id,
      label: [item.code, displayName(item.name)].filter(Boolean).join(" · "),
    })),
  ];
  const label = values.length
    ? values
        .map((id) => labels[id] || initialLabels[id] || msg.common.select)
        .join(locale==="en"?", ":"، ")
    : allowNone
      ? allLabel
      : placeholder;
  return (
    <Dropdown
      open={open}
      setOpen={setOpen}
      label={label}
      placeholder={placeholder}
      q={q}
      setQ={setQ}
      options={options}
      selected={values.length ? values : allowNone ? [""] : []}
      multiple={multiple}
      disabled={disabled}
      busy={busy}
      error={error}
      more={page.next ? () => void load(page.next!) : undefined}
      clear={multiple ? () => onChange([], labels) : undefined}
      choose={(option) => {
        const nextLabels = { ...labels, [option.value]: option.label };
        setLabels(nextLabels);
        const next = multiple
          ? values.includes(option.value)
            ? values.filter((id) => id !== option.value)
            : [...values, option.value]
          : option.value
            ? [option.value]
            : [];
        onChange(next, nextLabels);
        if (!multiple) setOpen(false);
      }}
    />
  );
}
type LookupProps = {
  resource: string;
  value: string;
  onChange: (value: string, label?: string) => void;
  project?: string;
  initialLabel?: string;
  allowNone?: boolean;
  allLabel?: string;
  onlyLevel?: number;
  defaultOpen?: boolean;
  includeInactive?: boolean;
  disabled?: boolean;
};
export function Lookup({
  value,
  onChange,
  initialLabel,
  ...props
}: LookupProps) {
  return (
    <RemoteDropdown
      {...props}
      values={value ? [value] : []}
      initialLabels={value && initialLabel ? { [value]: initialLabel } : {}}
      onChange={(values, labels) =>
        onChange(values[0] || "", labels[values[0]])
      }
    />
  );
}
export function MultiLookup(props: Omit<RemoteProps, "multiple">) {
  return <RemoteDropdown {...props} multiple />;
}
