import { auth } from '@/app/(auth)/auth';
import { getFollowing } from '@/lib/db/dynamo-queries';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: userId } = await params;

  try {
    const following = await getFollowing(userId);
    return Response.json(following);
  } catch {
    return new Response('Failed to fetch following', { status: 500 });
  }
}
