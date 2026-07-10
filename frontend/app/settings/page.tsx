"use client";

// Settings stub — follows editor + PAT sync + backup land in the next phase.

import { PageShell } from "@/components/ui/PageShell";

export default function SettingsPage() {
  return (
    <PageShell title="Settings">
      <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
        Follows management, GitHub sync, and backup are coming in the next
        build. For now, edit{" "}
        <a
          className="text-accent underline underline-offset-4"
          href="https://github.com/Adavidss/ArxivPaperScraper/edit/main/data/follows.json"
          target="_blank"
          rel="noreferrer"
        >
          data/follows.json on GitHub
        </a>{" "}
        to change who you follow.
      </p>
    </PageShell>
  );
}
