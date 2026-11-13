"use client";
import { useState } from "react";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    setBusy(false);
    if (res.ok) window.location.href = "/admin";
    else setError((await res.json().catch(() => ({}))).error ?? "login failed");
  };
  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-xl border border-neutral-300 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
      <h1 className="text-lg font-semibold">Mathdle · Question Factory</h1>
      <input className="w-full rounded border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-600" placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus required name="email" />
      <input className="w-full rounded border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-600" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required name="password" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button disabled={busy} className="w-full rounded bg-neutral-900 px-3 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
        Sign in
      </button>
    </form>
  );
}
