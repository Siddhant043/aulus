const inFlightChats = new Set<string>();

export function tryAcquireChatLock(chatId: string): boolean {
  if (inFlightChats.has(chatId)) {
    return false;
  }
  inFlightChats.add(chatId);
  return true;
}

export function releaseChatLock(chatId: string): void {
  inFlightChats.delete(chatId);
}

export function resetChatLocksForTests(): void {
  inFlightChats.clear();
}
