import { DEFAULT_CHAT_MODEL, getCapabilities } from "@/lib/ai/models";

export async function GET() {
  const headers = {
    "Cache-Control": "public, max-age=86400, s-maxage=86400",
  };

  const curatedCapabilities = await getCapabilities();
  return Response.json(
    {
      capabilities: curatedCapabilities,
      models: [
        {
          id: DEFAULT_CHAT_MODEL,
          name: "Auto",
          provider: "deepseek",
          description: "Fixed model for chat",
        },
      ],
    },
    { headers }
  );
}
