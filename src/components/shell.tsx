"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { ar } from "@/messages/ar";
import { type Actor, can } from "@/lib/domain";
import { date } from "@/lib/format";
import { Brand } from "./common";
import LiveNotifications from "./live-notifications";
import { FormatContext } from "./format-context";
import AccountMenu, { LogoutButton } from "./account-menu";
import {
  permittedNavigation,
  navigationHref,
  navigationKey,
} from "@/lib/navigation";
import { navigationIcons } from "./navigation-icons";
import ProjectSelector, { ProjectContext } from "./project-selector";
import MobileNavigation from "./mobile-navigation";
import { InstallApp } from "./pwa";
export default function Shell({
  actor,
  children,
  projectName,
  projectChoices = [],
  digits,
}: {
  actor: Actor;
  children: React.ReactNode;
  projectName?: string;
  projectChoices?: { id: string; name: string }[];
  digits: number;
}) {
  const path = usePathname(),
    params = useSearchParams(),
    router = useRouter();
  const project = params.get("project") || "";
  useEffect(() => {
    const timer = setInterval(() => {
      fetch("/api/auth/rotate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })
        .then((r) => {
          if (r.status === 401) window.location.assign("/login");
        })
        .catch(() => {});
    }, 5 * 60_000);
    return () => clearInterval(timer);
  }, []);
  const navigation = (
    <>
      <Brand />
      <nav className="nav" aria-label={ar.common.actions}>
        {permittedNavigation(actor).map(({ key }) => {
          const Icon = navigationIcons[key];
          const active = navigationKey(path) === key;
          return (
            <div key={key}>
              {key === "users" ? <div className="nav-divider" /> : null}
              <Link
                prefetch={false}
                onMouseEnter={(event) =>
                  router.prefetch(event.currentTarget.getAttribute("href")!)
                }
                onFocus={(event) =>
                  router.prefetch(event.currentTarget.getAttribute("href")!)
                }
                className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
                href={
                  actor.force_password_change
                    ? "/settings/security"
                    : navigationHref(key, project)
                }
              >
                <Icon size={19} strokeWidth={1.6} />
                {ar.nav[key]}
              </Link>
            </div>
          );
        })}
      </nav>
      <div className="sidebar-foot stack">
        <InstallApp />
        <LogoutButton />
      </div>
    </>
  );
  return (
    <ProjectContext.Provider
      value={{ name: projectName, choices: projectChoices }}
    >
      <FormatContext.Provider value={digits}>
        <div className="shell">
          <aside className="sidebar">{navigation}</aside>
          <div className="workspace">
            <header className="topbar">
              <div className="row topbar-context">
                {!actor.force_password_change && can(actor, "projects.view") ? (
                  <div className="context-select">
                    <ProjectSelector />
                  </div>
                ) : null}
                <Link
                  className="mobile-header-brand"
                  href={
                    actor.force_password_change
                      ? "/settings/security"
                      : navigationHref(
                          can(actor, "requests.view")
                            ? "dashboard"
                            : "settings",
                          project,
                        )
                  }
                  aria-label={ar.brand}
                >
                  <Brand />
                </Link>
              </div>
              <div className="topbar-actions">
                <span className="topbar-label topbar-date">
                  {date(new Date(), digits)}
                </span>
                {!actor.force_password_change ? <LiveNotifications /> : null}
                <AccountMenu actor={actor} />
              </div>
            </header>
            <main className="main">
              <div className="print-brand">
                <Brand />
              </div>
              {children}
            </main>
          </div>
          <MobileNavigation actor={actor} />
        </div>
      </FormatContext.Provider>
    </ProjectContext.Provider>
  );
}
