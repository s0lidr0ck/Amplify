import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// The three faces tokens.css asks for. Self-hosted rather than fetched from
// Google, so there is no third-party request in the critical path and no
// flash of the operating system's font on a slow connection.
//
// They were declared and never loaded, so every one of them fell through to
// system-ui and the whole product wore whatever face the machine had. That
// is most of what "bland" was.
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/inter-tight";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";

import App from "./App";
import { convex } from "./convexClient";
import "./styles/tokens.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </StrictMode>,
);
