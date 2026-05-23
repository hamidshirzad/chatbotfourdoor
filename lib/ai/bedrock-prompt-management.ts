import {
  BedrockAgentClient,
  CreatePromptCommand,
  type CreatePromptCommandInput,
  GetPromptCommand,
  ListPromptsCommand,
  CreatePromptVersionCommand,
  DeletePromptCommand,
} from '@aws-sdk/client-bedrock-agent';

import { systemPrompt } from './prompts-static';

const client = new BedrockAgentClient({
  region: process.env.AWS_REGION ?? 'us-east-1',
});

// ---------------------------------------------------------------------------
// Variable substitution
// ---------------------------------------------------------------------------

export function fillVariables(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

// ---------------------------------------------------------------------------
// CRUD helpers
// ---------------------------------------------------------------------------

export async function createPrompt(params: CreatePromptCommandInput) {
  const response = await client.send(new CreatePromptCommand(params));
  return response;
}

export async function getPrompt(id: string, version?: string) {
  const response = await client.send(
    new GetPromptCommand({ promptIdentifier: id, promptVersion: version }),
  );
  return response;
}

export async function listPrompts() {
  const response = await client.send(new ListPromptsCommand({}));
  return response.promptSummaries ?? [];
}

export async function createPromptVersion(id: string, description?: string) {
  const response = await client.send(
    new CreatePromptVersionCommand({
      promptIdentifier: id,
      description,
    }),
  );
  return response;
}

export async function deletePrompt(id: string, version?: string) {
  const response = await client.send(
    new DeletePromptCommand({ promptIdentifier: id, promptVersion: version }),
  );
  return response;
}

// ---------------------------------------------------------------------------
// Runtime system-prompt fetch with TTL cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  text: string;
  expiresAt: number;
}

let cache: CacheEntry | null = null;
const TTL_MS = 5 * 60 * 1000;

export async function getSystemPromptText(): Promise<string> {
  const promptId = process.env.BEDROCK_SYSTEM_PROMPT_ID;
  if (!promptId) return systemPrompt;

  if (cache && Date.now() < cache.expiresAt) {
    return cache.text;
  }

  try {
    const prompt = await getPrompt(promptId);
    const variant = prompt.variants?.[0];
    let text = systemPrompt;

    if (variant?.templateType === 'TEXT') {
      const tmpl = variant.templateConfiguration as { text?: { text?: string } };
      text = tmpl?.text?.text ?? systemPrompt;
    } else if (variant?.templateType === 'CHAT') {
      const tmpl = variant.templateConfiguration as {
        chat?: { system?: Array<{ text?: string }> };
      };
      text = tmpl?.chat?.system?.[0]?.text ?? systemPrompt;
    }

    cache = { text, expiresAt: Date.now() + TTL_MS };
    return text;
  } catch {
    return systemPrompt;
  }
}

// Exported for tests that need to reset cache state between runs.
export function clearPromptCache() {
  cache = null;
}
