"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { settingsApi, speakers, type PromptSetting } from "@/lib/api";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [newSpeakerName, setNewSpeakerName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});
  const [hasHydratedPrompts, setHasHydratedPrompts] = useState(false);

  const { data: speakerList = [], isLoading: speakersLoading } = useQuery({
    queryKey: ["speakers-admin"],
    queryFn: () => speakers.list(true),
  });

  const { data: promptResponse, isLoading: promptsLoading } = useQuery({
    queryKey: ["settings-prompts"],
    queryFn: () => settingsApi.listPrompts(),
  });

  const promptItems = promptResponse?.items ?? [];

  useEffect(() => {
    if (hasHydratedPrompts || promptItems.length === 0) return;
    setPromptDrafts(
      Object.fromEntries(promptItems.map((item) => [item.key, item.template]))
    );
    setHasHydratedPrompts(true);
  }, [hasHydratedPrompts, promptItems]);

  const promptsByCategory = useMemo(() => {
    const groups = new Map<string, PromptSetting[]>();
    for (const item of promptItems) {
      const existing = groups.get(item.category) ?? [];
      existing.push(item);
      groups.set(item.category, existing);
    }
    return Array.from(groups.entries());
  }, [promptItems]);

  const createSpeaker = useMutation({
    mutationFn: speakers.create,
    onSuccess: async () => {
      setNewSpeakerName("");
      setNewDisplayName("");
      await queryClient.invalidateQueries({ queryKey: ["speakers-admin"] });
      await queryClient.invalidateQueries({ queryKey: ["speakers"] });
    },
  });

  const updateSpeaker = useMutation({
    mutationFn: ({ id, ...data }: { id: string; speaker_name: string; display_name: string; is_active: boolean; sort_order: number }) =>
      speakers.update(id, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["speakers-admin"] });
      await queryClient.invalidateQueries({ queryKey: ["speakers"] });
    },
  });

  const deleteSpeaker = useMutation({
    mutationFn: (speakerId: string) => speakers.delete(speakerId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["speakers-admin"] });
      await queryClient.invalidateQueries({ queryKey: ["speakers"] });
    },
  });

  const savePrompts = useMutation({
    mutationFn: async () => {
      const overrides = Object.fromEntries(
        promptItems.map((item) => {
          const current = promptDrafts[item.key] ?? item.template;
          return [item.key, current === item.default_template ? null : current];
        })
      );
      return settingsApi.savePrompts(overrides);
    },
    onSuccess: async (data) => {
      setPromptDrafts(Object.fromEntries(data.items.map((item) => [item.key, item.template])));
      await queryClient.invalidateQueries({ queryKey: ["settings-prompts"] });
    },
  });

  const hasPromptChanges = promptItems.some((item) => (promptDrafts[item.key] ?? item.template) !== item.template);

  return (
    <AppShell>
      <main className="page-frame py-8 lg:py-10">
        <div className="page-stack">
          <PageHeader
            eyebrow="Settings"
            title="Manage speakers and prompt templates."
            description="Update the speaker directory and review the prompts that power each workflow stage."
          />

          <Card>
            <CardHeader
              eyebrow="Prompts"
              title="Workflow Prompt Templates"
              description="These templates are the editable LLM instructions used by metadata, blog, thumbnails, title/description, text posts, reels, and Clip Lab."
              action={
                <Button onClick={() => savePrompts.mutate()} disabled={savePrompts.isPending || !hasPromptChanges}>
                  {savePrompts.isPending ? "Saving..." : "Save Prompt Changes"}
                </Button>
              }
            />
            <div className="mt-6 space-y-4">
              {promptsLoading ? <Alert tone="info">Loading prompt templates.</Alert> : null}
              {savePrompts.isError ? (
                <Alert tone="danger">
                  {savePrompts.error instanceof Error ? savePrompts.error.message : "Unable to save prompt templates."}
                </Alert>
              ) : null}
              {savePrompts.isSuccess && !hasPromptChanges ? (
                <Alert tone="success">Prompt template changes saved.</Alert>
              ) : null}

              {promptsByCategory.map(([category, items]) => (
                <div key={category} className="space-y-4 rounded-[1.5rem] border border-border/80 bg-background-alt p-5">
                  <div>
                    <p className="section-label">{category}</p>
                    <h2 className="mt-2 text-lg font-semibold text-ink">{category} prompts</h2>
                  </div>
                  <div className="grid gap-4">
                    {items.map((item) => {
                      const currentValue = promptDrafts[item.key] ?? item.template;
                      const isDirty = currentValue !== item.template;
                      return (
                        <div key={item.key} className="rounded-2xl border border-border bg-surface p-4">
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-ink">{item.label}</p>
                              <p className="mt-1 text-sm text-muted">{item.description}</p>
                              <p className="mt-2 text-xs uppercase tracking-[0.18em] text-muted">{item.key}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {item.is_overridden === "true" ? (
                                <span className="rounded-full bg-info-soft px-3 py-1 text-xs font-semibold text-info">
                                  Overridden
                                </span>
                              ) : (
                                <span className="rounded-full bg-surface-tint px-3 py-1 text-xs font-semibold text-muted">
                                  Default
                                </span>
                              )}
                              <Button
                                type="button"
                                variant="secondary"
                                onClick={() =>
                                  setPromptDrafts((current) => ({ ...current, [item.key]: item.default_template }))
                                }
                                disabled={currentValue === item.default_template}
                              >
                                Reset
                              </Button>
                              {isDirty ? (
                                <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-semibold text-warning">
                                  Unsaved
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <textarea
                            value={currentValue}
                            onChange={(event) =>
                              setPromptDrafts((current) => ({ ...current, [item.key]: event.target.value }))
                            }
                            className="min-h-[18rem] w-full rounded-[1.25rem] border border-border bg-background px-4 py-3 text-sm leading-7 text-ink outline-none transition focus:border-brand"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card>
              <CardHeader
                eyebrow="Speakers"
                title="Create a new speaker"
                description="This list powers the project creation form and keeps familiar titles consistent."
              />
              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Canonical name</label>
                  <input
                    type="text"
                    value={newSpeakerName}
                    onChange={(e) => setNewSpeakerName(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Display name / familiar title</label>
                  <input
                    type="text"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                  />
                </div>
                <Button
                  onClick={() =>
                    createSpeaker.mutate({
                      speaker_name: newSpeakerName,
                      display_name: newDisplayName,
                      is_active: true,
                      sort_order: speakerList.length * 10 + 10,
                    })
                  }
                  disabled={createSpeaker.isPending || !newSpeakerName.trim() || !newDisplayName.trim()}
                >
                  {createSpeaker.isPending ? "Adding..." : "Add Speaker"}
                </Button>
                {createSpeaker.isError ? (
                  <Alert tone="danger">
                    {createSpeaker.error instanceof Error ? createSpeaker.error.message : "Unable to create speaker."}
                  </Alert>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardHeader
                eyebrow="Speakers"
                title="Edit existing speakers"
                description="Deactivate a speaker to hide them from new projects, or delete them if they are unused."
              />
              <div className="mt-6 space-y-4">
                {speakersLoading ? <Alert tone="info">Loading speaker directory.</Alert> : null}
                {updateSpeaker.isError ? (
                  <Alert tone="danger">
                    {updateSpeaker.error instanceof Error ? updateSpeaker.error.message : "Unable to update speaker."}
                  </Alert>
                ) : null}
                {deleteSpeaker.isError ? (
                  <Alert tone="danger">
                    {deleteSpeaker.error instanceof Error ? deleteSpeaker.error.message : "Unable to delete speaker."}
                  </Alert>
                ) : null}
                {speakerList.map((speaker) => (
                  <SpeakerRow
                    key={speaker.id}
                    speaker={speaker}
                    onSave={(payload) => updateSpeaker.mutate(payload)}
                    onDelete={() => {
                      const confirmed = window.confirm(
                        `Delete "${speaker.display_name}" from the speaker directory? This only works if no projects are already using that speaker.`
                      );
                      if (!confirmed) return;
                      deleteSpeaker.mutate(speaker.id);
                    }}
                    saving={updateSpeaker.isPending && updateSpeaker.variables?.id === speaker.id}
                    deleting={deleteSpeaker.isPending && deleteSpeaker.variables === speaker.id}
                  />
                ))}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </AppShell>
  );
}

function SpeakerRow({
  speaker,
  onSave,
  onDelete,
  saving,
  deleting,
}: {
  speaker: {
    id: string;
    speaker_name: string;
    display_name: string;
    is_active: boolean;
    sort_order: number;
  };
  onSave: (payload: { id: string; speaker_name: string; display_name: string; is_active: boolean; sort_order: number }) => void;
  onDelete: () => void;
  saving: boolean;
  deleting: boolean;
}) {
  const [speakerName, setSpeakerName] = useState(speaker.speaker_name);
  const [displayName, setDisplayName] = useState(speaker.display_name);
  const [sortOrder, setSortOrder] = useState(String(speaker.sort_order));
  const [isActive, setIsActive] = useState(speaker.is_active);

  return (
    <div className="rounded-2xl border border-border/80 bg-surface p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">Canonical name</label>
          <input
            type="text"
            value={speakerName}
            onChange={(e) => setSpeakerName(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Sort order</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <label className="flex items-center gap-2 self-end text-sm font-medium text-gray-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active for new projects
        </label>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          onClick={() =>
            onSave({
              id: speaker.id,
              speaker_name: speakerName,
              display_name: displayName,
              is_active: isActive,
              sort_order: Number(sortOrder) || 0,
            })
          }
          disabled={saving || deleting || !speakerName.trim() || !displayName.trim()}
        >
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button variant="secondary" onClick={onDelete} disabled={saving || deleting}>
          {deleting ? "Deleting..." : "Delete"}
        </Button>
      </div>
    </div>
  );
}
