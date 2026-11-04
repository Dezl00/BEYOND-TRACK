import { Suspense } from "react";
import LoginForm from "@/components/login-form";
import LoginShowcase from "@/components/login-showcase";
import LoginEntry from "@/components/login-entry";
export default function LoginPage() {
  return (
    <main className="login-page">
      <LoginEntry>
        <div className="login-mobile-band" aria-hidden="true" />
        <div className="login-frame">
          <section className="login-form-panel">
            <Suspense>
              <LoginForm />
            </Suspense>
          </section>
          <LoginShowcase />
        </div>
      </LoginEntry>
    </main>
  );
}
