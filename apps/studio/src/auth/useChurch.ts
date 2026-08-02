import { useEffect, useState } from "react";

/**
 * Which church you are working in.
 *
 * Most people have one and never see this. It exists because some people
 * genuinely have more — staff serving two congregations, and A1:8 admins —
 * and for them "take the first membership found" is not a simplification, it
 * is a wrong answer that says nothing. The first sermon added to the rebuild
 * landed in the wrong church exactly that way.
 *
 * The choice is remembered per browser rather than per account: it is a view
 * preference, not a fact about the person, and someone using a shared office
 * machine should not have their pick follow them onto it.
 */

const KEY = "amplify_church";

export function useChurch(
  available: { churchId: string; name: string }[],
): [string | null, (id: string) => void] {
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    if (available.length === 0) {
      setChosen(null);
      return;
    }

    const remembered = localStorage.getItem(KEY);
    // Checked against the current list rather than trusted: memberships get
    // removed, and a stale id would otherwise send every query at a church
    // this person can no longer see, which reads as the app being broken.
    const valid = available.some((c) => c.churchId === remembered);

    setChosen((current) => {
      if (current && available.some((c) => c.churchId === current)) return current;
      return valid ? remembered : available[0].churchId;
    });
  }, [available]);

  const choose = (id: string) => {
    localStorage.setItem(KEY, id);
    setChosen(id);
  };

  return [chosen, choose];
}
