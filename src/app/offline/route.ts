import { ar } from "@/messages/ar";
export const dynamic = "force-static";
export function GET() {
  return new Response(
    `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${ar.pwa.offline} | ${ar.brand}</title><style>:root{--bg:#fff;--text:#252a33;--primary:#1766c4;--on-primary:#fff}html,body{margin:0;min-block-size:100%;background:var(--bg);color:var(--text);font-family:'IBM Plex Sans Arabic','IBM Plex Sans',sans-serif}main{min-block-size:100svh;display:flex;align-items:center;justify-content:center;flex-direction:column;padding:24px;box-sizing:border-box;gap:24px;text-align:center}img{inline-size:54px;block-size:62px}h1{font-size:22px;font-weight:600;margin:0}a{padding:12px 28px;border-radius:12px;background:var(--primary);color:var(--on-primary);text-decoration:none;font-size:14px}a:focus-visible{outline:2px solid var(--primary);outline-offset:4px}</style><main><img src="/icon.svg" alt="${ar.company}" width="54" height="62"><h1>${ar.pwa.offline}</h1><a href="/">${ar.common.retry}</a></main></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=86400",
      },
    },
  );
}
