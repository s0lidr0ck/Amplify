import { ConvexReactClient } from "convex/react";

// The shared A1:8 deployment — the same one Crew, Study and UpScreen use.
// Amplify's records live there alongside theirs; only the media bytes and the
// work that produces them sit outside.
export const convex = new ConvexReactClient(
  import.meta.env.VITE_CONVEX_URL as string,
);
