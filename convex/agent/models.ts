import { createOpenAI } from "@ai-sdk/openai";

/**
 * Central model configuration for the Vector AI agent (Track D).
 *
 * Uses NVIDIA's OpenAI-compatible API with Nemotron 3 Ultra.
 *
 * The provider reads NVIDIA_API_KEY lazily at request time, so these
 * module-level instances are safe to construct on deployments where the key
 * is not yet set — only actual LLM calls will fail.
 */
const nvidia = createOpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: "https://integrate.api.nvidia.com/v1",
});

export const CHAT_MODEL_ID = "nvidia/nemotron-3-ultra-550b-a55b";

/** NVIDIA embedding model — use one that outputs 1536 dims to match the vector index. */
export const EMBEDDING_MODEL_ID = "nvidia/nv-embed-v1";

export const chatModel = nvidia.chat(CHAT_MODEL_ID);

export const embeddingModel = nvidia.embedding(EMBEDDING_MODEL_ID);

export function isAiConfigured(): boolean {
  return Boolean(process.env.NVIDIA_API_KEY);
}

export const AI_NOT_CONFIGURED_MESSAGE =
  "The AI agent is not configured yet: the NVIDIA_API_KEY environment variable is missing on the Convex deployment.";

export function assertAiConfigured(): void {
  if (!isAiConfigured()) {
    throw new Error(AI_NOT_CONFIGURED_MESSAGE);
  }
}