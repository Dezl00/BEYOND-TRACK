import { requestLanguage } from "@/server/language";
import Link from "next/link";

export default async function NotFound() {
  const { m: msg } = await requestLanguage();
  
  return (
    <main className="empty">
      <h1>{msg.errors.notFound}</h1>
      <Link className="btn" href="/dashboard">
        {msg.common.back}
      </Link>
    </main>
  );
}
