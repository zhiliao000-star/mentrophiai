import { Sandbox } from "@e2b/code-interpreter";
import { tool } from "ai";
import { z } from "zod";

const languageSchema = z.enum(["python", "javascript", "typescript", "bash"]);

export const executeCode = tool({
  description:
    "Execute code inside an isolated E2B sandbox to verify logic, inspect outputs, run calculations, or test snippets. Use this when running code would produce a more accurate answer than reasoning alone.",
  inputSchema: z.object({
    language: languageSchema.describe(
      "Language to run in the E2B sandbox."
    ),
    code: z.string().min(1).describe("The code to execute."),
  }),
  execute: async ({ language, code }) => {
    if (!process.env.E2B_API_KEY) {
      return {
        error: "E2B_API_KEY is not configured.",
      };
    }

    const sandbox = await Sandbox.create();

    try {
      const execution = await sandbox.runCode(code, {
        language,
        timeoutMs: 30_000,
      });

      if (execution.error) {
        return {
          error: `${execution.error.name}: ${execution.error.value}`,
          traceback: execution.error.traceback,
          stdout: execution.logs.stdout,
          stderr: execution.logs.stderr,
        };
      }

      return {
        language,
        stdout: execution.logs.stdout,
        stderr: execution.logs.stderr,
        text: execution.text ?? null,
        results: execution.results.map((result) => result.toJSON()),
      };
    } finally {
      await (sandbox as { kill?: () => Promise<void> }).kill?.();
    }
  },
});

export default executeCode;
