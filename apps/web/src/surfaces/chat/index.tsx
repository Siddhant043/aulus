import type { ReactNode } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { ChatList } from "./chat-list";
import { Conversation } from "./conversation";
import { ScopePicker } from "./scope-picker";
import { ApiError } from "../../lib/api";
import { useCreateChatMutation } from "../../queries/chats";

function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-full grid-cols-[16rem_1fr]">
      <ChatList />
      {children}
    </div>
  );
}

/** /chats — no Chat selected: pick a Scope and start one. */
export function ChatIndex() {
  const navigate = useNavigate();
  const createChat = useCreateChatMutation();

  return (
    <ChatLayout>
      <div className="mx-auto flex w-full max-w-lg flex-col justify-center gap-4 p-6">
        <div>
          <h1 className="text-lg font-semibold text-text">Chat</h1>
          <p className="text-sm text-muted">
            Ask questions grounded in your transcripts, with citations back to
            the exact video and timestamp.
          </p>
        </div>
        <ScopePicker
          pending={createChat.isPending}
          error={
            createChat.error instanceof ApiError
              ? createChat.error.message
              : createChat.error
                ? "Couldn't start the chat."
                : null
          }
          onCreate={(scope) =>
            createChat.mutate(scope, {
              onSuccess: (chat) =>
                navigate({
                  to: "/chats/$chatId",
                  params: { chatId: chat.id },
                }),
            })
          }
        />
      </div>
    </ChatLayout>
  );
}

/** /chats/$chatId — an open conversation. */
export function ChatDetail() {
  const { chatId } = useParams({ from: "/chats/$chatId" });
  return (
    <ChatLayout>
      <Conversation key={chatId} chatId={chatId} />
    </ChatLayout>
  );
}
