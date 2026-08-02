"use client";

import { useQuery } from "@tanstack/react-query";

import { getSignedPlaybackUrl } from "./api";

/**
 * A playable URL for a media asset, or null until one arrives.
 *
 * Media is the one thing that cannot be fetched with a bearer token: the URL
 * goes into a `<video src>` or an `<img src>`, and a browser will not attach
 * an Authorization header to a media element's request. So the API signs a
 * short-lived URL instead, and this fetches it.
 *
 * Cached for less than the signature's lifetime, so a page left open all
 * afternoon re-signs before the link it is holding goes stale rather than
 * after.
 */
export function useSignedPlaybackUrl(assetId: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ["playback-url", assetId],
    queryFn: () => getSignedPlaybackUrl(assetId as string),
    enabled: Boolean(assetId),
    // Signatures last six hours; refresh at five.
    staleTime: 5 * 60 * 60 * 1000,
    gcTime: 5 * 60 * 60 * 1000,
    retry: 1,
  });
  return data ?? null;
}
