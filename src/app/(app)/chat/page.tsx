import { requireUser } from '@/lib/auth';
import { listRecent, markRead } from '@/lib/chat';
import { now } from '@/lib/time';
import ChatRoom from './ChatRoom';

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const user = await requireUser();
  const t = await now();
  const { messages, hasMore } = await listRecent(t);
  // Opening the room reads everything up to the newest message (clears the badge).
  if (messages.length > 0) await markRead(user.id, messages[messages.length - 1].id);
  return (
    <>
      <h1 className="sr-only">Chat</h1>
      <ChatRoom initialMessages={messages} initialHasMore={hasMore} viewerId={user.id} />
    </>
  );
}
