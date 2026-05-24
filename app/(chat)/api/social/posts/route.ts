import { auth } from '@/app/(auth)/auth';
import { createPost, getFeed } from '@/lib/db/dynamo-queries';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? 20);

  try {
    const { items, lastKey } = await getFeed(limit);
    return Response.json({ items, lastKey });
  } catch {
    return new Response('Failed to fetch feed', { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { content, mediaUrls, caption } = await request.json();
    if (!content) {
      return new Response('content is required', { status: 400 });
    }
    const post = await createPost(session.user.id, content, mediaUrls, caption);
    return Response.json(post, { status: 201 });
  } catch {
    return new Response('Failed to create post', { status: 500 });
  }
}
