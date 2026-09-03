import { DISCLAIMER, HELPLINES } from "@/lib/constants";

export function CrisisBanner() {
  return (
    <footer className="px-1 pt-2.5">
      <p className="text-center text-[11px] leading-relaxed text-[var(--muted)]/80">
        {DISCLAIMER}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px]">
        <span className="font-medium text-[var(--crisis)]">Need help now?</span>
        <a
          href={`tel:${HELPLINES.surpin.number.replace(/\s/g, "")}`}
          className="text-[var(--accent)] transition-colors hover:text-[var(--accent-soft)]"
        >
          {HELPLINES.surpin.name}: {HELPLINES.surpin.number}
        </a>
        <span className="text-[var(--muted)]/50" aria-hidden>
          ·
        </span>
        <a
          href={`tel:${HELPLINES.mani.number.replace(/\s/g, "")}`}
          className="text-[var(--accent)] transition-colors hover:text-[var(--accent-soft)]"
        >
          {HELPLINES.mani.name}: {HELPLINES.mani.number}
        </a>
      </div>
    </footer>
  );
}
