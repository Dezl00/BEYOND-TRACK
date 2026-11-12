"use client";
import { useLanguage } from "@/components/language-context";
import Link from "next/link";

export default function BoqTabs({
  current,
  project,
  canImport,
  canUnits,
  mains,
  seconds,
}: {
  current: string;
  project?: string;
  canImport: boolean;
  canUnits: boolean;
  mains?: string[];
  seconds?: string[];
}) {
  const { m: msg } = useLanguage();
  
  const tabs = [
    { key: "boq", label: msg.nav.boq, path: "/boq" },
    { key: "materials", label: msg.boq.materials, path: "/materials" },
    ...(canUnits
      ? [{ key: "units", label: msg.boq.units, path: "/units" }]
      : []),
    ...(canImport
      ? [{ key: "import", label: msg.common.import, path: "/boq/import" }]
      : []),
  ];
  function href(tab: (typeof tabs)[number]) {
    const params = new URLSearchParams();
    if (project) params.set("project", project);
    if (["boq", "materials"].includes(tab.key)) {
      if (mains?.length) params.set("mains", mains.join(","));
      if (seconds?.length) params.set("seconds", seconds.join(","));
    }
    return params.size ? tab.path + "?" + params : tab.path;
  }
  return (
    <nav className="resource-tabs" aria-label={msg.nav.boq}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          prefetch
          href={href(tab)}
          className={current === tab.key ? "active" : ""}
          aria-current={current === tab.key ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
