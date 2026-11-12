"use client";
import { useLanguage } from "@/components/language-context";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type Actor } from "@/lib/domain";
import {
  mobileNavigation,
  navigationHref,
  navigationKey,
} from "@/lib/navigation";

import { navigationIcons } from "./navigation-icons";
export default function MobileNavigation({
  actor,
}: {
  actor: Pick<Actor, "permissions" | "is_owner" | "force_password_change">;
}) {
  const { m: msg } = useLanguage();
  
  const path = usePathname(),
    params = useSearchParams();
  if (actor.force_password_change) return null;
  const primary = mobileNavigation(actor),
    current = navigationKey(path),
    project = params.get("project") || "";
  const tabs = [...primary, "more"] as const;
  return (
    <nav
      className="mobile-bottom-nav no-print"
      aria-label={msg.mobile.navigation}
    >
      {tabs.map((key) => {
        const Icon = navigationIcons[key],
          active =
            key === "more"
              ? !primary.some((item) => item === current)
              : current === key;
        return (
          <Link
            key={key}
            href={navigationHref(key, project)}
            prefetch
            className={active ? "active" : ""}
            aria-current={active ? "page" : undefined}
          >
            <span className="mobile-nav-icon">
              <Icon size={22} strokeWidth={active ? 2 : 1.7} />
            </span>
            <span>{msg.mobile[key]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
