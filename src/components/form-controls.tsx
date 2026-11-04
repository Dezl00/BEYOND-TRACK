"use client";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { ar } from "@/messages/ar";
export function Button({
  children,
  pending = false,
  intent = "",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pending?: boolean;
  intent?: string;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || pending}
      aria-busy={pending || undefined}
      className={`btn ${intent} ${className}`}
    >
      {pending ? <LoaderCircle size={16} className="spin" /> : null}
      {children}
    </button>
  );
}
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Checkbox({
  label,
  checked,
  defaultChecked,
  onChange,
  disabled,
  id,
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [local, setLocal] = useState(!!defaultChecked);
  const active = checked ?? local;
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={active}
      disabled={disabled}
      className="toggle-control"
      onClick={() => {
        setLocal(!active);
        onChange?.({
          target: { checked: !active },
          currentTarget: { checked: !active },
        } as React.ChangeEvent<HTMLInputElement>);
      }}
    >
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span>{label}</span>
    </button>
  );
}
export function Message({
  error,
  success,
}: {
  error?: string;
  success?: string;
}) {
  return error ? (
    <p className="error-message" role="alert">
      {error}
    </p>
  ) : success ? (
    <p className="success-message" role="status">
      {success}
    </p>
  ) : null;
}
export async function command(name: string, data: unknown) {
  const r = await fetch("/api/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command: name, data }),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || ar.common.failed);
  window.dispatchEvent(new Event("siteflow-update"));
  return result as { id?: string; requestId?: string; redirect?: string };
}
