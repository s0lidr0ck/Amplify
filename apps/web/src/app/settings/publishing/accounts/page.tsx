import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { PublishingConnectionsSummary } from "@/components/settings/PublishingConnectionsSummary";

function SecretList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Badge key={item} tone="neutral" className="normal-case tracking-normal">
          {item}
        </Badge>
      ))}
    </div>
  );
}

export default function PublishingAccountsPage() {
  return (
    <div className="space-y-6">
      <PublishingConnectionsSummary mode="compact" />

      <Card>
        <CardHeader
          eyebrow="Accounts"
          title="Connected accounts"
          description="These are the app-level credentials and linked identities the publish stack depends on."
        />
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-5">
            <p className="section-label">YouTube</p>
            <p className="mt-2 text-sm text-muted">Used for sermon videos and Shorts.</p>
            <div className="mt-4 space-y-3 text-sm">
              <SecretList items={["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN", "YOUTUBE_CHANNEL_ID"]} />
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-5">
            <p className="section-label">Facebook</p>
            <p className="mt-2 text-sm text-muted">Used for Page text posts and Page/video publishing.</p>
            <div className="mt-4 space-y-3 text-sm">
              <SecretList items={["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_ACCESS_TOKEN"]} />
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-5">
            <p className="section-label">Instagram</p>
            <p className="mt-2 text-sm text-muted">Uses the linked Business account for image and reel publishing.</p>
            <div className="mt-4 space-y-3 text-sm">
              <SecretList items={["INSTAGRAM_BUSINESS_ACCOUNT_ID", "INSTAGRAM_ACCESS_TOKEN"]} />
            </div>
          </div>
          <div className="rounded-[1.5rem] border border-border/70 bg-surface/85 p-5">
            <p className="section-label">TikTok</p>
            <p className="mt-2 text-sm text-muted">Uses creator auth for direct upload and photo-post flows.</p>
            <div className="mt-4 space-y-3 text-sm">
              <SecretList items={["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_OPEN_ID", "TIKTOK_ACCESS_TOKEN", "TIKTOK_REFRESH_TOKEN"]} />
            </div>
          </div>
        </div>
      </Card>

      <Alert tone="info">
        These credentials are app-wide, not project-specific. The project release desk only chooses what to publish and when.
      </Alert>
    </div>
  );
}
