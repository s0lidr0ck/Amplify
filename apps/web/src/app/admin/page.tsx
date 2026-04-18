"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  is_active: boolean;
  member_count: number;
  created_at: string;
}

interface CreateOrgResult {
  org_id: string;
  org_name: string;
  team_leader_id: string;
  team_leader_email: string;
  temp_password: string;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  // Create org form
  const [showForm, setShowForm] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [leaderName, setLeaderName] = useState("");
  const [leaderEmail, setLeaderEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<CreateOrgResult | null>(null);

  useEffect(() => {
    if (!loading && user?.role !== "super_admin") {
      router.replace("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    fetchOrgs();
  }, []);

  async function fetchOrgs() {
    try {
      const data = await api<OrgRow[]>("/api/admin/orgs");
      setOrgs(data);
    } catch {
      // ignore
    } finally {
      setLoadingOrgs(false);
    }
  }

  async function handleCreateOrg(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const result = await api<CreateOrgResult>("/api/admin/orgs", {
        method: "POST",
        body: JSON.stringify({
          org_name: orgName,
          leader_name: leaderName,
          leader_email: leaderEmail,
        }),
      });
      setCreateResult(result);
      setOrgName("");
      setLeaderName("");
      setLeaderEmail("");
      setShowForm(false);
      await fetchOrgs();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Failed to create organization");
    } finally {
      setCreating(false);
    }
  }

  if (loading || user?.role !== "super_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="page-frame py-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Admin Panel</h1>
          <p className="text-sm text-muted mt-0.5">Manage organizations and users</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand/90 transition-colors"
        >
          {showForm ? "Cancel" : "+ New Organization"}
        </button>
      </div>

      {/* Create org form */}
      {showForm && (
        <div className="mb-6 rounded-2xl border border-border bg-surface p-6">
          <h2 className="text-base font-semibold text-ink mb-4">Create Organization</h2>
          <form onSubmit={handleCreateOrg} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Organization name</label>
              <input
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="First Baptist Church"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Team leader name</label>
              <input
                type="text"
                required
                value={leaderName}
                onChange={(e) => setLeaderName(e.target.value)}
                placeholder="John Smith"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Team leader email</label>
              <input
                type="email"
                required
                value={leaderEmail}
                onChange={(e) => setLeaderEmail(e.target.value)}
                placeholder="john@church.org"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <div className="sm:col-span-3 flex items-center gap-3">
              <button
                type="submit"
                disabled={creating}
                className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-50 transition-colors"
              >
                {creating ? "Creating…" : "Create Organization"}
              </button>
              {createError && <p className="text-sm text-red-600">{createError}</p>}
            </div>
          </form>
        </div>
      )}

      {/* Temp password result */}
      {createResult && (
        <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-5">
          <h3 className="text-sm font-semibold text-green-800 mb-2">✅ Organization created!</h3>
          <p className="text-sm text-green-700 mb-1">
            <span className="font-medium">{createResult.org_name}</span> is ready. Share these credentials with the team leader:
          </p>
          <div className="mt-2 space-y-1 rounded-xl bg-white border border-green-200 px-4 py-3 text-sm font-mono text-ink">
            <div>Email: <span className="font-semibold">{createResult.team_leader_email}</span></div>
            <div>Password: <span className="font-semibold">{createResult.temp_password}</span></div>
          </div>
          <p className="text-xs text-green-600 mt-2">⚠️ Copy this password now — it won't be shown again.</p>
          <button
            onClick={() => setCreateResult(null)}
            className="mt-3 text-xs text-green-700 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Org list */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted">Organization</th>
              <th className="px-4 py-3 text-left font-medium text-muted">Plan</th>
              <th className="px-4 py-3 text-left font-medium text-muted">Members</th>
              <th className="px-4 py-3 text-left font-medium text-muted">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loadingOrgs ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">Loading…</td>
              </tr>
            ) : orgs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted">No organizations yet</td>
              </tr>
            ) : orgs.map((org) => (
              <tr key={org.id} className="hover:bg-surface/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-ink">{org.name}</div>
                  <div className="text-xs text-muted">{org.slug}</div>
                </td>
                <td className="px-4 py-3 text-muted capitalize">{org.plan}</td>
                <td className="px-4 py-3 text-muted">{org.member_count}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${org.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {org.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
