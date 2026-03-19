"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { projects, speakers } from "@/lib/api";

export default function NewProject() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [speakerId, setSpeakerId] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [speakerDisplayName, setSpeakerDisplayName] = useState("");
  const [sermonDate, setSermonDate] = useState("");

  const { data: speakerList = [] } = useQuery({
    queryKey: ["speakers"],
    queryFn: () => speakers.list(),
  });

  useEffect(() => {
    if (!speakerId && speakerList.length > 0) {
      const first = speakerList[0];
      setSpeakerId(first.id);
      setSpeaker(first.speaker_name);
      setSpeakerDisplayName(first.display_name);
    }
  }, [speakerId, speakerList]);

  const create = useMutation({
    mutationFn: projects.create,
    onSuccess: (data) => {
      router.push(`/projects/${data.id}`);
    },
  });

  const handleSpeakerChange = (nextId: string) => {
    setSpeakerId(nextId);
    const nextSpeaker = speakerList.find((entry) => entry.id === nextId);
    if (!nextSpeaker) return;
    setSpeaker(nextSpeaker.speaker_name);
    setSpeakerDisplayName(nextSpeaker.display_name);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({
      title,
      speaker,
      speaker_display_name: speakerDisplayName || speaker,
      sermon_date: sermonDate,
    });
  };

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <h1 className="text-xl font-semibold">Amplify</h1>
          <a href="/" className="text-gray-600 hover:text-gray-900">
            Dashboard
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-xl px-6 py-8">
        <h2 className="mb-6 text-lg font-medium">New Project</h2>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border bg-white p-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Project title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              suppressHydrationWarning
            />
          </div>
          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="block text-sm font-medium text-gray-700">Speaker</label>
              <Link href="/speakers" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                Manage speakers
              </Link>
            </div>
            <select
              value={speakerId}
              onChange={(e) => handleSpeakerChange(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              disabled={speakerList.length === 0}
            >
              {speakerList.length === 0 ? (
                <option value="">No speakers yet</option>
              ) : (
                speakerList.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.display_name} ({preset.speaker_name})
                  </option>
                ))
              )}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Canonical name</label>
            <input
              type="text"
              value={speaker}
              onChange={(e) => setSpeaker(e.target.value)}
              required
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              suppressHydrationWarning
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Display name / familiar title</label>
            <input
              type="text"
              value={speakerDisplayName}
              onChange={(e) => setSpeakerDisplayName(e.target.value)}
              required
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
              placeholder="Pastor Chris, Brother Mickey, Sister Misty..."
              suppressHydrationWarning
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Sermon date</label>
            <input
              type="date"
              value={sermonDate}
              onChange={(e) => setSermonDate(e.target.value)}
              required
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Create the project first, then choose a source on the Source Intake step. You can upload a file there or import directly from YouTube.
          </p>
          <div className="pt-4">
            <button
              type="submit"
              disabled={create.isPending || speakerList.length === 0}
              className="w-full rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {create.isPending ? "Creating..." : "Create project"}
            </button>
            {speakerList.length === 0 ? (
              <p className="mt-2 text-sm text-amber-700">Add at least one speaker before creating projects.</p>
            ) : null}
            {create.isError && <p className="mt-2 text-sm text-red-600">{(create.error as Error).message}</p>}
          </div>
        </form>
      </div>
    </main>
  );
}
