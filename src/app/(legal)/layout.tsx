import Link from "next/link";
import "./legal.css";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="legal-page" dir="rtl" lang="ar">
      <header><Link href="/login" dir="ltr">BEYOND TRACK</Link></header>
      <article>{children}</article>
      <footer>
        <nav aria-label="روابط المنصة">
          <Link href="/privacy">سياسة الخصوصية</Link>
          <Link href="/terms">الشروط والأحكام</Link>
          <Link href="/login">تسجيل الدخول</Link>
        </nav>
      </footer>
    </main>
  );
}
