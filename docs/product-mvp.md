# Amplify MVP Scope

**Status:** Locked  
**Last updated:** 2026-03-17

## MVP Goal

Ship the core value loop first:

```
source sermon → trim → transcript → ranked clips → timing adjustment → raw clip export
```

## In Scope (MVP)

| Capability | Acceptance Criteria |
|------------|---------------------|
| Project creation | User can create a project with title, speaker, sermon date, and source type (upload or YouTube) |
| Source ingest | User can upload a file or provide a public YouTube link; system validates, stores, and reports progress |
| Sermon trim | User can preview source video, set in/out points, and generate sermon-only master |
| Sermon transcription | User can run Faster-Whisper transcription; view searchable transcript with timestamps; approve transcript |
| Clip Lab | User can run 3-pass clip analysis; view ranked candidates with score, title, hook; preview clips |
| Timing adjustment | User can adjust clip in/out points; rename clips; save adjusted timing |
| Raw clip export | User can export selected clip(s) as raw video files |
| Job status UI | Every long-running step shows status badge, progress bar, current message, event log, retry on failure |
| Asset lineage | User can trace source → sermon master → transcript → clip candidate → exported clip |

## Out of Scope (Deferred to Phase 2+)

- Blog post generation
- Long-form packaging (YouTube title/description, thumbnail prompts, Facebook post)
- Final reel upload and thumbnail association
- Reel transcript and caption-source generation
- Per-platform metadata generation (YouTube Shorts, Facebook, Instagram, TikTok)
- Publishing records and URL association
- Analytics sync and dashboards

## Product Rules (Non-Negotiable)

1. **Every AI output is editable by default.** Users must be able to edit trim, transcript, clip timing, titles, descriptions, etc.
2. **Upstream changes mark downstream outputs stale, never delete.** Re-trimming or re-transcribing does not silently overwrite user-reviewed content.
3. **Every long-running action shows visible status.** Progress bar, current step message, expandable event log, retry button on failure.

## Screen Scope Checklist

- [ ] Dashboard
- [ ] New Project
- [ ] Project Workspace (tabs: Source, Trim, Transcript, Clip Lab)
- [ ] Source Preview + Sermon Trim
- [ ] Transcript
- [ ] Clip Lab
- [ ] Asset summary / output lineage
