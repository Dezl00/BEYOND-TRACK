"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ar } from "@/messages/ar";

export default function Breadcrumbs({ title }: { title: string }) {
  const path = usePathname(),
    params = useSearchParams();
  const parts = path.split("/").filter(Boolean);
  const project = params.get("project");
  const href = (value: string) =>
    value + (project ? `?project=${project}` : "");
  const parents: { label: string; href: string }[] = [];
  if (parts[0] !== "dashboard")
    parents.push({ label: ar.nav.dashboard, href: href("/dashboard") });
  if (parts[0] === "materials" || parts[0] === "units") {
    parents.push({ label: ar.nav.boq, href: href("/boq") });
  } else if (parts.length > 1) {
    const key = parts[0] as keyof typeof ar.nav;
    if (ar.nav[key])
      parents.push({ label: ar.nav[key], href: href(`/${parts[0]}`) });
    if (parts[0] === "requests" && parts.length > 2)
      parents.push({
        label: ar.requests.detail,
        href: href(`/requests/${parts[1]}`),
      });
  }
  return (
    <nav className="breadcrumbs" aria-label={ar.common.breadcrumbs}>
      <ol>
        {parents.map((parent) => (
          <li key={parent.href}>
            <Link href={parent.href}>{parent.label}</Link>
            <ChevronLeft size={11} aria-hidden="true" />
          </li>
        ))}
        <li aria-current="page">
          <h1>{title}</h1>
        </li>
      </ol>
    </nav>
  );
}
