"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader } from "@/components/ui/Card";
import { speakers } from "@/lib/api";

export default function SpeakersPage() {
  const queryClient = useQueryClient();
  const [newSpeakerName, setNewSpeakerName] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");

  const { data: speakerList = [], isLoading } = useQuery({
    queryKey: ["speakers-admin"],
    queryFn: () => speakers.list(true),
  });

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

  return (
    <AppShell>
      <main className="page-frame py-8 lg:py-10">
        <div className="page-stack">
          <PageHeader
            eyebrow="Speakers"
            title="Manage speaker names and familiar titles."
            description="Edit the canonical name and the way each speaker should be displayed across the workflow."
          />

          <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card>
              <CardHeader
                eyebrow="Add Speaker"
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
                  <Alert tone="danger">{createSpeaker.error instanceof Error ? createSpeaker.error.message : "Unable to create speaker."}</Alert>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardHeader
                eyebrow="Speaker List"
                title="Edit existing speakers"
                description="Deactivate a speaker to hide them from new projects, or delete them if they are unused."
              />
              <div className="mt-6 space-y-4">
                {isLoading ? <Alert tone="info">Loading speaker directory.</Alert> : null}
                {updateSpeaker.isError ? (
                  <Alert tone="danger">{updateSpeaker.error instanceof Error ? updateSpeaker.error.message : "Unable to update speaker."}</Alert>
                ) : null}
                {deleteSpeaker.isError ? (
                  <Alert tone="danger">{deleteSpeaker.error instanceof Error ? deleteSpeaker.error.message : "Unable to delete speaker."}</Alert>
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
