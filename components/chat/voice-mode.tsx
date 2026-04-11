"use client";

import { Orb, type OrbState } from "orb-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useActiveChat } from "@/hooks/use-active-chat";
import type { ChatMessage } from "@/lib/types";
import { CrossIcon } from "./icons";

function getTextFromMessage(message: ChatMessage) {
  return (
    message.parts
      ?.filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim() ?? ""
  );
}

function getSupportedRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return null;
  }

  const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

  return (
    preferredTypes.find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType)
    ) ?? null
  );
}

type VoiceModeProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function VoiceMode({ isOpen, onClose }: VoiceModeProps) {
  const { messages, sendMessage, status } = useActiveChat();

  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [volume, setVolume] = useState(0);
  const [caption, setCaption] = useState("Tap to start talking");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const currentMimeTypeRef = useRef<string>("audio/webm");

  const micAudioContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micFrameRef = useRef<number | null>(null);

  const speakerAudioRef = useRef<HTMLAudioElement | null>(null);
  const speakerContextRef = useRef<AudioContext | null>(null);
  const speakerAnalyserRef = useRef<AnalyserNode | null>(null);
  const speakerSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const speakerFrameRef = useRef<number | null>(null);
  const speakerObjectUrlRef = useRef<string | null>(null);

  const pendingAssistantCountRef = useRef<number | null>(null);
  const lastSpokenAssistantIdRef = useRef<string | null>(null);
  const shouldAutoLoopRef = useRef(false);
  const assistantCountRef = useRef(0);
  const startListeningRef = useRef<(() => Promise<void>) | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  const assistantMessages = useMemo(
    () => messages.filter((message) => message.role === "assistant"),
    [messages]
  );

  useEffect(() => {
    assistantCountRef.current = assistantMessages.length;
  }, [assistantMessages.length]);

  const visualState: OrbState = orbState === "error" ? "error" : "speaking";
  const visualVolume =
    orbState === "idle"
      ? 0.08
      : orbState === "connecting"
        ? 0.18
        : Math.max(volume, 0.12);

  const stopMicMonitoring = useCallback(() => {
    if (micFrameRef.current) {
      cancelAnimationFrame(micFrameRef.current);
      micFrameRef.current = null;
    }

    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
    micAnalyserRef.current = null;

    if (micAudioContextRef.current) {
      void micAudioContextRef.current.close().catch(() => {});
      micAudioContextRef.current = null;
    }
  }, []);

  const stopSpeakerMonitoring = useCallback(() => {
    if (speakerFrameRef.current) {
      cancelAnimationFrame(speakerFrameRef.current);
      speakerFrameRef.current = null;
    }

    speakerSourceRef.current?.disconnect();
    speakerSourceRef.current = null;
    speakerAnalyserRef.current = null;

    if (speakerContextRef.current) {
      void speakerContextRef.current.close().catch(() => {});
      speakerContextRef.current = null;
    }
  }, []);

  const stopAudioPlayback = useCallback(() => {
    speakerAudioRef.current?.pause();
    speakerAudioRef.current = null;

    if (speakerObjectUrlRef.current) {
      URL.revokeObjectURL(speakerObjectUrlRef.current);
      speakerObjectUrlRef.current = null;
    }

    stopSpeakerMonitoring();
  }, [stopSpeakerMonitoring]);

  const stopRecording = useCallback(() => {
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }

    const recorder = mediaRecorderRef.current;

    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    mediaRecorderRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    stopMicMonitoring();
  }, [stopMicMonitoring]);

  const cleanupVoiceMode = useCallback(() => {
    shouldAutoLoopRef.current = false;

    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.ondataavailable = null;
    }

    stopRecording();
    stopAudioPlayback();
    pendingAssistantCountRef.current = null;
    setVolume(0);
    setOrbState("idle");
    setCaption("Listening will start automatically");
  }, [stopAudioPlayback, stopRecording]);

  const monitorAnalyser = useCallback(
    (
      analyser: AnalyserNode,
      frameRef: React.MutableRefObject<number | null>,
      onSilence?: () => void
    ) => {
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        let sum = 0;

        for (const value of data) {
          sum += value * value;
        }

        const normalized = Math.min(
          Math.sqrt(sum / Math.max(data.length, 1)) / 160,
          1
        );

        setVolume((current) => current + (normalized - current) * 0.35);

        if (normalized < 0.01) {
          if (!silenceTimeoutRef.current && onSilence) {
            silenceTimeoutRef.current = setTimeout(() => {
              onSilence();
            }, 2000);
          }
        } else if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }

        frameRef.current = requestAnimationFrame(tick);
      };

      tick();
    },
    []
  );

  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    const formData = new FormData();
    const extension =
      currentMimeTypeRef.current.includes("mp4") ||
      currentMimeTypeRef.current.includes("m4a")
        ? "mp4"
        : "webm";

    formData.append("file", audioBlob, `voice-message.${extension}`);

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/transcribe`,
      {
        method: "POST",
        body: formData,
      }
    );

    const payload = (await response.json().catch(() => null)) as {
      text?: string;
      error?: string;
    } | null;

    if (!response.ok) {
      throw new Error(payload?.error || "Failed to transcribe audio");
    }

    return payload?.text?.trim() ?? "";
  }, []);

  const speakText = useCallback(
    async (text: string, assistantMessageId: string) => {
      stopAudioPlayback();
      setOrbState("speaking");
      setCaption("Speaking...");
      console.log("开始TTS");

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/speech`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Failed to generate speech");
      }

      const audioBlob = await response.blob();
      const objectUrl = URL.createObjectURL(audioBlob);
      speakerObjectUrlRef.current = objectUrl;

      const audio = new Audio(objectUrl);
      speakerAudioRef.current = audio;

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;

      const source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContext.destination);

      speakerContextRef.current = audioContext;
      speakerAnalyserRef.current = analyser;
      speakerSourceRef.current = source;
      monitorAnalyser(analyser, speakerFrameRef);

      audio.onended = () => {
        lastSpokenAssistantIdRef.current = assistantMessageId;
        setVolume(0);
        setOrbState("idle");
        setCaption("Listening again...");
        stopAudioPlayback();

        if (shouldAutoLoopRef.current) {
          window.setTimeout(() => {
            void startListeningRef.current?.();
          }, 500);
        }
      };

      audio.onerror = () => {
        setVolume(0);
        setOrbState("error");
        setCaption("Playback failed");
        stopAudioPlayback();
      };

      await audioContext.resume();
      await audio.play();
    },
    [monitorAnalyser, stopAudioPlayback]
  );

  const startListening = useCallback(async () => {
    if (!isOpen) {
      return;
    }

    silenceTimeoutRef.current = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Voice recording is not supported in this browser.");
      return;
    }

    try {
      stopAudioPlayback();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getSupportedRecordingMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      currentMimeTypeRef.current =
        recorder.mimeType || mimeType || "audio/webm";
      mediaRecorderRef.current = recorder;
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      micAudioContextRef.current = audioContext;
      micAnalyserRef.current = analyser;
      micSourceRef.current = source;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        if (!isMountedRef.current) return;
        console.log("录音完成，开始转文字");
        const audioBlob = new Blob(audioChunksRef.current, {
          type: currentMimeTypeRef.current || "audio/webm",
        });
        audioChunksRef.current = [];

        try {
          setOrbState("connecting");
          setCaption("Transcribing...");
          setVolume(0);

          const text = await transcribeAudio(audioBlob);
          console.log("转文字结果：" + text);

          if (!text) {
            setOrbState("idle");
            setCaption("I couldn't hear anything. Listening again...");
            if (shouldAutoLoopRef.current) {
              window.setTimeout(() => {
                void startListeningRef.current?.();
              }, 500);
            }
            return;
          }

          const assistantCountBefore = assistantCountRef.current;
          pendingAssistantCountRef.current = assistantCountBefore;
          setOrbState("connecting");
          setCaption("Thinking...");

          console.log("发送消息：" + text);
          sendMessage({
            role: "user",
            parts: [{ type: "text", text }],
          });
        } catch (error) {
          console.error("Voice transcription failed:", error);
          setOrbState("error");
          setCaption(
            error instanceof Error
              ? error.message
              : "Voice transcription failed"
          );
          toast.error(
            error instanceof Error
              ? error.message
              : "Voice transcription failed"
          );
        }
      };

      monitorAnalyser(analyser, micFrameRef, stopRecording);
      await audioContext.resume();
      recorder.start();
      setOrbState("listening");
      setCaption("Listening...");
    } catch (error) {
      console.error("Voice recording failed:", error);
      stopRecording();
      setOrbState("error");
      setCaption("Microphone access failed");
      toast.error(
        "Microphone access failed. Please check browser permissions."
      );
    }
  }, [
    isOpen,
    monitorAnalyser,
    sendMessage,
    stopAudioPlayback,
    stopRecording,
    transcribeAudio,
  ]);

  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const stopListening = useCallback(() => {
    if (orbState === "listening") {
      shouldAutoLoopRef.current = false;
      setCaption("Processing...");
      stopRecording();
    } else if (orbState === "speaking") {
      shouldAutoLoopRef.current = false;
      stopAudioPlayback();
      setVolume(0);
      setOrbState("idle");
      setCaption("Listening stopped");
    }
  }, [orbState, stopAudioPlayback, stopRecording]);

  useEffect(() => {
    if (!isOpen) {
      cleanupVoiceMode();
      return;
    }

    shouldAutoLoopRef.current = true;
    setCaption("Starting voice mode...");

    window.setTimeout(() => {
      if (shouldAutoLoopRef.current) {
        void startListening();
      }
    }, 150);
  }, [cleanupVoiceMode, isOpen, startListening]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const pendingAssistantCount = pendingAssistantCountRef.current;

    if (pendingAssistantCount === null || status !== "ready") {
      return;
    }

    if (assistantMessages.length <= pendingAssistantCount) {
      return;
    }

    const latestAssistant = [...assistantMessages].reverse().find((message) => {
      const text = getTextFromMessage(message);
      return text.length > 0 && message.id !== lastSpokenAssistantIdRef.current;
    });

    if (!latestAssistant) {
      pendingAssistantCountRef.current = null;
      setOrbState("idle");
      setCaption("Listening again...");
      if (shouldAutoLoopRef.current) {
        window.setTimeout(() => {
          void startListening();
        }, 400);
      }
      return;
    }

    pendingAssistantCountRef.current = null;
    const text = getTextFromMessage(latestAssistant);
    console.log("AI回复：" + text);

    void speakText(text, latestAssistant.id).catch((error) => {
      console.error("Voice playback failed:", error);
      setOrbState("error");
      setCaption(
        error instanceof Error
          ? error.message
          : "Failed to read the reply aloud"
      );
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to read the reply aloud"
      );
    });
  }, [assistantMessages, isOpen, speakText, startListening, status]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cleanupVoiceMode();
    };
  }, [cleanupVoiceMode]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(119,255,214,0.10),transparent_30%),radial-gradient(circle_at_80%_18%,rgba(119,180,255,0.12),transparent_28%),radial-gradient(circle_at_50%_82%,rgba(255,255,255,0.05),transparent_35%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent_22%,transparent_78%,rgba(255,255,255,0.03))]" />

      <button
        className="absolute top-5 right-5 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
        onClick={onClose}
        type="button"
      >
        <CrossIcon />
      </button>

      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center justify-center px-6">
        <div className="mb-10 flex items-center justify-center">
          <Orb
            onStart={() => {
              void startListening();
            }}
            onStop={stopListening}
            size={360}
            state={visualState}
            style={{
              color: "#ffffff",
              filter: "brightness(1.2) contrast(1.08)",
            }}
            theme="bars"
            volume={visualVolume}
          />
        </div>

        <div className="max-w-xl text-center">
          <p className="mb-3 font-medium text-[2rem] tracking-[-0.04em] text-white">
            {orbState === "listening"
              ? "Listening"
              : orbState === "speaking"
                ? "Speaking"
                : orbState === "connecting"
                  ? "Thinking"
                  : orbState === "error"
                    ? "Something went wrong"
                    : "Voice mode"}
          </p>
          <p className="text-[15px] text-white/52">{caption}</p>
        </div>
      </div>
    </div>
  );
}
