import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/api";
import type { Id } from "@convex/dataModel";

/**
 * The church's mark and the handout's QR code.
 *
 * Two things the study guide needs that the study guide does not contain:
 * the sheet is written by a prompt that knows nothing about who is handing
 * it out, and the code has to come from Link, which owns the address it
 * points at.
 *
 * WHY THIS ASKS TWICE
 * -------------------
 * The read is a query, so the sheet renders the moment the logo is known.
 * The code is a campaign row in Link, and a sermon that has never been
 * printed does not have one yet — so when the query comes back without a
 * code, this asks for one, once. `ensure` is idempotent on the project id,
 * so the second ask returns the first answer and a regenerated guide keeps
 * the code already printed on the sheets in the foyer.
 *
 * Minting on view rather than at generation is deliberate. Generation runs
 * in whoever pressed the button's identity, and the guides written before
 * any of this existed would have had no code at all — where this way, an
 * old guide gets one the first time somebody opens it to print.
 */
export type HandoutBrand = {
  churchName: string;
  logoUrl: string | null;
  /** The full address the QR encodes, or null when there is nowhere to point. */
  qrUrl: string | null;
};

/** Where a scan lands: the church's Link page, tagged with this handout's code. */
function qrUrlFor(slug: string | null, code: string | null): string | null {
  if (!slug || !code) return null;
  return `https://link.a1-8.com/${slug}?c=${code}`;
}

export function useHandoutBrand(
  projectId: Id<"amplifyProjects">,
  /**
   * Off until there is a handout to brand. The shared read-only view has no
   * project to ask about, and asking for a code before a guide exists would
   * mint one for a sermon nobody has written a handout for.
   */
  enabled: boolean,
): HandoutBrand | null {
  const brand = useQuery(
    api.amplifyHandout.brand,
    enabled ? { projectId } : "skip",
  );
  const ensure = useMutation(api.amplifyHandout.ensure);
  // Per project, so switching sermons in one session still asks for the new
  // one — and so a re-render never asks twice for the same.
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || brand === undefined || brand === null) return;
    if (brand.code) return;
    if (asked.current === String(projectId)) return;
    asked.current = String(projectId);
    // A church with no published Link page has nowhere to point a QR, and
    // says so by returning nothing. That is an answer, not a failure, and
    // the sheet prints without a code.
    void ensure({ projectId }).catch(() => {});
  }, [enabled, brand, ensure, projectId]);

  if (!brand) return null;
  return {
    churchName: brand.churchName,
    logoUrl: brand.logoUrl,
    qrUrl: qrUrlFor(brand.slug, brand.code),
  };
}
