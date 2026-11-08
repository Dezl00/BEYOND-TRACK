import PushSettings from "@/components/push-settings";
import RequestPurge from "@/components/request-purge";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageActor } from "@/server/page-auth";
import { requirePermission } from "@/server/access";
import { one, rows, sql } from "@/db";
import { ar } from "@/messages/ar";
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
  const sessionPage = page(sessions);
  return (
    <>
      <Heading
        title={
          tab === "appearance"
            ? ar.common.appearance
            : tab === "security"
              ? ar.common.security
              : tab === "notifications"
                ? ar.nav.notifications
                : ar.settings.system
        }
      />
      <div className="tabs">
        {[
          ["appearance", ar.common.appearance],
          ["security", ar.common.security],
          ["notifications", ar.nav.notifications],
          ...(can(a, "settings.edit") ? [["system", ar.settings.system]] : []),
        ]
          .filter(([key]) => !a.force_password_change || key === "security")
          .map(([key, label]) => (
            <Link
              key={key}
              className={tab === key ? "active" : ""}
              href={`/settings/${key}`}
            >
              {label}
            </Link>
          ))}
      </div>
      <div className="stack settings-narrow">
        {tab === "system" && a.is_owner ? (
          <RequestPurge email={a.email} />
        ) : null}
        {tab === "notifications" ? (
          <>
            <section className="panel panel-body">
              <PushSettings />
            </section>
            <section className="panel panel-body stack">
              <h2>{ar.whatsapp.title}</h2>
              <p>
                {whatsappAccount?.whatsapp_number ? (
                  <bdi dir="ltr" className="code">
                    {whatsappRecipient(
                      whatsappAccount.whatsapp_country_code,
                      whatsappAccount.whatsapp_number,
                    )}
                  </bdi>
                ) : (
                  ar.whatsapp.noNumber
                )}
              </p>
              <p className="muted">{ar.whatsapp.managedByAdmin}</p>
              <p>
                {!whatsappConfigured()
                  ? ar.whatsapp.unavailable
                  : !settings?.whatsapp_enabled
                    ? ar.whatsapp.systemDisabled
                    : !whatsappAccount?.whatsapp_enabled
                      ? ar.whatsapp.accountDisabled
                      : ar.whatsapp.ready}
              </p>
            </section>
          </>
        ) : null}
        {a.force_password_change ? (
          <p className="error-message">{ar.auth.requiredPassword}</p>
        ) : null}
        {tab === "system" ? (
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
                <h2>{ar.auth.changePassword}</h2>
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
                <h2>{ar.auth.sessions}</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{ar.auth.device}</th>
                      <th>{ar.auth.ip}</th>
                      <th>{ar.auth.expiry}</th>
                      <th>{ar.common.actions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionPage.items.map((s) => (
                      <tr key={s.id}>
                        <td className="wrap">
                          <bdi>{s.user_agent.slice(0, 120)}</bdi>
                          {s.id === a.session_id ? (
                            <span className="badge">{ar.auth.current}</span>
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
      </div>
    </>
  );
}
