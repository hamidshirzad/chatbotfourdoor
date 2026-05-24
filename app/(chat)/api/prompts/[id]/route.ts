import { auth } from '@/app/(auth)/auth';
import {
  getPrompt,
  deletePrompt,
} from '@/lib/ai/bedrock-prompt-management';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(_request.url);
  const version = searchParams.get('version') ?? undefined;

  try {
    const prompt = await getPrompt(id, version);
    return Response.json(prompt);
  } catch (error) {
    return new Response('Prompt not found', { status: 404 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const version = searchParams.get('version') ?? undefined;

  try {
    await deletePrompt(id, version);
    return new Response('Prompt deleted', { status: 200 });
  } catch (error) {
    return new Response('Failed to delete prompt', { status: 500 });
  }
}
