import { DISCLAIMER, HELPLINES } from "@/lib/constants";

export function CrisisBanner() {
  return (
    <footer className="border-t border-[var(--surface-elevated)] bg-[var(--surface)] px-4 py-3">
      <p className="text-center text-xs text-[var(--muted)]">{DISCLAIMER}</p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs">
        <span className="font-medium text-[var(--crisis)]">Need help now?</span>
        <a
          href={`tel:${HELPLINES.surpin.number.replace(/\s/g, "")}`}
          className="text-[var(--accent)] hover:underline"
        >
          {HELPLINES.surpin.name}: {HELPLINES.surpin.number}
        </a>
        <span className="text-[var(--muted)]">·</span>
        <a
          href={`tel:${HELPLINES.mani.number.replace(/\s/g, "")}`}
          className="text-[var(--accent)] hover:underline"
        >
          {HELPLINES.mani.name}: {HELPLINES.mani.number}
        </a>
      </div>
    </footer>
  );
}
