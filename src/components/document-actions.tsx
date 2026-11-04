"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer, ChevronRight } from "lucide-react";
import { Button } from "./form-controls";
import { ar } from "@/messages/ar";

export default function DocumentActions({
  back,
  sections,
}: {
  back: string;
  sections: string[];
}) {
  const [ready, setReady] = useState(false);
  const key = sections.join(",");
  useEffect(() => {
    let cancelled = false,
      checking = false;
    const observer = new MutationObserver(() => void check());
    async function check() {
      if (
        checking ||
        !key
          .split(",")
          .every((section) =>
            document.querySelector(`[data-print-complete="${section}"]`),
          )
      )
        return;
      checking = true;
      const images = Array.from(
        document.querySelectorAll<HTMLImageElement>(".print-document img"),
      );
      await Promise.all([
        document.fonts?.ready,
        ...images.map((image) =>
          image.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                image.addEventListener("load", () => resolve(), { once: true });
                image.addEventListener("error", () => resolve(), {
                  once: true,
                });
              }),
        ),
      ]);
      if (!cancelled) setReady(true);
      observer.disconnect();
    }
    observer.observe(document.body, { childList: true, subtree: true });
    void check();
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [key]);
  return (
    <div className="document-actions no-print">
      <Link className="btn export-button" href={back}>
        <ChevronRight size={16} />
        {ar.common.back}
      </Link>
      <Button
        className="export-button"
        disabled={!ready}
        onClick={() => window.print()}
      >
        <Printer size={16} />
        {ar.common.print}
      </Button>
    </div>
  );
}
