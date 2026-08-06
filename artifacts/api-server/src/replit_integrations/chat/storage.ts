// NOTE: The chat integration requires `conversations` and `messages` DB tables that
// are not present in this deployment's schema. All methods throw at runtime until
// the schema is extended and migrations are run.

export interface Conversation {
  id: number;
  title: string;
  createdAt: Date;
}

export interface Message {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: Date;
}

export interface IChatStorage {
  getConversation(id: number): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;
  createConversation(title: string): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<Message>;
}

const notImplemented = (): never => {
  throw new Error(
    "Chat storage is not available: the conversations/messages tables have not been created in this deployment."
  );
};

export const chatStorage: IChatStorage = {
  getConversation: () => notImplemented(),
  getAllConversations: () => notImplemented(),
  createConversation: () => notImplemented(),
  deleteConversation: () => notImplemented(),
  getMessagesByConversation: () => notImplemented(),
  createMessage: () => notImplemented(),
};
