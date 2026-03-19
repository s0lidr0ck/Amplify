"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { projects } from "@/lib/api";

const SPEAKER_PRESETS = [
  { key: "custom", label: "Custom speaker", speaker: "", displayName: "" },
  { key: "chris-tidwell", label: "Chris Tidwell", speaker: "Chris Tidwell", displayName: "Pastor Chris" },
  { key: "mickey-kelly", label: "Mickey Kelly", speaker: "Mickey Kelly", displayName: "Brother Mickey" },
  { key: "misty-sanders", label: "Misty Sanders", displayName: "Sister Misty", speaker: "Misty Sanders" },
] as const;

export default function NewProject() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [speakerPreset, setSpeakerPreset] = useState<(typeof SPEAKER_PRESETS)[number]["key"]>("custom");
  const [speaker, setSpeaker] = useState("");
  const [speakerDisplayName, setSpeakerDisplayName] = useState("");
  const [sermonDate, setSermonDate] = useState("");
  const [sourceType, setSourceType] = useState<"upload" | "youtube">("upload");
  const [sourceUrl, setSourceUrl] = useState("");

  const create = useMutation({
    mutationFn: projects.create,
    onSuccess: (data) => {
      router.push(`/projects/${data.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({
      title,
      speaker,
      speaker_display_name: speakerDisplayName || speaker,
      sermon_date: sermonDate,
      source_type: sourceType,
      source_url: sourceType === "youtube" ? sourceUrl : undefined,
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
            <label className="block text-sm font-medium text-gray-700">Speaker preset</label>
            <select
              value={speakerPreset}
              onChange={(e) => {
                const nextKey = e.target.value as (typeof SPEAKER_PRESETS)[number]["key"];
                setSpeakerPreset(nextKey);
                const preset = SPEAKER_PRESETS.find((item) => item.key === nextKey);
                if (!preset) return;
                setSpeaker(preset.speaker);
                setSpeakerDisplayName(preset.displayName);
              }}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            >
              {SPEAKER_PRESETS.map((preset) => (
                <option key={preset.key} value={preset.key}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Speaker</label>
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
          <div>
            <label className="block text-sm font-medium text-gray-700">Source type</label>
            <div className="mt-2 flex gap-4">
              <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={sourceType === "upload"}
                onChange={() => setSourceType("upload")}
                suppressHydrationWarning
              />
                Upload file
              </label>
              <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={sourceType === "youtube"}
                onChange={() => setSourceType("youtube")}
                suppressHydrationWarning
              />
                YouTube link
              </label>
            </div>
          </div>
          {sourceType === "youtube" && (
            <div>
              <label className="block text-sm font-medium text-gray-700">YouTube URL</label>
              <input
                type="url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
                suppressHydrationWarning
              />
            </div>
          )}
          <div className="pt-4">
            <button
              type="submit"
              disabled={create.isPending}
              className="w-full rounded bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {create.isPending ? "Creating..." : "Create project"}
            </button>
            {create.isError && (
              <p className="mt-2 text-sm text-red-600">{(create.error as Error).message}</p>
            )}
          </div>
        </form>
      </div>
    </main>
  );
}
