"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CodingRepo } from "@/lib/coding/types";
import { cn } from "@/lib/utils";

type RepoPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRepo?: CodingRepo | null;
  onSelect: (repo: CodingRepo) => void;
};

export function RepoPicker({
  open,
  onOpenChange,
  selectedRepo,
  onSelect,
}: RepoPickerProps) {
  const [repos, setRepos] = useState<CodingRepo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setError(null);
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/coding/repos`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          throw new Error(data.error);
        }
        setRepos(data.repos ?? []);
      })
      .catch((err) => setError(err.message ?? "Failed to load repos"))
      .finally(() => setIsLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return repos;
    const lower = query.toLowerCase();
    return repos.filter((repo) => repo.fullName.toLowerCase().includes(lower));
  }, [query, repos]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Select GitHub Repository</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Input
            placeholder="Search repos..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {isLoading && (
            <div className="rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
              Loading repositories...
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          {!isLoading && !error && (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border/60">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                  No repositories found.
                </div>
              ) : (
                filtered.map((repo) => {
                  const isSelected = repo.fullName === selectedRepo?.fullName;
                  return (
                    <button
                      key={repo.id}
                      className={cn(
                        "flex w-full items-center justify-between px-4 py-3 text-left text-sm transition-colors hover:bg-muted/50",
                        isSelected && "bg-muted/60"
                      )}
                      onClick={() => {
                        onSelect(repo);
                        onOpenChange(false);
                      }}
                      type="button"
                    >
                      <div>
                        <div className="font-medium">{repo.fullName}</div>
                        <div className="text-xs text-muted-foreground">
                          Default branch: {repo.defaultBranch}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px]",
                          repo.private
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        )}
                      >
                        {repo.private ? "Private" : "Public"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          )}
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
