import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@aulus/types";
import { Button } from "../../components/ui/button";
import { cn } from "../../lib/cn";
import { useChatQuery } from "../../queries/chats";
import { DraftAnswer, PersistedAnswer } from "./answer-view";
import { useChatStream } from "./use-chat-stream";

function Bubble({
  role,
  children,
}: {
  role: "user" | "assistant";
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        role === "user" ? "items-end" : "items-start",
      )}
    >
      <span className="px-1 font-mono text-[10px] uppercase tracking-wide text-muted">
        {role === "user" ? "You" : "Aulus"}
      </span>
      <div
        className={cn(
          "max-w-2xl rounded-2xl px-4 py-2.5",
          role === "user"
            ? "bg-accent text-accent-fg"
            : "border border-border bg-surface",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function PersistedMessage({ message }: { message: ChatMessage }) {
  if (message.role === "assistant") {
    return (
      <Bubble role="assistant">
        <PersistedAnswer
          content={message.content}
          citations={message.citations}
        />
      </Bubble>
    );
  }
  return (
    <Bubble role="user">
      <p className="whitespace-pre-wrap text-sm leading-relaxed">
        {message.content}
      </p>
    </Bubble>
  );
}

function Composer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (content: string) => void;
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="border-t border-border bg-surface p-3">
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            // Ignore Enter while composing (IME candidate selection).
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={
            disabled ? "Answering…" : "Ask a question about this Scope…"
          }
          aria-label="Message"
          className="max-h-40 min-h-9 flex-1 resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <Button type="button" onClick={submit} disabled={disabled}>
          Send
        </Button>
      </div>
      <p className="mt-1 px-1 text-[11px] text-muted">
        Enter to send · Shift+Enter for a newline · one answer at a time
      </p>
    </div>
  );
}

export function Conversation({ chatId }: { chatId: string }) {
  const query = useChatQuery(chatId);
  const { turn, send } = useChatStream(chatId);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = query.data?.messages ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, turn.draft, turn.pendingUser]);

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
          {query.isError && (
            <p className="text-sm text-tone-error">Couldn't load this chat.</p>
          )}
          {!query.isPending && messages.length === 0 && !turn.pendingUser && (
            <p className="text-sm text-muted">
              Ask the first question to ground an answer in this Scope.
            </p>
          )}

          {messages.map((message) => (
            <PersistedMessage key={message.id} message={message} />
          ))}

          {turn.pendingUser && (
            <Bubble role="user">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {turn.pendingUser}
              </p>
            </Bubble>
          )}

          {turn.streaming && (
            <Bubble role="assistant">
              {turn.draft.length === 0 ? (
                <p className="text-sm text-muted">
                  {turn.phase === "generating"
                    ? "Writing the answer…"
                    : turn.phase === "answering"
                      ? "Answering…"
                      : "Searching the transcripts…"}
                </p>
              ) : (
                <DraftAnswer text={turn.draft} citations={turn.citations} />
              )}
            </Bubble>
          )}

          {turn.error && (
            <p className="text-sm text-tone-error" role="alert">
              {turn.error}
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl">
        <Composer disabled={turn.streaming} onSend={send} />
      </div>
    </div>
  );
}
