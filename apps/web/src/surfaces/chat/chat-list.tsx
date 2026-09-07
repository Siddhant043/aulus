import { Link, useParams } from "@tanstack/react-router";
import type { Chat } from "@aulus/types";
import { cn } from "../../lib/cn";
import { useChatsQuery, useDeleteChatMutation } from "../../queries/chats";
import { useSourcesQuery } from "../../queries/sources";
import { useCollectionsQuery } from "../../queries/collections";

function useScopeLabeller(): (chat: Chat) => string {
  const sources = useSourcesQuery();
  const collections = useCollectionsQuery();
  return (chat) => {
    const scope = chat.scope;
    if (scope.kind === "library") {
      return "Library";
    }
    if (scope.kind === "source") {
      const source = sources.data?.find((s) => s.id === scope.sourceId);
      return source?.title ?? source?.youtubeId ?? "Source";
    }
    const collection = collections.data?.find(
      (c) => c.id === scope.collectionId,
    );
    return collection?.name ?? "Collection";
  };
}

export function ChatList() {
  const chats = useChatsQuery();
  const labelScope = useScopeLabeller();
  const deleteChat = useDeleteChatMutation();
  const active = useParams({ strict: false }) as { chatId?: string };

  return (
    <div className="flex h-full flex-col gap-2 border-r border-border bg-surface p-3">
      <Link
        to="/chats"
        className="rounded-md border border-border-strong bg-surface px-3 py-2 text-center text-sm font-medium text-text transition-colors hover:bg-surface-2 [&.active]:border-accent"
        activeOptions={{ exact: true }}
      >
        + New chat
      </Link>

      <div className="mt-1 flex-1 overflow-y-auto">
        {chats.isPending ? (
          <p className="px-2 text-sm text-muted">Loading…</p>
        ) : chats.data && chats.data.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {chats.data.map((chat) => (
              <li key={chat.id} className="group relative">
                <Link
                  to="/chats/$chatId"
                  params={{ chatId: chat.id }}
                  className={cn(
                    "block rounded-md px-3 py-2 pr-8 text-sm transition-colors",
                    "text-muted hover:bg-surface-2 hover:text-text",
                    active.chatId === chat.id &&
                      "bg-surface-2 font-medium text-text",
                  )}
                >
                  <span className="block truncate">{labelScope(chat)}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted/70">
                    {chat.scope.kind}
                  </span>
                </Link>
                <button
                  type="button"
                  aria-label="Delete chat"
                  onClick={() => deleteChat.mutate(chat.id)}
                  className="absolute right-1.5 top-1.5 hidden rounded px-1.5 py-0.5 text-xs text-muted hover:bg-surface hover:text-tone-error group-hover:block"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 text-sm text-muted">No chats yet.</p>
        )}
      </div>
    </div>
  );
}
