import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { Chat, ChatScope, ChatWithMessages } from "@aulus/types";
import { createChat, deleteChat, getChat, listChats } from "../lib/api";

const chatsKey = ["chats"] as const;
const chatKey = (id: string) => ["chats", id] as const;

export function useChatsQuery(): UseQueryResult<Chat[]> {
  return useQuery({
    queryKey: chatsKey,
    queryFn: ({ signal }) => listChats(signal),
  });
}

export function useChatQuery(
  id: string | null,
): UseQueryResult<ChatWithMessages> {
  return useQuery({
    queryKey: chatKey(id ?? "none"),
    queryFn: ({ signal }) => getChat(id as string, signal),
    enabled: id !== null,
  });
}

export function useCreateChatMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (scope: ChatScope) => createChat(scope),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatsKey });
    },
  });
}

export function useDeleteChatMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteChat(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatsKey });
    },
  });
}
