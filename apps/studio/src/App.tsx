import { useQuery } from "convex/react";
import { api } from "@convex/api";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { HubGate } from "./auth/hubAuth";
import { useChurch } from "./auth/useChurch";
import { Mark } from "./brand/Mark";
import { Shell } from "./components/Shell";
import { ProjectPage } from "./pages/Project";
import { ProjectsPage } from "./pages/Projects";
import { SettingsPage } from "./pages/Settings";

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
    <HubGate>
      <Inside />
    </HubGate>
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
    <BrowserRouter>
      {/* One bar for every page. Each screen used to invent its own header,
          so moving between them felt like leaving the product — and the
          sermon page showed no church at all, which is the one thing here
          that is expensive to get wrong. */}
      <Shell church={current} churches={churches} onChooseChurch={chooseChurch}>
        <Routes>
          <Route
            path="/projects"
            element={<ProjectsPage churchId={churchId} />}
          />
          <Route path="/projects/:id" element={<ProjectPage />} />
          <Route
            path="/settings"
            element={<SettingsPage churchId={churchId} />}
          />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
