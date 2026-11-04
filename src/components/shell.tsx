"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  LayoutDashboard,
  Building2,
  Layers3,
  ClipboardList,
  Truck,
  PackageCheck,
  UsersRound,
  ContactRound,
  ShieldCheck,
  History,
  Settings2,
  Bell,
  Menu,
  LogOut,
  X,
  ChevronDown,
} from "lucide-react";
import { ar } from "@/messages/ar";
import { type Actor, can } from "@/lib/domain";
import { date } from "@/lib/format";
import { Brand } from "./common";
import { Button } from "./form-controls";
import LiveNotifications from "./live-notifications";
import { FormatContext } from "./format-context";
const Lookup = dynamic(() => import("./ui").then((module) => module.Lookup));
const Modal = dynamic(() => import("./ui").then((module) => module.Modal));
const links = [
  ["dashboard", LayoutDashboard, "requests.view"],
  ["projects", Building2, "projects.view"],
  ["boq", Layers3, "boq.view"],
  ["requests", ClipboardList, "requests.view"],
  ["technical", ShieldCheck, "technical.view"],
  ["finance", ContactRound, "finance.view"],
  ["procurement", Truck, "procurement.view"],
  ["receipts", PackageCheck, "receipts.view"],
  ["suppliers", ContactRound, "suppliers.view"],
  ["users", UsersRound, "users.view"],
  ["roles", ShieldCheck, "roles.view"],
  ["audit", History, "audit.view"],
  ["settings", Settings2, ""],
] as const;
export default function Shell({
  actor,
  children,
  projectName,
  digits,
}: {
  actor: Actor;
  children: React.ReactNode;
  projectName?: string;
  digits: number;
}) {
  const path = usePathname(),
    params = useSearchParams(),
    router = useRouter(),
    [mobile, setMobile] = useState(false),
    [projectPicker, setProjectPicker] = useState(false);
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
  async function logout() {
    try {
      const registration = await navigator.serviceWorker?.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
    } catch {}
    await fetch("/api/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    window.location.assign("/login");
  }
  const navigation = (
    <>
      <Brand />
      <nav className="nav" aria-label={ar.common.actions}>
        {links
          .filter(([, , perm]) => !perm || can(actor, perm))
          .filter(([key]) => !actor.force_password_change || key === "settings")
          .map(([key, Icon], i) => (
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
                className={
                  path === `/${key}` || path.startsWith(`/${key}/`)
                    ? "active"
                    : ""
                }
                href={
                  actor.force_password_change
                    ? "/settings/security"
                    : `/${key}${project && ["dashboard", "projects", "boq", "requests", "procurement", "receipts"].includes(key) ? `?project=${project}` : ""}`
                }
                onClick={() => setMobile(false)}
              >
                <Icon size={19} strokeWidth={1.6} />
                {ar.nav[key]}
              </Link>
            </div>
          ))}
      </nav>
      <div className="sidebar-foot">
        <div className="profile">
          <div className="avatar">{actor.name.slice(0, 1)}</div>
          <div>
            <div className="profile-name">{actor.name}</div>
            <div className="profile-role">
              {actor.is_owner ? ar.auth.owner : actor.role_name}
            </div>
          </div>
        </div>
        <Button className="full link" onClick={() => void logout()}>
          <LogOut size={17} />
          {ar.common.logout}
        </Button>
      </div>
    </>
  );
  return (
    <FormatContext.Provider value={digits}>
      <div className="shell">
        <aside className="sidebar">{navigation}</aside>
        <div className="workspace">
          <header className="topbar">
            <div className="row">
              <Button
                className="icon mobile-only"
                aria-label={ar.common.expand}
                onClick={() => setMobile(true)}
              >
                <Menu size={20} />
              </Button>
              {mobile ? (
                <Modal
                  open
                  onOpenChange={setMobile}
                  title={ar.common.actions}
                  className="mobile-drawer"
                >
                  <aside className="sidebar mobile-nav">{navigation}</aside>
                </Modal>
              ) : null}
              {!actor.force_password_change && can(actor, "projects.view") ? (
                <div className="context-select">
                  <div className="topbar-label">{ar.common.project}</div>
                  {projectPicker ? (
                    <Lookup
                      defaultOpen
                      resource="projects"
                      value={project}
                      initialLabel={projectName || ar.common.allProjects}
                      allowNone
                      onChange={(value) => {
                        const next = new URLSearchParams(params.toString());
                        next.delete("cursor");
                        if (value) next.set("project", value);
                        else next.delete("project");
                        router.push(`${path}?${next}`);
                      }}
                    />
                  ) : (
                    <Button
                      className="select-trigger"
                      onClick={() => setProjectPicker(true)}
                    >
                      <span>{projectName || ar.common.allProjects}</span>
                      <ChevronDown size={15} />
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
            <div className="topbar-actions">
              <span className="topbar-label topbar-date">
                {date(new Date(), digits)}
              </span>
              {!actor.force_password_change ? <LiveNotifications /> : null}
              <Link
                href="/settings/security"
                className="avatar"
                aria-label={ar.settings.profile}
              >
                {actor.name.slice(0, 1)}
              </Link>
            </div>
          </header>
          <main className="main">{children}</main>
        </div>
      </div>
    </FormatContext.Provider>
  );
}
