"use client";
import { useLanguage } from "@/components/language-context";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Checkbox, command, Message } from "./form-controls";
export default function ActivationSwitch({
  resource,
  id,
  active,
  disabled = false,
  name,
}: {
  resource: string;
  id: string;
  active: boolean;
  disabled?: boolean;
  name: string;
}) {
  const { m: msg } = useLanguage();
  
  const router = useRouter(),
    [value, setValue] = useState(active),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [, startTransition] = useTransition();
  useEffect(() => {
    setValue(active);
  }, [active]);
  async function toggle(next: boolean) {
    if (saving || disabled) return;
    const previous = value;
    setValue(next);
    setSaving(true);
    setError("");
    try {
      await command("activation", { resource, id, active: next });
      startTransition(() => router.refresh());
    } catch (e) {
      setValue(previous);
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="table-activation">
      <Checkbox
        label={`${value ? msg.common.disable : msg.common.enable} · ${name}`}
        hideLabel
        checked={value}
        disabled={disabled || saving}
        onChange={(event) => void toggle(event.target.checked)}
      />
      <Message error={error} />
    </div>
  );
}
