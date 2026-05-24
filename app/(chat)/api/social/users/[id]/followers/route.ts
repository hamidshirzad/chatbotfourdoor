import { auth } from '@/app/(auth)/auth';
import { getFollowers } from '@/lib/db/dynamo-queries';

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
    const followers = await getFollowers(userId);
    return Response.json(followers);
  } catch {
    return new Response('Failed to fetch followers', { status: 500 });
  }
}
