# clever-code-mode-mcp

An MCP server that gives AI agents full access to the [Clever Cloud](https://clever-cloud.com) API through three tools: `search`, `execute`, and `doc`.

Instead of exposing 177 individual tools (one per API endpoint), the agent discovers available commands then writes JavaScript code to compose them — inspired by [Cloudflare's Code Mode](https://blog.cloudflare.com/code-mode-mcp/) pattern.

## How it works

1. The agent calls **`search`** with a keyword (e.g. `"deploy application"`) and gets back matching commands with their parameters
2. The agent calls **`execute`** with JavaScript code that uses a pre-authenticated Clever Cloud client and the discovered commands:

```js
const apps = await client.send(
  new commands.ListApplicationCommand({ ownerId: "orga_xxx" }),
  { signal }
);
return apps.filter(a => a.state === "RUNNING");
```

3. The agent calls **`doc`** to search Clever Cloud's documentation index or fetch a specific page as markdown — useful for conceptual questions the API catalog can't answer (runtimes, add-ons, deployment model, environment variables, etc.).

The code runs locally on your machine with a configurable timeout. The full [`@clevercloud/client`](https://github.com/CleverCloud/clever-client.js) command library is available — including automatic owner ID resolution, response transformation, and structured error handling.

## Setup

### Prerequisites

- Node.js >= 22
- A Clever Cloud API token ([create one here](https://console.clever-cloud.com/users/me/tokens))

### Install

```bash
git clone https://github.com/davlgd/clever-code-mode-mcp.git
cd clever-code-mode-mcp
npm install
npm run generate-catalog
npm run build
```

### Configure in Claude Code

Using the CLI:

```bash
claude mcp add clever-cloud \
  -e CLEVER_CLOUD_API_TOKEN=your-api-token \
  -- node /absolute/path/to/clever-code-mode-mcp/dist/index.js
```

Or add a `.mcp.json` file at the root of your project:

```json
{
  "mcpServers": {
    "clever-cloud": {
      "command": "node",
      "args": ["/absolute/path/to/clever-code-mode-mcp/dist/index.js"],
      "env": {
        "CLEVER_CLOUD_API_TOKEN": "${CLEVER_CLOUD_API_TOKEN}"
      }
    }
  }
}
```

The `.mcp.json` approach supports environment variable expansion (`${VAR}` or `${VAR:-default}`), so you can keep your token in your shell environment rather than in the file itself.

### Optional environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CC_MCP_TIMEOUT_MS` | `30000` | Execution timeout in milliseconds |
| `CC_MCP_MAX_OUTPUT` | `50000` | Maximum output length in characters |

## License

Apache-2.0 — davlgd, 2026
