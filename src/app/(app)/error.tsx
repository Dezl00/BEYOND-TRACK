"use client";
import { useLanguage } from "@/components/language-context";


import { Button } from "@/components/ui";
export default function ErrorPage({ reset }: { reset: () => void }) {
  const { m: msg } = useLanguage();
  
  return (
    <div className="empty">
      <h1>{msg.common.failed}</h1>
      <Button onClick={reset}>{msg.common.retry}</Button>
    </div>
  );
}
