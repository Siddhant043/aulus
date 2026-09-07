import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CitationRef } from "@aulus/types";
import { ApiError, streamChatMessage } from "../../lib/api";

export type ChatTurn = {
  /** The user message being answered, shown optimistically while streaming. */
  pendingUser: string | null;
  streaming: boolean;
  phase: string | null;
  /** Raw accumulated answer text (carries `[[chunk:]]` markers). */
  draft: string;
  citations: CitationRef[];
  error: string | null;
};

const IDLE: ChatTurn = {
  pendingUser: null,
  streaming: false,
  phase: null,
  draft: "",
  citations: [],
  error: null,
};

/**
 * Drives a single streaming answer for a Chat. Enforces one in-flight answer at
 * a time client-side (the API also rejects concurrent sends with 409). On
 * completion it refetches the Chat so the persisted messages replace the draft.
 */
export function useChatStream(chatId: string) {
  const queryClient = useQueryClient();
  const [turn, setTurn] = useState<ChatTurn>(IDLE);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  // Abort an in-flight stream on unmount (e.g. switching Chats) so it stops
  // reading and never calls setState on an unmounted component.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const send = useCallback(
    async (content: string) => {
      if (turn.streaming) {
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      const safeSetTurn: typeof setTurn = (update) => {
        if (mountedRef.current) {
          setTurn(update);
        }
      };
      safeSetTurn({
        pendingUser: content,
        streaming: true,
        phase: null,
        draft: "",
        citations: [],
        error: null,
      });

      try {
        let streamError: string | null = null;
        for await (const event of streamChatMessage(
          chatId,
          content,
          controller.signal,
        )) {
          if (event.type === "status") {
            safeSetTurn((t) => ({ ...t, phase: event.phase }));
          } else if (event.type === "token") {
            safeSetTurn((t) => ({ ...t, draft: t.draft + event.text }));
          } else if (event.type === "citations") {
            safeSetTurn((t) => ({ ...t, citations: event.citations }));
          } else if (event.type === "error") {
            streamError = event.message;
          }
        }
        if (streamError) {
          // Keep the question and partial answer visible alongside the error.
          safeSetTurn((t) => ({ ...t, streaming: false, error: streamError }));
          return;
        }
        // Persisted messages now include this turn; swap the draft for them.
        await queryClient.invalidateQueries({ queryKey: ["chats", chatId] });
        safeSetTurn(IDLE);
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : "The answer stream failed. Try again.";
        safeSetTurn((t) => ({ ...t, streaming: false, error: message }));
      } finally {
        abortRef.current = null;
      }
    },
    [chatId, queryClient, turn.streaming],
  );

  return { turn, send };
}
