import { z } from 'zod';

export const MESSAGE_MAX = 4000;
export const MESSAGES_PAGE_SIZE = 50;

/** POST /api/workspaces/:wid/conversations — karşı tarafla konuşmayı açar ya da var olanı döner. */
export const OpenConversationRequestSchema = z.object({ userId: z.uuid() });
export type OpenConversationRequest = z.infer<typeof OpenConversationRequestSchema>;

export const SendMessageRequestSchema = z.object({
  body: z.string().trim().min(1).max(MESSAGE_MAX),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

const Person = z.object({
  id: z.uuid(),
  name: z.string(),
  avatarVersion: z.string().nullable(),
});

export const ConversationSchema = z.object({
  id: z.uuid(),
  with: Person,
  lastMessage: z
    .object({
      body: z.string(),
      at: z.iso.datetime(),
      mine: z.boolean(),
    })
    .nullable(),
  unreadCount: z.int(),
});
export type Conversation = z.infer<typeof ConversationSchema>;

export const ConversationsResponseSchema = z.object({
  conversations: z.array(ConversationSchema),
  /** Tüm konuşmalardaki okunmamış toplamı (kenar çubuğu rozeti). */
  unreadCount: z.int(),
});
export type ConversationsResponse = z.infer<typeof ConversationsResponseSchema>;

export const MessageSchema = z.object({
  id: z.uuid(),
  mine: z.boolean(),
  body: z.string(),
  at: z.iso.datetime(),
  deleted: z.boolean(),
});
export type Message = z.infer<typeof MessageSchema>;

/** En eski → en yeni sıralı sayfa; `hasMore` daha eski mesaj olduğunu söyler. */
export const MessagesResponseSchema = z.object({
  with: Person,
  messages: z.array(MessageSchema),
  hasMore: z.boolean(),
});
export type MessagesResponse = z.infer<typeof MessagesResponseSchema>;
