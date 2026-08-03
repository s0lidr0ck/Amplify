import { Link } from "react-router-dom";

import { Mark } from "../brand/Mark";

/**
 * The chrome every page wears.
 *
 * Before this, the sermon list had a wordmark and the sermon page had a
 * back-link, so moving between them felt like leaving the product. One bar,
 * everywhere: where you are, whose work it is, and the way out.
 *
 * Deliberately quiet — a hairline and no fill. This is an operator tool and
 * the bar is not the work; it is there so nobody has to wonder which church
 * they are filing a sermon under, which is the one mistake here that is
 * expensive to undo.
 */
export function Shell({
  church,
  churches,
  onChooseChurch,
  children,
}: {
  church?: { churchId: string; name: string } | null;
  churches?: { churchId: string; name: string }[];
  onChooseChurch?: (id: string) => void;
  children: React.ReactNode;
}) {
  const canSwitch = (churches?.length ?? 0) > 1 && onChooseChurch;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background-alt">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <Link
            to="/projects"
            className="flex items-center gap-2 text-ink transition-opacity hover:opacity-70"
          >
            <span className="text-brand">
              <Mark size={20} title="Amplify" />
            </span>
            <span className="font-display text-base font-semibold tracking-tight">
              Amplify
            </span>
          </Link>

          {church && (
            <>
              {/* A separator rather than a slash: the church is not a path
                  segment under the product, it is whose work this is. */}
              <span className="h-4 w-px bg-border" aria-hidden />
              {canSwitch ? (
                <label className="flex items-center gap-1.5">
                  <span className="sr-only">Church</span>
                  <select
                    value={church.churchId}
                    onChange={(e) => onChooseChurch(e.target.value)}
                    className="rounded-lg border border-border bg-surface px-2 py-1 text-xs text-ink focus:border-brand focus:outline-none"
                  >
                    {churches!.map((c) => (
                      <option key={c.churchId} value={c.churchId}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="text-xs text-muted">{church.name}</span>
              )}
            </>
          )}

          <nav className="ml-auto flex items-center gap-4">
            <Link
              to="/library"
              className="text-xs text-muted transition-colors hover:text-ink"
            >
              Library
            </Link>
            <Link
              to="/settings"
              className="text-xs text-muted transition-colors hover:text-ink"
            >
              Settings
            </Link>
          </nav>
        </div>
      </header>

      {children}
    </div>
  );
}
