import { auth } from '@/app/(auth)/auth';
import { blockUser, unblockUser } from '@/lib/db/dynamo-queries';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: blockedId } = await params;

  if (blockedId === session.user.id) {
    return new Response('Cannot block yourself', { status: 400 });
  }

  try {
    await blockUser(session.user.id, blockedId);
    return new Response('Blocked', { status: 201 });
  } catch {
    return new Response('Failed to block user', { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id: blockedId } = await params;

  try {
    await unblockUser(session.user.id, blockedId);
    return new Response('Unblocked', { status: 200 });
  } catch {
    return new Response('Failed to unblock user', { status: 500 });
  }
}
