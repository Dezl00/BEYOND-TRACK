import { Suspense } from "react";
import LoginForm from "@/components/login-form";
export default function LoginPage() {
  return (
    <main className="login-page">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
