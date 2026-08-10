import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  CircleHelp, ExternalLink, LogOut, Settings, UserRound,
} from "lucide-react";
import { useA18Apps } from "../auth/useA18Apps";

// Hand-rolled rather than shadcn: this repo has @radix-ui/react-dialog and
// little else, and pulling in react-dropdown-menu to draw one menu is a
// dependency for a hundred lines of markup.
//
// Amplify had no sign-out at all before this. The way out of an operator tool
// should not be "clear your cookies".
export function AccountMenu() {
  const { signOut } = useAuthActions();
  const { user, apps, hubUrl, launch } = useA18Apps("amplify");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const item =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted transition-colors hover:bg-background-alt hover:text-ink";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Your account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-brand/15 text-brand transition-opacity hover:opacity-80"
      >
        {user?.avatarUrl
          ? <img src={user.avatarUrl} alt="" className="size-full object-cover" />
          : <UserRound className="size-4" />}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <div className="truncate text-xs font-semibold text-ink">{user?.name ?? "Me"}</div>
            {user?.email && <div className="truncate text-xs text-muted">{user.email}</div>}
          </div>

          <Link to="/settings" className={item} onClick={() => setOpen(false)}>
            <Settings className="size-3.5" />Settings
          </Link>
          {/* Whoever needs the manual is by definition somebody who does not
              know where things are — so it lives in the chrome, not a page. */}
          <Link to="/help" className={item} onClick={() => setOpen(false)}>
            <CircleHelp className="size-3.5" />Help
          </Link>

          {apps.length > 0 && (
            <>
              <div className="border-t border-border px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-faint">
                Your other apps
              </div>
              {apps.map((app) => (
                <button
                  key={app.key}
                  type="button"
                  className={item}
                  onClick={() => { setOpen(false); launch(app.url); }}
                >
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: app.color }} />
                  <span className="flex-1">{app.label}</span>
                  <ExternalLink className="size-3 text-faint" />
                </button>
              ))}
              <a href={hubUrl} target="_blank" rel="noreferrer" className={item}>
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: "#4800ff" }} />
                <span className="flex-1">All of A1:8</span>
                <ExternalLink className="size-3 text-faint" />
              </a>
            </>
          )}

          <button
            type="button"
            className={`${item} border-t border-border`}
            onClick={() => { setOpen(false); void signOut(); }}
          >
            <LogOut className="size-3.5" />Sign out
          </button>
        </div>
      )}
    </div>
  );
}
