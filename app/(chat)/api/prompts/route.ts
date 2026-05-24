import { auth } from '@/app/(auth)/auth';
import {
  createPrompt,
  listPrompts,
} from '@/lib/ai/bedrock-prompt-management';

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const prompts = await listPrompts();
    return Response.json(prompts);
  } catch (error) {
    return new Response('Failed to list prompts', { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = await request.json();
    const result = await createPrompt(body);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return new Response('Failed to create prompt', { status: 500 });
  }
}
