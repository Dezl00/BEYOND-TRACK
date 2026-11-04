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
  Menu,
} from "lucide-react";
import { ar } from "@/messages/ar";
import { type Actor, can } from "@/lib/domain";
import { date } from "@/lib/format";
import { Brand } from "./common";
import { Button } from "./form-controls";
import LiveNotifications from "./live-notifications";
import { Lookup } from "./dropdown";
import { FormatContext } from "./format-context";
import AccountMenu, { LogoutButton } from "./account-menu";
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
    router = useRouter(),
    [mobile, setMobile] = useState(false);
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
        <LogoutButton />
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
                  <Lookup
                    resource="projects"
                    value={
                      project ||
                      (projectChoices.length === 1 ? projectChoices[0].id : "")
                    }
                    initialLabel={
                      projectName ||
                      (projectChoices.length === 1
                        ? projectChoices[0].name
                        : undefined)
                    }
                    allowNone={projectChoices.length !== 1}
                    allLabel={ar.common.allProjects}
                    onChange={(value) => {
                      const next = new URLSearchParams(params.toString());
                      next.delete("cursor");
                      if (value) next.set("project", value);
                      else next.delete("project");
                      router.push(path + "?" + next.toString(), {
                        scroll: false,
                      });
                    }}
                  />
                </div>
              ) : null}
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
      </div>
    </FormatContext.Provider>
  );
}
