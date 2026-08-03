import { useQuery } from "convex/react";
import { api } from "@convex/api";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { HubGate } from "./auth/hubAuth";
import { useChurch } from "./auth/useChurch";
import { Mark } from "./brand/Mark";
import { Shell } from "./components/Shell";
import { LibraryPage } from "./pages/Library";
import { ProjectPage } from "./pages/Project";
import {
  ClipsRoom,
  PublishRoom,
  SourceRoom,
  TranscriptRoom,
  WritingPieceRoom,
  WritingRoom,
} from "./pages/project/rooms";
import { ProjectsPage } from "./pages/Projects";
import { SettingsPage } from "./pages/Settings";
import { SharedPage } from "./pages/Shared";

/**
 * Amplify — stage two.
 *
 * Everything past sign-in is scoped to a church. Most people belong to one and
 * never think about it; the picker only appears when there is a real choice.
 */

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="card grid w-full max-w-md gap-3 p-7">
        <div className="flex items-center gap-2.5">
          <span className="text-brand">
            <Mark size={26} title="Amplify" />
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-ink">
            Amplify
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  return (
    // The router sits OUTSIDE the sign-in gate so one route can escape it.
    // A pastor opening a share link has no account and is not going to make
    // one; a link that redirects him to sign in is a link that does nothing.
    <BrowserRouter>
      <Routes>
        <Route path="/share/:token" element={<SharedPage />} />
        <Route
          path="*"
          element={
            <HubGate>
              <Inside />
            </HubGate>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

function Inside() {
  const churches = useQuery(api.amplify.myChurches, {});
  const [churchId, chooseChurch] = useChurch(churches ?? []);

  if (churches === undefined) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted">
        Loading…
      </div>
    );
  }

  // Signed in, but nobody has switched Amplify on for them. Says whose job
  // that is rather than only refusing — the fix is someone else's action.
  if (churches.length === 0) {
    return (
      <Waiting>
        <p className="text-sm text-ink">
          You&rsquo;re signed in, but Amplify hasn&rsquo;t been switched on for
          you yet.
        </p>
        <p className="text-sm text-muted">
          An admin at your church can turn it on from A1:8 Home, the same way
          they would for Crew.
        </p>
      </Waiting>
    );
  }

  if (!churchId) return null;

  const current = churches.find((c) => c.churchId === churchId) ?? churches[0];

  return (
    // No Router here — App owns the only one, so that the share route can sit
    // outside the sign-in gate. Two Routers is a blank white page and an
    // exception that names neither of them.
    <Shell church={current} churches={churches} onChooseChurch={chooseChurch}>
      {/* One bar for every page. Each screen used to invent its own header,
          so moving between them felt like leaving the product — and the
          sermon page showed no church at all, which is the one thing here
          that is expensive to get wrong. */}
      <Routes>
        <Route path="/projects" element={<ProjectsPage churchId={churchId} />} />
        {/* Five rooms under one sermon. The layout carries the header, the
            rail and the room's wash; each child is a screenful with one
            job. Nesting rather than five sibling routes so the sermon is
            fetched once and the rail never re-mounts as you move. */}
        <Route path="/projects/:id" element={<ProjectPage />}>
          <Route path="source" element={<SourceRoom />} />
          <Route path="transcript" element={<TranscriptRoom />} />
          <Route path="writing" element={<WritingRoom />} />
          {/* Each piece is a place, so it can be linked to and returned to
              — and so its actions have somewhere to live other than beside
              four pieces they have nothing to do with. */}
          <Route path="writing/:kind" element={<WritingPieceRoom />} />
          <Route path="clips" element={<ClipsRoom />} />
          <Route path="publish" element={<PublishRoom />} />
        </Route>
        <Route path="/library" element={<LibraryPage churchId={churchId} />} />
        <Route path="/settings" element={<SettingsPage churchId={churchId} />} />
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </Shell>
  );
}
