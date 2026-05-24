import { auth } from '@/app/(auth)/auth';
import { getUserById } from '@/lib/db/queries';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  try {
    const user = await getUserById(id);
    if (!user) return new Response('User not found', { status: 404 });

    const { password: _, ...safeUser } = user;
    return Response.json(safeUser);
  } catch {
    return new Response('Failed to fetch user', { status: 500 });
  }
}
