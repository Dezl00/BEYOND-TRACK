"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Actor } from "@/lib/domain";
import { can } from "@/lib/domain";
import {
  permittedNavigation,
  mobileNavigation,
  navigationHref,
} from "@/lib/navigation";
import { ar } from "@/messages/ar";
import { navigationIcons } from "./navigation-icons";
import { LogoutButton } from "./account-menu";
import ProjectSelector from "./project-selector";
import { InstallApp } from "./pwa";
export default function MoreNavigation({ actor }: { actor: Actor }) {
  const params = useSearchParams(),
    project = params.get("project") || "";
  const primary = mobileNavigation(actor);
  const items = permittedNavigation(actor).filter(
    (item) => !primary.some((key) => key === item.key),
  );
  return (
    <div className="more-navigation stack">
      <div className="more-grid">
        {items.map(({ key }) => {
          const Icon = navigationIcons[key];
          return (
            <Link key={key} href={navigationHref(key, project)} prefetch>
              <span>
                <Icon size={23} strokeWidth={1.7} />
              </span>
              {ar.nav[key]}
            </Link>
          );
        })}
      </div>
      <div className="more-tools stack">
        <InstallApp />
        {can(actor, "projects.view") ? (
          <div className="more-project">
            <span>{ar.common.project}</span>
            <ProjectSelector />
          </div>
        ) : null}
        <LogoutButton />
      </div>
    </div>
  );
}
