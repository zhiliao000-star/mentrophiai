"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CodingEvent, CodingRepo } from "@/lib/coding/types";
import { RepoPicker } from "./repo-picker";

type CodingPanelProps = {
  onBackToChat: () => void;
};

type StepState = {
  step: string;
  status: "pending" | "active" | "done";
};

function parseEvents(
  chunk: string,
  buffer: string
): { events: CodingEvent[]; rest: string } {
  const combined = buffer + chunk;
  const lines = combined.split("\n");
  const rest = lines.pop() ?? "";
  const events: CodingEvent[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line) as CodingEvent);
    } catch {
      // ignore malformed lines
    }
  }

  return { events, rest };
}

export function CodingPanel({ onBackToChat }: CodingPanelProps) {
  const [task, setTask] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [events, setEvents] = useState<CodingEvent[]>([]);
  const [steps, setSteps] = useState<StepState[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<CodingRepo | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [diff, setDiff] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [prUrl, setPrUrl] = useState<string | null>(null);

  const isSubmitDisabled = !task.trim() || !selectedRepo || isRunning;

  const logLines = useMemo(
    () =>
      events
        .filter((event) => event.type === "log")
        .map((event) => event.message)
        .join("\n"),
    [events]
  );

  const handleRun = async () => {
    if (!selectedRepo || !task.trim()) return;
    setIsRunning(true);
    setEvents([]);
    setSteps([]);
    setFiles([]);
    setDiff("");
    setSummary("");
    setPrUrl(null);

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/coding/run`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          repoFullName: selectedRepo.fullName,
        }),
      }
    );

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => null);
      setEvents((current) => [
        ...current,
        {
          type: "error",
          message: payload?.error || "Failed to start coding task.",
        },
      ]);
      setIsRunning(false);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const { events: newEvents, rest } = parseEvents(chunk, buffer);
      buffer = rest;

      for (const event of newEvents) {
        setEvents((current) => [...current, event]);
        if (event.type === "step") {
          setSteps((current) => {
            const existing = current.find((step) => step.step === event.step);
            if (existing) {
              return current.map((step) =>
                step.step === event.step ? { ...step, status: event.status } : step
              );
            }
            return [...current, { step: event.step, status: event.status }];
          });
        }
        if (event.type === "files") {
          setFiles(event.files);
        }
        if (event.type === "diff") {
          setDiff(event.diff);
        }
        if (event.type === "result") {
          setSummary(event.summary);
          setPrUrl(event.pullRequestUrl);
        }
      }
    }

    setIsRunning(false);
  };

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card/70 px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Coding mode</div>
          <div className="text-xs text-muted-foreground">
            Uses E2B + claw-code with NVIDIA NIM
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setIsPickerOpen(true)}
          >
            GitHub Repo
          </Button>
          <Button
            variant="ghost"
            onClick={onBackToChat}
          >
            Back to Chat
          </Button>
        </div>
      </div>

      <RepoPicker
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        selectedRepo={selectedRepo}
        onSelect={setSelectedRepo}
      />

      <div className="rounded-xl border border-border/60 bg-background/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs text-muted-foreground">Selected repo</div>
            <div className="text-sm font-medium">
              {selectedRepo?.fullName ?? "None"}
            </div>
          </div>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs",
              selectedRepo
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-border/60 bg-muted/40 text-muted-foreground"
            )}
          >
            {selectedRepo ? "Ready" : "Select repo to enable"}
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-border/60 bg-card/70 p-4">
          <div className="text-sm font-semibold">Task</div>
          <Textarea
            className="mt-3 min-h-[120px]"
            placeholder="Describe the code change you want..."
            value={task}
            onChange={(event) => setTask(event.target.value)}
          />
          <div className="mt-3 flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              The agent will create a branch and open a PR.
            </div>
            <Button disabled={isSubmitDisabled} onClick={handleRun}>
              {isRunning ? "Running..." : "Run coding task"}
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/70 p-4">
          <div className="text-sm font-semibold">Steps</div>
          <div className="mt-3 flex flex-col gap-2 text-sm">
            {steps.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                Steps will appear here as the agent runs.
              </div>
            ) : (
              steps.map((step) => (
                <div
                  key={step.step}
                  className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"
                >
                  <span className="capitalize">{step.step}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px]",
                      step.status === "active"
                        ? "bg-amber-100 text-amber-700"
                        : step.status === "done"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-muted/40 text-muted-foreground"
                    )}
                  >
                    {step.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-xl border border-border/60 bg-card/70 p-4">
          <div className="text-sm font-semibold">Changed files</div>
          <div className="mt-3">
            {files.length === 0 ? (
              <div className="text-xs text-muted-foreground">
                No files reported yet.
              </div>
            ) : (
              <ul className="space-y-1 text-sm">
                {files.map((file) => (
                  <li key={file} className="rounded-md bg-muted/40 px-2 py-1">
                    {file}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {summary && (
            <div className="mt-3 rounded-lg border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
              {summary}
              {prUrl && (
                <div className="mt-2">
                  <a
                    className="text-foreground underline"
                    href={prUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Open pull request
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border/60 bg-card/70 p-4">
          <div className="text-sm font-semibold">Diff preview</div>
          <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/40 bg-muted/40 p-3 text-xs">
            {diff || "Diff will appear here if available."}
          </pre>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-card/70 p-4">
        <div className="text-sm font-semibold">Agent log</div>
        <pre className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/40 bg-muted/40 p-3 text-xs">
          {logLines || "Waiting for agent output..."}
        </pre>
      </div>
    </div>
  );
}
