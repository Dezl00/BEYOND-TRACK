"use client";
import { ar } from "@/messages/ar";
import { Button } from "@/components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="empty">
      <h1>{ar.common.failed}</h1>
      <Button onClick={reset}>{ar.common.retry}</Button>
    </div>
  );
}
