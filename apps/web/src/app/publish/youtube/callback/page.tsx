"use client";

import { useSearchParams } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { Card, CardHeader } from "@/components/ui/Card";

export default function YouTubePublishCallbackPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const state = searchParams.get("state") ?? "";
  const error = searchParams.get("error") ?? "";

  return (
    <div className="page-frame py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <Card>
          <CardHeader
            eyebrow="YouTube OAuth"
            title="Google callback received"
            description="Copy the authorization code below and use it in the Amplify helper script or the next YouTube connect step."
          />

          <div className="mt-6 space-y-4">
            {error ? <Alert tone="danger">{error}</Alert> : null}
            <div className="rounded-[1.5rem] border border-border/80 bg-surface px-4 py-4">
              <p className="section-label">Authorization code</p>
              <textarea
                readOnly
                value={code}
                className="mt-3 min-h-[12rem] w-full rounded-[1.25rem] border border-border bg-background-alt px-4 py-3 font-mono text-sm text-ink outline-none"
              />
            </div>
            {state ? (
              <div className="rounded-[1.5rem] border border-border/80 bg-surface px-4 py-4">
                <p className="section-label">State</p>
                <p className="mt-3 break-all font-mono text-sm text-ink">{state}</p>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
