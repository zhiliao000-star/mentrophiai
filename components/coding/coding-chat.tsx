"use client";

import { useMemo, useState } from "react";
import { MultimodalInput } from "@/components/chat/multimodal-input";
import { RepoPicker } from "@/components/coding/repo-picker";
import type { Attachment, ChatMessage } from "@/lib/types";
import type { CodingEvent, CodingRepo } from "@/lib/coding/types";
import { cn, sanitizeText } from "@/lib/utils";
import { MessageContent, MessageResponse } from "@/components/ai-elements/message";

type CodingChatProps = {
  chatId: string;
};

function formatEvent(event: CodingEvent) {
  switch (event.type) {
    case "status":
      return event.message;
    case "step":
      return `Step: ${event.step} — ${event.status}`;
    case "log":
      return event.message;
    case "files":
      return `Changed files:\n${event.files.map((file) => `- ${file}`).join("\n")}`;
    case "diff":
      return `Diff preview:\n\n${event.diff}`;
    case "result":
      return event.pullRequestUrl
        ? `${event.summary}\nPR: ${event.pullRequestUrl}`
        : event.summary;
    case "error":
      return `Error: ${event.message}`;
    default:
      return "";
  }
}

export function CodingChat({ chatId }: CodingChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<CodingRepo | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const flattenedMessages = useMemo(() => {
    return messages.map((message) => {
      const text = message.parts
        ?.filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();
      return { ...message, text };
    });
  }, [messages]);

  const appendMessage = (role: "user" | "assistant", text: string) => {
    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role,
        parts: [{ type: "text", text }],
      },
    ]);
  };

  const handleCodingRun = async (task: string, repoFullName: string) => {
    if (!selectedRepo?.installationId) {
      appendMessage("assistant", "Select a GitHub repo before running.");
      return;
    }

    appendMessage("user", task);
    setIsRunning(true);

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/coding/run`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task,
          repoFullName,
          installationId: selectedRepo.installationId,
        }),
      }
    );

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => null);
      appendMessage(
        "assistant",
        payload?.error || "Failed to start coding task."
      );
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
      const combined = buffer + chunk;
      const lines = combined.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as CodingEvent;
          const message = formatEvent(event);
          if (message) {
            appendMessage("assistant", message);
          }
        } catch {
          // ignore malformed lines
        }
      }
    }

    setIsRunning(false);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-5 px-2 py-6 md:gap-7 md:px-4">
          {flattenedMessages.length === 0 && (
            <div className="rounded-xl border border-border/40 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
              Coding mode is ready. Select a repo and describe the change.
            </div>
          )}

          {flattenedMessages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "group/message w-full",
                message.role === "user" &&
                  "animate-[fade-up_0.25s_cubic-bezier(0.22,1,0.36,1)]"
              )}
              data-role={message.role}
            >
              <div
                className={cn(
                  message.role === "user"
                    ? "flex flex-col items-end gap-2"
                    : "flex items-start gap-3"
                )}
              >
                <MessageContent
                  className={cn("text-[18px] leading-[1.6]", {
                    "inline-flex w-fit max-w-[min(78%,42rem)] overflow-hidden break-words rounded-xl rounded-br-md border border-border/30 bg-gradient-to-br from-secondary to-muted px-5 py-3 shadow-[var(--shadow-card)]":
                      message.role === "user",
                  })}
                >
                  <MessageResponse>
                    {sanitizeText(message.text ?? "")}
                  </MessageResponse>
                </MessageContent>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
        <MultimodalInput
          attachments={attachments}
          chatId={chatId}
          input={input}
          isLoading={false}
          messages={[]}
          mode="coding"
          codingRepo={selectedRepo}
          onOpenRepoPicker={() => setIsPickerOpen(true)}
          onSubmitCoding={handleCodingRun}
          isCodingRunning={isRunning}
          onOpenVoiceMode={() => {}}
          selectedVisibilityType="private"
          sendMessage={async () => {}}
          setAttachments={setAttachments}
          setInput={setInput}
          setMessages={() => {}}
          status="ready"
          stop={() => {}}
        />
      </div>

      <RepoPicker
        open={isPickerOpen}
        onOpenChange={setIsPickerOpen}
        selectedRepo={selectedRepo}
        onSelect={setSelectedRepo}
      />
    </div>
  );
}
