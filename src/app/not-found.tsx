import Link from "next/link";
import { ar } from "@/messages/ar";
export default function NotFound() {
  return (
    <main className="empty">
      <h1>{ar.errors.notFound}</h1>
      <Link className="btn" href="/dashboard">
        {ar.common.back}
      </Link>
    </main>
  );
}
