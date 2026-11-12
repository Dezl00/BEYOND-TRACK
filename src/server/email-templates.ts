import { date, decimalText, requestCode } from "@/lib/format";
import { notificationOrigin } from "@/lib/request-links";
import { ar } from "@/messages/ar";

function escape(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
const blue = "#293fd0";

function frame(
  title: string,
  body: string,
  preheader: string,
  requestNumber?: string,
) {
  return `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(title)}</title>
<style>@media(max-width:480px){.mail-body{padding:24px 16px!important}.mail-title{font-size:32px!important}.mail-hero{padding:26px 14px 30px!important}}</style></head>
<body dir="rtl" style="margin:0;padding:0;background:#f4f5f7;color:#232633;font:15px/1.65 Tahoma,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escape(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" dir="rtl"><tr><td align="center">
<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" bgcolor="#ffffff" cellspacing="0" cellpadding="0" dir="rtl" style="width:100%;max-width:600px;background:#ffffff;border-collapse:collapse;font-family:Tahoma,Arial,sans-serif">
<tr><td class="mail-hero" align="center" bgcolor="${blue}" style="background-color:${blue};padding:30px 20px 36px;text-align:center;color:#ffffff">
<img src="cid:beyond-track-logo-white" width="114" height="38" alt="بيوند تراك" style="display:block;margin:0 auto;border:0;color:#fff">
<h1 class="mail-title" style="margin:26px 0 2px;font:700 38px/1.35 Tahoma,Arial,sans-serif;color:#ffffff">${escape(title)}</h1>
${requestNumber ? `<p style="margin:0;color:#ffffff;font:500 22px/1.5 Arial,Tahoma,sans-serif;letter-spacing:1px"><span dir="ltr">${escape(requestNumber)}</span></p>` : ""}</td></tr>
<tr><td class="mail-body" align="right" dir="rtl" bgcolor="#ffffff" style="padding:30px 32px 26px;background:#ffffff;text-align:right;overflow-wrap:anywhere">${body}</td></tr>
<tr><td align="center" bgcolor="#ffffff" style="padding:21px 14px 24px;border-top:1px solid #e5e7ec;text-align:center;background:#ffffff">
<img src="cid:beyond-track-logo" width="102" height="34" alt="بيوند تراك" style="display:block;margin:0 auto;border:0">
<p style="margin:8px 0 0;font:14px/1.5 Arial,sans-serif"><a href="${notificationOrigin}" dir="ltr" style="color:${blue};text-decoration:underline">beyond-track.online</a></p></td></tr>
</table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

export function otpEmail(title: string, code: string) {
  return frame(
    title,
    `<div style="text-align:center"><p dir="ltr" style="margin:0;font:700 48px/1.2 Arial,sans-serif;letter-spacing:5px;color:#202b47;white-space:nowrap"><span dir="ltr">${escape(code)}</span></p>
<p style="margin:10px 0 0;color:#515563;font:15px/1.5 Tahoma,Arial,sans-serif">${escape(ar.email.otpExpiry)}</p></div>`,
    title,
  );
}
export type MailQuote = {
  supplier: string;
  expected_at: string;
  total: string;
  selected: boolean;
  approved: boolean;
};
export type MailRequest = {
  quotes?: MailQuote[];
  lastAction?: string | null;
  number: string;
  status: number;
  project: string;
  creator: string;
  created_at: Date | string;
  supplier: string | null;
  expected_at: string | null;
  notes: string;
};
export type MailLine = {
  code: string;
  name: string;
  unit: string;
  quantity: string;
  price: string | null;
  notes: string;
  accepted: string;
  damaged: string;
  rejected: string;
  returned: string;
};
export function requestEmail(
  request: MailRequest,
  lines: MailLine[],
  event: string,
  link: string,
  showPrices: boolean,
) {
  const field = (label: string, value: string) =>
    `<tr><td style="padding:4px 0;color:#536677;width:38%">${label}</td><td style="padding:4px 0">${escape(value)}</td></tr>`;
  const priced = showPrices && lines.some((l) => l.price != null);
  const header = (label: string) =>
    `<th align="right" style="padding:8px 5px;overflow-wrap:normal;word-break:normal;color:${blue}">${label}</th>`;
  const cell = (content: string) =>
    `<td style="padding:9px 5px;border-bottom:1px solid #e1eaf2;vertical-align:top">${content}</td>`;
  const items = lines
    .map((l) => {
      const receipt = [
        ["مقبول", l.accepted],
        ["تالف", l.damaged],
        ["مرفوض", l.rejected],
        ["مرتجع", l.returned],
      ]
        .filter(([, n]) => Number(n) > 0)
        .map(([label, n]) => label + " " + decimalText(n))
        .join(" · ");
      return (
        "<tr>" +
        cell(
          "<b>" +
            escape(l.name) +
            '</b><br><small dir="ltr">' +
            escape(l.code) +
            "</small>" +
            (l.notes ? "<br>" + escape(l.notes) : "") +
            (receipt ? "<br>" + escape(receipt) : ""),
        ) +
        cell(escape(decimalText(l.quantity))) +
        cell(escape(l.unit)) +
        (priced
          ? cell(l.price == null ? "—" : escape(decimalText(l.price)))
          : "") +
        "</tr>"
      );
    })
    .join("");
  const quotes = showPrices ? (request.quotes ?? []) : [];
  const quoteRows = quotes
    .map((quote) => {
      const label = quote.selected
        ? quote.approved
          ? "العرض المعتمد"
          : "العرض المرشح"
        : "";
      return (
        "<tr>" +
        cell(
          escape(quote.supplier) +
            (label ? "<br><small>" + label + "</small>" : ""),
        ) +
        cell(escape(date(quote.expected_at))) +
        cell(escape(decimalText(quote.total))) +
        "</tr>"
      );
    })
    .join("");
  const section = (title: string) =>
    `<h2 style="margin:0 0 10px;color:#232633;font:bold 18px/1.5 Tahoma,Arial,sans-serif">${title}</h2>`;
  const tableStyle =
    'width="100%" dir="rtl" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font:14px/1.6 Tahoma,Arial,sans-serif;text-align:right"';
  const state = ar.statuses[request.status];
  return frame(
    state,
    `${section("بيانات الطلب")}
<table role="presentation" ${tableStyle}>${field("المشروع", request.project)}${field("مقدّم الطلب", request.creator)}${field("تاريخ الإنشاء", date(request.created_at, 0, true))}${field("المورد", request.supplier || "لم يُحدّد بعد")}${field("التوريد المتوقع", request.expected_at ? date(request.expected_at) : "لم يُحدّد بعد")}</table>
${request.notes ? '<p style="margin:14px 0 0;white-space:pre-line"><strong>نطاق الاستخدام</strong><br>' + escape(request.notes) + "</p>" : ""}
${request.lastAction ? '<p style="margin:14px 0 0"><strong>آخر إجراء</strong><br>' + escape(request.lastAction) + "</p>" : ""}
${quotes.length ? '<div style="padding-top:22px">' + section("عروض الأسعار") + "<table " + tableStyle + '><thead><tr bgcolor="#f1f3fc">' + header("المورد") + header("موعد التوريد") + header("الإجمالي (ر.س)") + "</tr></thead><tbody>" + quoteRows + "</tbody></table></div>" : ""}
<div style="padding-top:22px">${section("بنود الطلب (" + lines.length + ")")}
<table ${tableStyle}><thead><tr bgcolor="#f1f3fc">${header("المادة")}${header("الكمية")}${header("الوحدة")}${priced ? header("سعر الوحدة (ر.س)") : ""}</tr></thead><tbody>${items}</tbody></table></div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding-top:28px">
<table role="presentation" cellspacing="0" cellpadding="0" align="center"><tr><td align="center" bgcolor="${blue}" style="background:${blue};border-radius:3px;mso-padding-alt:12px 32px"><a href="${escape(link)}" style="display:inline-block;padding:12px 32px;border-radius:3px;font:bold 15px/1.4 Tahoma,Arial,sans-serif;color:#ffffff;text-decoration:none">عرض الطلب ومتابعته</a></td></tr></table>
</td></tr></table>`,
    event + " · " + state + " · " + requestCode(request.number),
    requestCode(request.number),
  );
}
