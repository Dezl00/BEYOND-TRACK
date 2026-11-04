import Link from "next/link";
import { ar } from "@/messages/ar";
export default function BoqTabs({
  current,
  project,
  canImport,
}: {
  current: string;
  project?: string;
  canImport: boolean;
}) {
  const tabs = [
    { key: "boq", label: ar.nav.boq, path: "/boq" },
    { key: "materials", label: ar.boq.materials, path: "/materials" },
    { key: "units", label: ar.boq.units, path: "/units" },
    ...(canImport
      ? [{ key: "import", label: ar.common.import, path: "/boq/import" }]
      : []),
  ];
  return (
    <nav className="resource-tabs" aria-label={ar.nav.boq}>
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          prefetch
          href={tab.path + (project ? `?project=${project}` : "")}
          className={current === tab.key ? "active" : ""}
          aria-current={current === tab.key ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
