"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface Member {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  created_at: string;
}

interface InviteResult {
  invite_url: string;
  token: string;
  expires_at: string;
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  team_leader: "Team Leader",
  member: "Member",
};

export default function TeamPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user?.role !== "team_leader" && user?.role !== "super_admin") {
      router.replace("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    fetchMembers();
  }, []);

  async function fetchMembers() {
    try {
      const data = await api<Member[]>("/api/team/members");
      setMembers(data);
    } catch {
      // ignore
    } finally {
      setLoadingMembers(false);
    }
  }

  async function handleGenerateInvite() {
    setInviting(true);
    try {
      const result = await api<InviteResult>("/api/team/invite", {
        method: "POST",
        body: JSON.stringify({ role: "member", expires_in_days: 7 }),
      });
      setInviteResult(result);
    } catch {
      // ignore
    } finally {
      setInviting(false);
    }
  }

  async function handleCopyLink() {
    if (!inviteResult) return;
    await navigator.clipboard.writeText(inviteResult.invite_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDeactivate(memberId: string) {
    if (!confirm("Deactivate this member? They will lose access to the workspace.")) return;
    setDeactivatingId(memberId);
    try {
      await api(`/api/team/members/${memberId}`, { method: "DELETE" });
      setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, is_active: false } : m));
    } catch {
      alert("Failed to deactivate member.");
    } finally {
      setDeactivatingId(null);
    }
  }

  if (loading || (user?.role !== "team_leader" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="page-frame py-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Team</h1>
          <p className="text-sm text-muted mt-0.5">{user?.org_name}</p>
        </div>
        <button
          onClick={handleGenerateInvite}
          disabled={inviting}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50 transition-colors"
        >
          {inviting ? "Generating…" : "Generate Invite Link"}
        </button>
      </div>

      {/* Invite link result */}
      {inviteResult && (
        <div className="mb-6 rounded-2xl border border-brand/30 bg-brand-soft p-5">
          <p className="text-sm font-medium text-ink mb-2">Invite link (expires in 7 days):</p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={inviteResult.invite_url}
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm font-mono text-muted"
            />
            <button
              onClick={handleCopyLink}
              className="shrink-0 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 transition-colors"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-xs text-muted mt-2">Share this link with the person you want to invite. They'll create their own password.</p>
        </div>
      )}

      {/* Members table */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted">Name</th>
              <th className="px-4 py-3 text-left font-medium text-muted">Email</th>
              <th className="px-4 py-3 text-left font-medium text-muted">Role</th>
              <th className="px-4 py-3 text-left font-medium text-muted">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted">Joined</th>
              <th className="px-4 py-3 text-right font-medium text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loadingMembers ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">Loading…</td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">No team members yet. Generate an invite link to add someone.</td>
              </tr>
            ) : members.map((m) => (
              <tr key={m.id} className="hover:bg-surface/50 transition-colors">
                <td className="px-4 py-3 font-medium text-ink">{m.name}</td>
                <td className="px-4 py-3 text-muted">{m.email}</td>
                <td className="px-4 py-3 text-muted">{ROLE_LABELS[m.role] ?? m.role}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${m.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {m.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted text-xs">
                  {new Date(m.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {m.is_active && m.id !== user?.user_id && (
                    <button
                      onClick={() => handleDeactivate(m.id)}
                      disabled={deactivatingId === m.id}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      {deactivatingId === m.id ? "…" : "Deactivate"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
