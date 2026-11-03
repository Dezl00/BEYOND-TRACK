"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { ar } from "@/messages/ar";
import {
  loginSchema,
  otpSchema,
  resetSchema,
  resetPasswordSchema,
} from "@/lib/validation";
import { Button, Field, Checkbox, Message } from "./form-controls";
import { Brand } from "./common";
export default function LoginForm() {
  const params = useSearchParams(),
    reset = params.get("reset");
  const [mode, setMode] = useState(reset ? "reset" : "login"),
    [identifier, setIdentifier] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [remember, setRemember] = useState(false),
    [challenge, setChallenge] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      if (mode === "reset" && password !== confirmation)
        throw new Error(ar.errors.passwordMatch);
      const data =
        mode === "login"
          ? loginSchema.parse({ identifier, password, remember })
          : mode === "otp"
            ? otpSchema.parse({ challenge, code })
            : mode === "forgot"
              ? resetSchema.parse({ email: identifier })
              : resetPasswordSchema.parse({ token: reset, password });
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.challenge) {
        setChallenge(result.challenge);
        setMode("otp");
        setPassword("");
        setSuccess(ar.auth.otpSent);
      } else if (result.redirect) window.location.assign(result.redirect);
      else {
        setSuccess(result.message);
        if (mode === "reset") {
          setMode("login");
          setPassword("");
          history.replaceState(null, "", "/login");
        }
      }
    } catch (e) {
      setError(
        "issues" in (e as object) ? ar.errors.invalid : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-box">
      <Brand />
      <h1>
        {mode === "login"
          ? ar.auth.title
          : mode === "otp"
            ? ar.auth.otp
            : mode === "forgot"
              ? ar.auth.resetTitle
              : ar.auth.changePassword}
      </h1>
      <form onSubmit={submit} noValidate>
        <Message error={error} success={success} />
        {["login", "forgot"].includes(mode) ? (
          <Field label={mode === "login" ? ar.auth.identifier : ar.auth.email}>
            <input
              autoComplete="username"
              className="input numeric"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              type={mode === "forgot" ? "email" : "text"}
            />
          </Field>
        ) : null}
        {["login", "reset"].includes(mode) ? (
          <Field
            label={mode === "login" ? ar.auth.password : ar.auth.newPassword}
          >
            <input
              className="input numeric"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        ) : null}
        {mode === "reset" ? (
          <Field label={ar.auth.confirmPassword}>
            <input
              className="input numeric"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
        ) : null}
        {mode === "otp" ? (
          <Field label={ar.auth.otp}>
            <input
              className="input numeric"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        ) : null}
        {mode === "login" ? (
          <div className="row between" style={{ marginBlockEnd: 24 }}>
            <Checkbox
              label={ar.auth.remember}
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            <button
              className="btn link small"
              type="button"
              onClick={() => {
                setMode("forgot");
                setError("");
              }}
            >
              {ar.auth.forgot}
            </button>
          </div>
        ) : null}
        <Button className="full" intent="blue" pending={busy} type="submit">
          {mode === "login"
            ? ar.auth.login
            : mode === "otp"
              ? ar.auth.verify
              : mode === "forgot"
                ? ar.auth.sendReset
                : ar.auth.changePassword}
          <ArrowLeft size={17} />
        </Button>
      </form>
      {mode !== "login" ? (
        <div className="login-bottom">
          <Button
            className="link"
            onClick={() => {
              setMode("login");
              setError("");
              setSuccess("");
            }}
          >
            {ar.auth.returnLogin}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
