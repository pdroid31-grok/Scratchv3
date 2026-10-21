import type { AvatarId } from "./avatars";

export const STEVO_CHAT_ID = "SXFdEpGdjeutcnOQfMQw0EOxWGa6ysGD";
export const CEO_BOARD_ID = "Sth5J7JYgRUEnwGxVWFVh3foFcPf9Erh";

export type LeagueChatLine = {
  id: number;
  userId: string;
  name: string;
  avatarId: AvatarId;
  text: string;
  at: string;
};

export type LeagueChatUnread = {
  unread: number;
};

export function isStevoChatUser(id?: string | null, _name?: string | null): boolean {
  return Boolean(id && id === STEVO_CHAT_ID);
}

export function isCeoBoardUser(id?: string | null): boolean {
  return Boolean(id && id === CEO_BOARD_ID);
}
