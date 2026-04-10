"use client";

import { useEffect, useState } from "react";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../ai-elements/reasoning";

type MessageReasoningProps = {
  isLoading: boolean;
  reasoning: string;
  label?: "think" | "search";
};

export function MessageReasoning({
  isLoading,
  reasoning,
  label = "think",
}: MessageReasoningProps) {
  const [hasBeenStreaming, setHasBeenStreaming] = useState(isLoading);

  useEffect(() => {
    if (isLoading) {
      setHasBeenStreaming(true);
    }
  }, [isLoading]);

  return (
    <Reasoning
      data-testid="message-reasoning"
      defaultOpen={hasBeenStreaming}
      isStreaming={isLoading}
    >
      <ReasoningTrigger
        getThinkingMessage={(isStreaming, duration) => {
          if (label === "search") {
            if (isStreaming || duration === 0) {
              return <span>Search...</span>;
            }

            if (duration === undefined) {
              return <span>Searched the web</span>;
            }

            return <span>Searched for {duration} seconds</span>;
          }

          if (isStreaming || duration === 0) {
            return <span>Think...</span>;
          }

          if (duration === undefined) {
            return <span>Thought for a few seconds</span>;
          }

          return <span>Thought for {duration} seconds</span>;
        }}
      />
      <ReasoningContent>{reasoning}</ReasoningContent>
    </Reasoning>
  );
}
