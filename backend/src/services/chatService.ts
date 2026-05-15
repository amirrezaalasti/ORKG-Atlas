/**
 * Firestore-backed storage for chat conversations.
 *
 * Layout:
 *   ChatConversations/{conversationId}        → metadata (title, owner, model, templateId, …)
 *   ChatConversations/{conversationId}/Messages/{messageId} → individual messages
 *
 * A conversation is owned by a single Keycloak userId and only readable to
 * that user (or to readers via a one-time `shareToken`).
 */

import { db } from '../config/firebase.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: unknown;
  result?: unknown;
  status?: 'pending' | 'success' | 'error';
  startedAt?: number;
  finishedAt?: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  reasoning?: string;
  toolCalls?: ChatToolCall[];
  attachments?: Array<{
    type: 'orkg-resource' | 'orkg-paper' | 'orkg-comparison' | 'orkg-template';
    id: string;
    label?: string;
  }>;
  model?: string;
  provider?: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  ownerId: string;
  title: string;
  templateId?: string;
  provider?: string;
  model?: string;
  shareToken?: string;
  isPublic?: boolean;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

const CONV = 'ChatConversations';
const MSG = 'Messages';

const newId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

const toMillis = (val: unknown): number => {
  if (val instanceof Timestamp) return val.toMillis();
  if (typeof val === 'number') return val;
  return Date.now();
};

const conversationFromDoc = (
  snap: FirebaseFirestore.DocumentSnapshot
): Conversation | null => {
  if (!snap.exists) return null;
  const d = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    ownerId: String(d.ownerId ?? ''),
    title: String(d.title ?? 'Untitled'),
    templateId: typeof d.templateId === 'string' ? d.templateId : undefined,
    provider: typeof d.provider === 'string' ? d.provider : undefined,
    model: typeof d.model === 'string' ? d.model : undefined,
    shareToken: typeof d.shareToken === 'string' ? d.shareToken : undefined,
    isPublic: !!d.isPublic,
    createdAt: toMillis(d.createdAt),
    updatedAt: toMillis(d.updatedAt),
    messageCount: typeof d.messageCount === 'number' ? d.messageCount : 0,
  };
};

const messageFromDoc = (
  conversationId: string,
  snap: FirebaseFirestore.DocumentSnapshot
): ChatMessage | null => {
  if (!snap.exists) return null;
  const d = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    conversationId,
    role: (d.role as ChatRole) ?? 'user',
    content: String(d.content ?? ''),
    reasoning: typeof d.reasoning === 'string' ? d.reasoning : undefined,
    toolCalls: Array.isArray(d.toolCalls)
      ? (d.toolCalls as ChatToolCall[])
      : undefined,
    attachments: Array.isArray(d.attachments)
      ? (d.attachments as ChatMessage['attachments'])
      : undefined,
    model: typeof d.model === 'string' ? d.model : undefined,
    provider: typeof d.provider === 'string' ? d.provider : undefined,
    createdAt: toMillis(d.createdAt),
  };
};

export const chatService = {
  async listConversations(
    ownerId: string,
    limit = 50
  ): Promise<Conversation[]> {
    // Sort in memory to avoid requiring a composite (ownerId, updatedAt) index.
    // Conversation lists per user are small (typically <100), so the cost of
    // a single equality-filtered scan + JS sort is well below a roundtrip to
    // Firestore index admin and works immediately without deployment.
    const snap = await db
      .collection(CONV)
      .where('ownerId', '==', ownerId)
      .limit(Math.min(500, Math.max(limit * 4, 100)))
      .get();
    const items = snap.docs
      .map((d) => conversationFromDoc(d))
      .filter((c): c is Conversation => !!c)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
    return items;
  },

  async getConversation(conversationId: string): Promise<Conversation | null> {
    const snap = await db.collection(CONV).doc(conversationId).get();
    return conversationFromDoc(snap);
  },

  async getConversationByShareToken(
    token: string
  ): Promise<Conversation | null> {
    const snap = await db
      .collection(CONV)
      .where('shareToken', '==', token)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return conversationFromDoc(snap.docs[0]);
  },

  async createConversation(input: {
    ownerId: string;
    title?: string;
    templateId?: string;
    provider?: string;
    model?: string;
  }): Promise<Conversation> {
    const id = newId('conv');
    const now = Date.now();
    const data = {
      ownerId: input.ownerId,
      title: input.title?.trim() || 'New conversation',
      templateId: input.templateId ?? null,
      provider: input.provider ?? null,
      model: input.model ?? null,
      createdAt: Timestamp.fromMillis(now),
      updatedAt: Timestamp.fromMillis(now),
      messageCount: 0,
    };
    await db.collection(CONV).doc(id).set(data);
    return {
      id,
      ownerId: input.ownerId,
      title: data.title,
      templateId: input.templateId,
      provider: input.provider,
      model: input.model,
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };
  },

  async updateConversation(
    conversationId: string,
    patch: Partial<
      Pick<Conversation, 'title' | 'templateId' | 'provider' | 'model'>
    >
  ): Promise<void> {
    const allowed: Record<string, unknown> = { updatedAt: Timestamp.now() };
    if (patch.title !== undefined)
      allowed.title = patch.title.trim() || 'Untitled';
    if (patch.templateId !== undefined) allowed.templateId = patch.templateId;
    if (patch.provider !== undefined) allowed.provider = patch.provider;
    if (patch.model !== undefined) allowed.model = patch.model;
    await db.collection(CONV).doc(conversationId).update(allowed);
  },

  async deleteConversation(conversationId: string): Promise<void> {
    const msgsSnap = await db
      .collection(CONV)
      .doc(conversationId)
      .collection(MSG)
      .get();
    const batch = db.batch();
    msgsSnap.docs.forEach((d) => batch.delete(d.ref));
    batch.delete(db.collection(CONV).doc(conversationId));
    await batch.commit();
  },

  async toggleShare(
    conversationId: string,
    enable: boolean
  ): Promise<string | null> {
    const ref = db.collection(CONV).doc(conversationId);
    if (!enable) {
      await ref.update({
        shareToken: FieldValue.delete(),
        isPublic: false,
        updatedAt: Timestamp.now(),
      });
      return null;
    }
    const token = crypto.randomBytes(16).toString('hex');
    await ref.update({
      shareToken: token,
      isPublic: true,
      updatedAt: Timestamp.now(),
    });
    return token;
  },

  async appendMessage(
    conversationId: string,
    msg: Omit<ChatMessage, 'id' | 'conversationId' | 'createdAt'> & {
      createdAt?: number;
    }
  ): Promise<ChatMessage> {
    const id = newId('msg');
    const createdAt = msg.createdAt ?? Date.now();
    const data: Record<string, unknown> = {
      role: msg.role,
      content: msg.content,
      createdAt: Timestamp.fromMillis(createdAt),
    };
    if (msg.reasoning) data.reasoning = msg.reasoning;
    if (msg.toolCalls) data.toolCalls = msg.toolCalls;
    if (msg.attachments) data.attachments = msg.attachments;
    if (msg.model) data.model = msg.model;
    if (msg.provider) data.provider = msg.provider;

    const convRef = db.collection(CONV).doc(conversationId);
    const msgRef = convRef.collection(MSG).doc(id);
    await db.runTransaction(async (tx) => {
      tx.set(msgRef, data);
      tx.update(convRef, {
        updatedAt: Timestamp.fromMillis(createdAt),
        messageCount: FieldValue.increment(1),
      });
    });

    return { id, conversationId, createdAt, ...msg };
  },

  async listMessages(
    conversationId: string,
    limit = 200
  ): Promise<ChatMessage[]> {
    const snap = await db
      .collection(CONV)
      .doc(conversationId)
      .collection(MSG)
      .orderBy('createdAt', 'asc')
      .limit(limit)
      .get();
    return snap.docs
      .map((d) => messageFromDoc(conversationId, d)!)
      .filter((m): m is ChatMessage => !!m);
  },
};
