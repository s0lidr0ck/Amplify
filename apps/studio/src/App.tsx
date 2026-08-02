import { useQuery } from "convex/react";
import { api } from "@convex/api";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { HubGate } from "./auth/hubAuth";
import { Mark } from "./brand/Mark";
import { ProjectsPage } from "./pages/Projects";

/**
 * Amplify — stage two.
 *
 * Everything past sign-in is behind a church. Most people belong to exactly
 * one, so the picker only appears when there is a genuine choice: a staff
 * member serving two congregations, or an A1:8 admin. Showing a chooser to
 * someone with one option is a step that never had an answer.
 */

function ChurchGate({
  children,
}: {
  children: (churchId: string) => React.ReactNode;
}) {
  const churches = useQuery(api.amplify.myChurches, {});

  if (churches === undefined) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted">
        Loading…
      </div>
    );
  }

  // Signed in, but nobody has given them Amplify. Says what to do rather than
  // just refusing — the fix is an admin action, and they need to know who to
  // ask.
  if (churches.length === 0) {
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
          <p className="text-sm text-ink">
            You&rsquo;re signed in, but Amplify hasn&rsquo;t been switched on
            for you yet.
          </p>
          <p className="text-sm text-muted">
            An admin at your church can turn it on from A1:8 Home, the same way
            they would for Crew.
          </p>
        </div>
      </div>
    );
  }

  // One church is the normal case; more is real but rare. Either way the app
  // below only ever deals with one at a time.
  return <>{children(churches[0].churchId)}</>;
}

export default function App() {
  return (
    <HubGate>
      <ChurchGate>
        {(churchId) => (
          <BrowserRouter>
            <Routes>
              <Route
                path="/projects"
                element={<ProjectsPage churchId={churchId} />}
              />
              <Route path="*" element={<Navigate to="/projects" replace />} />
            </Routes>
          </BrowserRouter>
        )}
      </ChurchGate>
    </HubGate>
  );
}
