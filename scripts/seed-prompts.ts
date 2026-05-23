/**
 * One-time script: publishes the current hardcoded prompts to AWS Bedrock
 * Prompt Management and prints the resulting IDs.
 *
 * Usage: npx tsx scripts/seed-prompts.ts
 *
 * Requires env vars: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *
 * After running, copy the printed IDs into your .env:
 *   BEDROCK_SYSTEM_PROMPT_ID=<id printed for "system-prompt">
 */

import { createPrompt, createPromptVersion } from '../lib/ai/bedrock-prompt-management';
import { systemPrompt, blocksPrompt } from '../lib/ai/prompts-static';

async function seed() {
  console.log('Publishing system-prompt to Bedrock Prompt Management...');

  const systemPromptResult = await createPrompt({
    name: 'system-prompt',
    description: 'Main system prompt used by the chatbot at runtime.',
    variants: [
      {
        name: 'default',
        templateType: 'CHAT',
        templateConfiguration: {
          chat: {
            system: [{ text: systemPrompt }],
            messages: [],
            inputVariables: [],
          },
        },
      },
    ],
    defaultVariant: 'default',
  });

  console.log(`Created system-prompt  id=${systemPromptResult.id}`);

  const systemVersion = await createPromptVersion(systemPromptResult.id!, 'Initial version');
  console.log(`Created system-prompt version=${systemVersion.version}`);

  console.log('\nPublishing blocks-prompt to Bedrock Prompt Management...');

  const blocksPromptResult = await createPrompt({
    name: 'blocks-prompt',
    description: 'Blocks UI instructions appended to the system prompt.',
    variants: [
      {
        name: 'default',
        templateType: 'TEXT',
        templateConfiguration: {
          text: {
            text: blocksPrompt,
            inputVariables: [],
          },
        },
      },
    ],
    defaultVariant: 'default',
  });

  console.log(`Created blocks-prompt  id=${blocksPromptResult.id}`);

  const blocksVersion = await createPromptVersion(blocksPromptResult.id!, 'Initial version');
  console.log(`Created blocks-prompt version=${blocksVersion.version}`);

  console.log('\nDone. Add the following to your .env:');
  console.log(`BEDROCK_SYSTEM_PROMPT_ID=${systemPromptResult.id}`);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
