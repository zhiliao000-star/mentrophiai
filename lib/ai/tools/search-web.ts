import { tool } from "ai";
import { z } from "zod";

export const searchWeb = tool({
  description:
    "Search the web for relevant information using Tavily. Use this when you need fresh or external information from the web.",
  inputSchema: z.object({
    query: z.string().min(1).describe("The search query to look up on the web"),
  }),
  execute: async (input) => {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query: input.query,
        search_depth: "advanced",
        include_answer: true,
        include_raw_content: false,
        max_results: 6,
      }),
    });

    if (!response.ok) {
      return {
        error: `Tavily search failed with status ${response.status}`,
      };
    }

    const data = await response.json();
    const results = Array.isArray(data.results)
      ? data.results.map((result: any) => ({
          title: result.title,
          url: result.url,
          content: result.content,
          score: result.score,
        }))
      : [];

    return {
      results,
    };
  },
});

export default searchWeb;
