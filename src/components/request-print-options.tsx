"use client";
import { useLanguage } from "@/components/language-context";

import { useState } from "react";
import Link from "next/link";
import { Printer, ArrowUpLeft } from "lucide-react";
import { Button, Checkbox, Modal, Message } from "./ui";

import {
  printSectionKeys,
  requestPrintSchema,
  type RequestPrintOptions,
} from "@/lib/reporting";

export default function RequestPrintOptions({
  id,
  canPrice,
}: {
  id: string;
  canPrice: boolean;
}) {
  const { m: msg } = useLanguage();
  
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<RequestPrintOptions>({
    materials: "1",
    receipts: "1",
    attachments: "0",
    timeline: "0",
    prices: "0",
    photos: "0",
  });
  const valid = requestPrintSchema.safeParse(options);
  const params = new URLSearchParams(options);
  function toggle(key: keyof RequestPrintOptions, active: boolean) {
    setOptions((current) => ({ ...current, [key]: active ? "1" : "0" }));
  }
  return (
    <Modal
      title={msg.printing.options}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button>
          <Printer size={16} />
          {msg.common.print}
        </Button>
      }
    >
      <div className="print-options-grid">
        {printSectionKeys.map((key) => (
          <Checkbox
            key={key}
            label={msg.printing[key]}
            checked={options[key] === "1"}
            onChange={(event) => toggle(key, event.target.checked)}
          />
        ))}
        {canPrice ? (
          <Checkbox
            label={msg.printing.prices}
            checked={options.prices === "1"}
            disabled={options.materials !== "1"}
            onChange={(event) => toggle("prices", event.target.checked)}
          />
        ) : null}
        <Checkbox
          label={msg.printing.photos}
          checked={options.photos === "1"}
          disabled={options.attachments !== "1"}
          onChange={(event) => toggle("photos", event.target.checked)}
        />
      </div>
      <Message error={!valid.success ? msg.printing.noSections : ""} />
      <div className="form-footer">
        <Button onClick={() => setOpen(false)}>{msg.common.cancel}</Button>
        {valid.success ? (
          <Link
            className="btn blue"
            href={`/requests/${id}/print?${params}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            <ArrowUpLeft size={16} />
            {msg.printing.preview}
          </Link>
        ) : (
          <Button disabled>{msg.printing.preview}</Button>
        )}
      </div>
    </Modal>
  );
}
