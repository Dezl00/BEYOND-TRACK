"use client";
import { useLanguage } from "@/components/language-context";
import { browserLanguage } from "@/messages/catalog";

import Link from "next/link";
import { useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronLeft, LogOut, Settings2 } from "lucide-react";

import type { Actor } from "@/lib/domain";
import { Button, Message, Modal } from "./ui";

async function logout() {
  const { m: msg } = browserLanguage();
  
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!response.ok) throw new Error(msg.common.failed);
  // Revoke the session before best-effort device cleanup.
  try {
    const registration = await navigator.serviceWorker?.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) await subscription.unsubscribe();
  } catch {}
  window.location.assign("/login");
}
function LogoutDialog({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (value: boolean) => void;
}) {
  const { m: msg } = useLanguage();
  
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={msg.settings.logoutConfirm}
      open={open}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          setError("");
        }
      }}
    >
      <div className="stack">
        <div className="confirmation-icon">
          <LogOut size={25} />
        </div>
        <Message error={error} />
        <div className="confirmation-actions">
          <Button type="button" disabled={busy} onClick={() => setOpen(false)}>
            {msg.common.cancel}
          </Button>
          <Button
            type="button"
            intent="red"
            pending={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await logout();
              } catch (error) {
                setError((error as Error).message);
                setBusy(false);
              }
            }}
          >
            <LogOut size={16} />
            {msg.common.logout}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
export function LogoutButton() {
  const { m: msg } = useLanguage();
  
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        intent="red"
        className="full logout-button"
        onClick={() => setOpen(true)}
      >
        <LogOut size={17} />
        {msg.common.logout}
      </Button>
      <LogoutDialog open={open} setOpen={setOpen} />
    </>
  );
}
export default function AccountMenu({
  actor,
}: {
  actor: Pick<
    Actor,
    "name" | "is_owner" | "role_name" | "force_password_change"
  >;
}) {
  const { m: msg, dir, role } = useLanguage();
  
  const [open, setOpen] = useState(false),
    [confirm, setConfirm] = useState(false);
  const first = useRef<HTMLAnchorElement>(null);
  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className="account-trigger"
            aria-label={msg.settings.profile}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <div className="profile">
              <div className="avatar">{actor.name.slice(0, 1)}</div>
              <div className="profile-text">
                <div className="profile-name">
                  <bdi>{actor.name}</bdi>
                </div>
                <div className="profile-role">
                  {actor.is_owner ? msg.auth.owner : role(actor.role_name)}
                </div>
              </div>
            </div>
            <ChevronLeft size={15} className="account-chevron" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            className="account-dropdown"
            side="bottom"
            align="end"
            sideOffset={12}
            collisionPadding={12}
            dir={dir}
            role="menu"
            aria-label={msg.settings.profile}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              first.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              if (confirm) event.preventDefault();
            }}
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                return;
              event.preventDefault();
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  '[role="menuitem"]',
                ),
              );
              const index = items.indexOf(
                document.activeElement as HTMLElement,
              );
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (index +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length;
              items[next]?.focus();
            }}
          >
            <Link
              ref={first}
              role="menuitem"
              href={
                actor.force_password_change ? "/settings/security" : "/settings"
              }
              onClick={() => setOpen(false)}
            >
              <Settings2 size={17} />
              {msg.nav.settings}
            </Link>
            <button
              type="button"
              role="menuitem"
              className="logout-menu-item"
              onClick={() => {
                setOpen(false);
                setConfirm(true);
              }}
            >
              <LogOut size={17} />
              {msg.common.logout}
            </button>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <LogoutDialog open={confirm} setOpen={setConfirm} />
    </>
  );
}
