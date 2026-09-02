# trc-mcp

Remote [MCP](https://modelcontextprotocol.io/) server for the **Transparency Certificate** directory. A thin, stateless, read-only wrapper over the public directory REST API, deployed as a Cloudflare Worker (Streamable HTTP transport, no auth, no Durable Objects).

**Live at `https://mcp.transparencycertified.com/mcp`**

```bash
claude mcp add --transport http trc-directory https://mcp.transparencycertified.com/mcp
```

## Tools

| Tool                | Wraps                        | Description                                                                                                                                     |
| ------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_businesses` | `GET /api/v1/businesses`     | Search certified businesses by text, category, city, state or ZIP (paginated; records carry `last_monitored`/`updated_at` freshness timestamps) |
| `get_business`      | `GET /api/v1/businesses/:id` | Full public record of a single certified business, incl. the `certification` block (audit rationale + scope statement)                          |

## Endpoints

| Path                                | Purpose                                   |
| ----------------------------------- | ----------------------------------------- |
| `/mcp`                              | MCP endpoint (Streamable HTTP)            |
| `/.well-known/mcp/server-card.json` | MCP Server Card (SEP-1649 draft)          |
| `/`                                 | Human/agent-readable pointer to the above |

## Development

```bash
npm install
npm run dev        # wrangler dev → http://localhost:8787/mcp
npm run typecheck
```

Note: `wrangler dev` fails when this folder is nested inside the main app checkout (it walks up and finds the main app's `.wrangler/deploy/config.json`). Run it from a standalone checkout, or copy the folder outside the main repo.

`.dev.vars` (gitignored) can override `API_BASE` for local development — e.g. `API_BASE=http://trc-astro:4321` to hit the local directory API instead of production.

Quick smoke test:

```bash
curl -s http://localhost:8787/mcp -X POST \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

Or connect Claude Code directly:

```bash
claude mcp add --transport http trc-directory http://localhost:8787/mcp
```

## Deploy

```bash
npm run deploy
```

`API_BASE` (the public directory origin the tools call) is set in `wrangler.toml` `[vars]` and points at the production domain.

The custom domain `mcp.transparencycertified.com` is attached in the Cloudflare dashboard (worker → Settings → Domains & Routes) and declared in `wrangler.toml` `routes`.

## Server Card on the main site

For agent discovery, the main site should serve `/.well-known/mcp/server-card.json` with the same JSON this worker serves, with `transport.endpoint` set to the deployed `/mcp` URL. See `src/index.ts` for the card shape.

Note: the Server Card schema (SEP-1649) is still a draft — see <https://github.com/modelcontextprotocol/modelcontextprotocol/pull/2127>.
