// Define your models here.

export interface Model {
  id: string;
  label: string;
  apiIdentifier: string;
  description: string;
}

export const models: Array<Model> = [
  {
    id: 'claude-haiku-4-5',
    label: 'Claude Haiku 4.5',
    apiIdentifier: 'claude-haiku-4-5-20251001',
    description: 'Fast, lightweight model for quick tasks',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    apiIdentifier: 'claude-sonnet-4-6',
    description: 'For complex, multi-step tasks',
  },
] as const;

export const DEFAULT_MODEL_NAME: string = 'claude-haiku-4-5';
