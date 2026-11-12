import { SlidersHorizontal, ShieldCheck, Bell, Settings2, ChevronLeft } from "lucide-react";
import { DisplayPreferences } from "@/components/display-preferences";
import { requestLanguage } from "@/server/language";
import PushSettings from "@/components/push-settings";
import RequestPurge from "@/components/request-purge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageActor } from "@/server/page-auth";
import { requirePermission } from "@/server/access";
import { one, rows, sql } from "@/db";

import { can } from "@/lib/domain";
import { date } from "@/lib/format";
import { Heading, Pagination } from "@/components/common";
import {
  PreferencesForm,
  SystemSettings,
  PasswordForm,
} from "@/components/settings-form";
import { Revoke } from "@/components/simple-actions";
import { decodeCursor, page } from "@/server/queries";
import { whatsappConfigured } from "@/server/whatsapp-gateway";
import { whatsappRecipient } from "@/lib/whatsapp-phone";
export default async function SettingsTab({
  params,
  searchParams,
}: {
  params: Promise<{ tab: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { m: msg, date } = await requestLanguage();
  
  const { tab } = await params;
  if (!["appearance", "security", "notifications", "system"].includes(tab))
    notFound();
  const a = await requirePageActor(tab === "security"),
    raw = await searchParams,
    c = decodeCursor(raw.cursor);
  if (tab === "system") requirePermission(a, "settings.edit");
  const [settings, policies, prefs, sessions, whatsappAccount] =
    await Promise.all([
      one<{
        otp_required: boolean;
        default_theme: number;
        digits: number;
        read_notification_days: number;
        whatsapp_enabled: boolean;
      }>(sql`SELECT * FROM settings WHERE id=1`),
      rows<{
        type: number;
        in_app: boolean;
        email: boolean;
        whatsapp: boolean;
        forced: boolean;
      }>(sql`SELECT * FROM notification_policy ORDER BY type`),
      rows<{
        type: number;
        in_app: boolean;
        email: boolean;
        whatsapp: boolean;
      }>(
        sql`SELECT * FROM notification_preferences WHERE user_id=${a.id} ORDER BY type`,
      ),
      tab === "security"
        ? rows<{
            id: string;
            ip: string;
            user_agent: string;
            created_at: Date;
            expires_at: Date;
          }>(
            sql`SELECT id,ip,user_agent,created_at,expires_at FROM sessions WHERE user_id=${a.id} AND expires_at>now() ${c ? sql`AND id>${c.id}::uuid` : sql``} ORDER BY id LIMIT 26`,
          )
        : Promise.resolve([]),
      tab === "notifications"
        ? one<{
            whatsapp_country_code: string;
            whatsapp_number: string | null;
            whatsapp_enabled: boolean;
          }>(
            sql`SELECT whatsapp_country_code,whatsapp_number,whatsapp_enabled FROM users WHERE id=${a.id}`,
          )
        : Promise.resolve(undefined),
    ]);
  const sections=[{key:"appearance",label:msg.common.appearance,hint:msg.interface.appearanceSummary,Icon:SlidersHorizontal},{key:"security",label:msg.common.security,hint:msg.interface.securitySummary,Icon:ShieldCheck},{key:"notifications",label:msg.nav.notifications,hint:msg.interface.notificationsSummary,Icon:Bell},...(can(a,"settings.edit")?[{key:"system",label:msg.settings.system,hint:msg.interface.systemSummary,Icon:Settings2}]:[])].filter(s=>!a.force_password_change||s.key==="security");
  const sessionPage = page(sessions);
  return (
    <>
      <Heading
        title={
          tab === "appearance"
            ? msg.common.appearance
            : tab === "security"
              ? msg.common.security
              : tab === "notifications"
                ? msg.nav.notifications
                : msg.settings.system
        }
      />
      <div className="settings-layout"><nav className="settings-rail" aria-label={msg.nav.settings}>{sections.map(({key,label,hint,Icon})=><Link key={key} href={"/settings/"+key} aria-current={tab===key?"page":undefined}><Icon size={19}/><span><strong>{label}</strong><small>{hint}</small></span><ChevronLeft className="rail-chevron" size={15}/></Link>)}</nav>
<section className="settings-content stack">
        {tab === "system" && a.is_owner ? (
          <RequestPurge email={a.email} />
        ) : null}
        {tab === "notifications" ? (
          <>
            <section className="panel panel-body">
              <PushSettings />
            </section>
            <section className="panel panel-body stack">
              <h2>{msg.whatsapp.title}</h2>
              <p>
                {whatsappAccount?.whatsapp_number ? (
                  <bdi dir="ltr" className="code">
                    {whatsappRecipient(
                      whatsappAccount.whatsapp_country_code,
                      whatsappAccount.whatsapp_number,
                    )}
                  </bdi>
                ) : (
                  msg.whatsapp.noNumber
                )}
              </p>
              <p className="muted">{msg.whatsapp.managedByAdmin}</p>
              <p>
                {!whatsappConfigured()
                  ? msg.whatsapp.unavailable
                  : !settings?.whatsapp_enabled
                    ? msg.whatsapp.systemDisabled
                    : !whatsappAccount?.whatsapp_enabled
                      ? msg.whatsapp.accountDisabled
                      : msg.whatsapp.ready}
              </p>
            </section>
          </>
        ) : null}
        {a.force_password_change ? (
          <p className="error-message">{msg.auth.requiredPassword}</p>
        ) : null}
        {tab === "appearance" ? <DisplayPreferences/> : tab === "system" ? (
          <section className="panel panel-body">
            <SystemSettings
              settings={settings!}
              policies={policies}
              owner={a.is_owner}
            />
          </section>
        ) : tab === "security" ? (
          <>
            <section className="panel">
              <div className="panel-heading">
                <h2>{msg.auth.changePassword}</h2>
              </div>
              <div className="panel-body">
                <PasswordForm />
              </div>
            </section>
            {!a.force_password_change ? (
              <section className="panel panel-body">
                <PreferencesForm
                  theme={a.theme}
                  otpEnabled={a.otp_enabled}
                  otpRequired={!!settings?.otp_required && !a.otp_exempt}
                  policies={policies}
                  prefs={prefs}
                  tab={tab}
                />
              </section>
            ) : null}
            <section className="panel">
              <div className="panel-heading">
                <h2>{msg.auth.sessions}</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{msg.auth.device}</th>
                      <th>{msg.auth.ip}</th>
                      <th>{msg.auth.expiry}</th>
                      <th>{msg.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionPage.items.map((s) => (
                      <tr key={s.id}>
                        <td className="wrap">
                          <bdi>{s.user_agent.slice(0, 120)}</bdi>
                          {s.id === a.session_id ? (
                            <span className="badge">{msg.auth.current}</span>
                          ) : null}
                        </td>
                        <td>
                          <bdi className="code">{s.ip}</bdi>
                        </td>
                        <td>{date(s.expires_at, settings?.digits, true)}</td>
                        <td>
                          <Revoke id={s.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                base="/settings/security"
                next={sessionPage.next}
                query={raw}
              />
            </section>
          </>
        ) : (
          <section className="panel panel-body">
            <PreferencesForm
              theme={a.theme}
              otpEnabled={a.otp_enabled}
              otpRequired={!!settings?.otp_required && !a.otp_exempt}
              policies={policies}
              prefs={prefs}
              tab={tab}
            />
          </section>
        )}
      </section></div>
    </>
  );
}
