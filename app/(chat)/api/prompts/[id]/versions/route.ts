import { auth } from '@/app/(auth)/auth';
import { createPromptVersion } from '@/lib/ai/bedrock-prompt-management';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;

  let description: string | undefined;
  try {
    const body = await request.json();
    description = body.description;
  } catch {
    // description is optional; ignore parse errors
  }

  try {
    const version = await createPromptVersion(id, description);
    return Response.json(version, { status: 201 });
  } catch (error) {
    return new Response('Failed to create prompt version', { status: 500 });
  }
}
