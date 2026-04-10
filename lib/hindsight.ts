import {
  HindsightClient,
  recallResponseToPromptString,
} from "@vectorize-io/hindsight-client";

const HINDSIGHT_BASE_URL = "https://api.hindsight.vectorize.io";

export const hindsightClient = new HindsightClient({
  baseUrl: HINDSIGHT_BASE_URL,
  apiKey: process.env.HINDSIGHT_API_KEY,
});

export async function recallMemoriesForPrompt(
  bankId: string,
  query: string
): Promise<string | null> {
  if (!query.trim()) {
    return null;
  }

  const response = await hindsightClient.recall(bankId, query, {
    budget: "mid",
  });

  const memoryPrompt = recallResponseToPromptString(response).trim();

  return memoryPrompt.length > 0 ? memoryPrompt : null;
}
