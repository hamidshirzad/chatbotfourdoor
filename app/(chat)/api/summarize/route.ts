import { auth } from '@/app/(auth)/auth';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';

const SUMMARIZE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/summarize-thread`;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { chatId } = await request.json();
  if (!chatId) {
    return new Response('chatId is required', { status: 400 });
  }

  const chat = await getChatById({ id: chatId });
  if (!chat || chat.userId !== session.user.id) {
    return new Response('Not found', { status: 404 });
  }

  const messages = await getMessagesByChatId({ id: chatId });

  const thread = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));

  const response = await fetch(SUMMARIZE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ thread }),
  });

  if (!response.ok) {
    return new Response('Summarization failed', { status: response.status });
  }

  const data = await response.json();
  return Response.json(data);
}
