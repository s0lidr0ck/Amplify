"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface InviteInfo {
  org_name: string;
  email: string | null;
  role: string;
}

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const { refresh } = useAuth();
  const router = useRouter();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;
    api<InviteInfo>(`/api/auth/invite-info/${token}`)
      .then(setInfo)
      .catch(() => setInfoError("Invite link is invalid or expired."));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await api("/api/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify({ token, name, password }),
      });
      await refresh();
      router.replace("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to accept invite.");
    } finally {
      setLoading(false);
    }
  }

  if (infoError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-3xl bg-surface border border-border/60 shadow-soft p-8 text-center">
          <h2 className="text-xl font-semibold text-ink mb-2">Invalid Invite</h2>
          <p className="text-sm text-muted">{infoError}</p>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand text-2xl font-bold text-white shadow-soft mb-4">
            A
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">You're invited!</h1>
          <p className="mt-1 text-sm text-muted text-center">
            Join <span className="font-medium text-ink">{info.org_name}</span> on Amplify
          </p>
        </div>

        <div className="rounded-3xl bg-surface border border-border/60 shadow-soft p-8">
          {info.email && (
            <p className="mb-4 text-sm text-muted">
              Invited as: <span className="font-medium text-ink">{info.email}</span>
            </p>
          )}

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-ink mb-1.5">
                Your name
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                placeholder="Jane Smith"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-ink mb-1.5">
                Create password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                placeholder="Min. 8 characters"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink mb-1.5">
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Setting up account…" : "Join workspace"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
