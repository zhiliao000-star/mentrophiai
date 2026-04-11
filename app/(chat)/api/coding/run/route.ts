import { Sandbox } from "@e2b/code-interpreter";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createPullRequest,
  getInstallationIdForUser,
  getInstallationToken,
  getRepoInfo,
} from "@/lib/coding/github";
import type { CodingEvent } from "@/lib/coding/types";
import { getAuthenticatedUser } from "@/lib/supabase/server";

const RunSchema = z.object({
  task: z.string().trim().min(1).max(4000),
  repoFullName: z.string().trim().min(1),
});

const DEFAULT_MODEL = "moonshotai/kimi-k2.5";

function createEventStream() {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const send = async (event: CodingEvent) => {
    const payload = `${JSON.stringify(event)}\n`;
    await writer.write(encoder.encode(payload));
  };

  const close = async () => {
    await writer.close();
  };

  return { stream, send, close };
}

async function runBash(
  sandbox: Sandbox,
  command: string,
  timeoutMs = 120_000
) {
  const execution = await sandbox.runCode(command, {
    language: "bash",
    timeoutMs,
  });

  const stdout = Array.isArray(execution.logs.stdout)
    ? execution.logs.stdout.join("")
    : execution.logs.stdout ?? "";
  const stderr = Array.isArray(execution.logs.stderr)
    ? execution.logs.stderr.join("")
    : execution.logs.stderr ?? "";

  if (execution.error) {
    throw new Error(
      `${execution.error.name}: ${execution.error.value}\n${stderr}`
    );
  }

  return stdout + stderr;
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = RunSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!process.env.E2B_API_KEY) {
    return NextResponse.json({ error: "Missing E2B_API_KEY" }, { status: 500 });
  }

  const installationId = getInstallationIdForUser();
  if (!installationId) {
    return NextResponse.json(
      { error: "Missing GitHub installation. Connect a GitHub App first." },
      { status: 400 }
    );
  }

  const { task, repoFullName } = parsed.data;
  const { stream, send, close } = createEventStream();
  const response = new Response(stream.readable, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-store",
    },
  });

  void (async () => {
    let sandbox: Sandbox | null = null;
    try {
      await send({ type: "status", message: "Starting coding session..." });
      await send({ type: "step", step: "reading repo", status: "active" });

      const repoInfo = await getRepoInfo(installationId, repoFullName);
      const token = await getInstallationToken(installationId);
      const branch = `claw/${Date.now()}`;

      sandbox = await Sandbox.create();
      const repoDir = "repo";
      const cloneUrl = `https://x-access-token:${token}@github.com/${repoFullName}.git`;

      await runBash(
        sandbox,
        `git clone ${cloneUrl} ${repoDir} && cd ${repoDir} && git checkout -b ${branch}`
      );
      await runBash(
        sandbox,
        `cd ${repoDir} && git config user.email "bot@mentrophi.ai" && git config user.name "Mentrophi Coding Agent"`
      );

      await send({ type: "step", step: "reading repo", status: "done" });
      await send({ type: "step", step: "planning changes", status: "active" });

      const openAiKey = process.env.OPENAI_API_KEY;
      const openAiBaseUrl = process.env.OPENAI_BASE_URL;

      if (!openAiKey || !openAiBaseUrl) {
        throw new Error("Missing OPENAI_API_KEY or OPENAI_BASE_URL");
      }

      const model =
        process.env.OPENAI_MODEL ||
        process.env.NIM_OPENAI_MODEL ||
        DEFAULT_MODEL;

      const clawCmdTemplate =
        process.env.CLAW_CODE_CMD ||
        "npx claw-code --prompt \"{task}\"";
      const escapedTask = task.replace(/\"/g, '\\"');
      const clawCommand = clawCmdTemplate.includes("{task}")
        ? clawCmdTemplate.replace("{task}", escapedTask)
        : `${clawCmdTemplate} "${escapedTask}"`;

      await send({ type: "step", step: "planning changes", status: "done" });
      await send({ type: "step", step: "editing files", status: "active" });

      const command = [
        `cd ${repoDir}`,
        `export OPENAI_API_KEY="${openAiKey}"`,
        `export OPENAI_BASE_URL="${openAiBaseUrl}"`,
        `export OPENAI_MODEL="${model}"`,
        `${clawCommand}`,
      ].join(" && ");

      const clawLogs = await runBash(sandbox, command, 300_000);
      await send({ type: "log", message: clawLogs.slice(-12_000) });

      await send({ type: "step", step: "editing files", status: "done" });
      await send({ type: "step", step: "running tests", status: "active" });

      const testLogs = await runBash(
        sandbox,
        `cd ${repoDir} && npm test -- --runInBand`,
        300_000
      ).catch((error) => {
        return `Tests failed or not configured: ${String(error)}`;
      });

      await send({ type: "log", message: testLogs.slice(-12_000) });
      await send({ type: "step", step: "running tests", status: "done" });

      await send({ type: "step", step: "committing changes", status: "active" });
      const statusOutput = await runBash(
        sandbox,
        `cd ${repoDir} && git status --porcelain`
      );
      const files = statusOutput
        .split("\n")
        .map((line: string) => line.trim())
        .filter(Boolean)
        .map((line: string) => line.replace(/^.. /, ""));

      if (files.length === 0) {
        await send({
          type: "result",
          branch: null,
          pullRequestUrl: null,
          summary: "No changes detected.",
        });
        await send({ type: "step", step: "committing changes", status: "done" });
        return;
      }

      await send({ type: "files", files });
      await runBash(sandbox, `cd ${repoDir} && git add -A`);
      await runBash(
        sandbox,
        `cd ${repoDir} && git commit -m "claw: ${escapedTask.slice(0, 60)}"`
      );
      await runBash(
        sandbox,
        `cd ${repoDir} && git push origin HEAD:${branch}`
      );
      await send({ type: "step", step: "committing changes", status: "done" });

      await send({ type: "step", step: "opening pull request", status: "active" });
      let prUrl: string | null = null;
      try {
        const pr = await createPullRequest(
          installationId,
          repoFullName,
          branch,
          repoInfo.defaultBranch,
          `claw: ${task.slice(0, 80)}`,
          "Automated changes from Coding mode."
        );
        prUrl = pr.html_url ?? null;
      } catch (error) {
        await send({
          type: "log",
          message: `Pull request failed: ${String(error)}`,
        });
      }

      const diff = await runBash(
        sandbox,
        `cd ${repoDir} && git diff ${repoInfo.defaultBranch}...HEAD`
      );
      await send({ type: "diff", diff: diff.slice(-24_000) });
      await send({ type: "step", step: "opening pull request", status: "done" });

      await send({
        type: "result",
        branch,
        pullRequestUrl: prUrl,
        summary: prUrl
          ? "Changes pushed and PR opened."
          : "Changes pushed to branch.",
      });
    } catch (error) {
      await send({
        type: "error",
        message: error instanceof Error ? error.message : "Coding failed",
      });
    } finally {
      if (sandbox) {
        await (sandbox as { kill?: () => Promise<void> }).kill?.();
      }
      await close();
    }
  })();

  return response;
}
