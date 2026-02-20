import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CcApiClient } from "@clevercloud/client/cc-api-client.js";
import { commands } from "../commands/command-registry.js";
import type { Config } from "../config.js";

export function registerExecuteTool(
  server: McpServer,
  client: CcApiClient,
  config: Config,
): void {
  const timeoutSec = Math.round(config.executionTimeoutMs / 1000);

  server.tool(
    "execute",
    `Execute JavaScript code against the Clever Cloud API using a pre-authenticated client.

Available in scope:
- client: CcApiClient instance (pre-authenticated with API token)
- commands: object with all command classes (e.g., commands.ListApplicationCommand)

Usage pattern:
  const apps = await client.send(new commands.ListApplicationCommand({ ownerId: "orga_xxx" }));
  return apps;

Notes:
- The code runs as an async function body. Use 'return' to return a result.
- ownerId is auto-resolved from applicationId/addonId — you can often omit it.
- Some commands take no parameters: new commands.GetProfileCommand()
- For stream commands, use client.stream() instead of client.send().
- Use the search tool first to discover available commands and their parameters.
- Timeout: ${timeoutSec}s.`,
    {
      code: z
        .string()
        .describe(
          "JavaScript code to execute. Runs as an async function body with client and commands in scope. Use 'return' to return a result.",
        ),
    },
    async ({ code }) => {
      const logs: string[] = [];
      const capturedConsole = {
        log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
        warn: (...args: unknown[]) =>
          logs.push(`[WARN] ${args.map(String).join(" ")}`),
        error: (...args: unknown[]) =>
          logs.push(`[ERROR] ${args.map(String).join(" ")}`),
      };

      try {
        // eslint-disable-next-line @typescript-eslint/no-implied-eval
        const fn = new Function(
          "client",
          "commands",
          "console",
          `return (async () => { ${code} })();`,
        ) as (
          client: CcApiClient,
          commands: Record<string, unknown>,
          console: typeof capturedConsole,
        ) => Promise<unknown>;

        const resultPromise = fn(client, commands, capturedConsole);

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  `Execution timed out after ${config.executionTimeoutMs}ms`,
                ),
              ),
            config.executionTimeoutMs,
          ),
        );

        const result = await Promise.race([resultPromise, timeoutPromise]);

        let resultStr = JSON.stringify(result, null, 2) ?? "undefined";

        if (resultStr.length > config.maxOutputLength) {
          resultStr =
            resultStr.slice(0, config.maxOutputLength) +
            `\n\n... (truncated, ${resultStr.length} total chars)`;
        }

        const output = [
          logs.length > 0 ? `Console output:\n${logs.join("\n")}\n\n` : "",
          `Result:\n${resultStr}`,
        ].join("");

        return {
          content: [{ type: "text" as const, text: output }],
        };
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack =
          error instanceof Error ? error.stack : undefined;

        const output = [
          logs.length > 0 ? `Console output:\n${logs.join("\n")}\n\n` : "",
          `Error: ${errorMessage}`,
          errorStack ? `\nStack: ${errorStack}` : "",
        ].join("");

        return {
          content: [{ type: "text" as const, text: output }],
          isError: true,
        };
      }
    },
  );
}
