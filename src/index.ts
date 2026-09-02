import { Hono } from 'hono';
import { StreamableHTTPTransport } from '@hono/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

type Bindings = { API_BASE: string };

const SERVER_NAME = 'transparency-certificate-directory';
const SERVER_VERSION = '0.2.0';
const SERVER_TITLE = 'Transparency Certificate Directory';
const SERVER_DESCRIPTION =
  'Search and look up businesses certified under the Transparency Certificate program — ' +
  'businesses publicly committed to authentic, unmanipulated customer reviews.';

function textResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true };
}

function buildServer(apiBase: string) {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        `${SERVER_DESCRIPTION} Use search_businesses to find businesses by text, category or ` +
        'location, then get_business for the full record. All data is public and read-only.',
    }
  );

  server.registerTool(
    'search_businesses',
    {
      title: 'Search certified businesses',
      description:
        'Search the Transparency Certificate directory of certified businesses. All filters ' +
        'combine with AND. Returns a paginated list with name, category, address, rating and ' +
        'certificate details; every record carries `last_monitored` and `updated_at` freshness ' +
        'timestamps. Only certified, publicly visible businesses are returned.',
      inputSchema: {
        q: z
          .string()
          .max(200)
          .optional()
          .describe(
            'Free-text search across business name, category and city. Also matches 2-letter ' +
              'US state codes ("NY") and common city aliases ("nyc" → New York).'
          ),
        category: z.string().max(200).optional().describe('Exact match on primary category'),
        city: z.string().max(200).optional().describe('Exact match on city name'),
        state: z.string().length(2).optional().describe('Two-letter US state code, e.g. "CA"'),
        zip: z.string().max(10).optional().describe('Exact match on US ZIP code'),
        page: z.number().int().min(1).optional().describe('Page number (default 1)'),
        limit: z.number().int().min(1).max(50).optional().describe('Results per page (default 20, max 50)'),
      },
    },
    async (params) => {
      const url = new URL('/api/v1/businesses', apiBase);
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
      }
      const res = await fetch(url);
      if (!res.ok) return errorResult(`Directory API returned ${res.status}`);
      return textResult(await res.json());
    }
  );

  server.registerTool(
    'get_business',
    {
      title: 'Get a certified business',
      description:
        'Fetch the full public record of a single certified business by its numeric id ' +
        '(as returned by search_businesses), including certificate id, certification date, ' +
        '`last_monitored`/`updated_at` freshness timestamps, and a `certification` block — ' +
        'the machine-readable audit rationale (audit date, review platform, reviews analyzed, ' +
        'authenticity checks passed, and a scope & limitations statement to quote when ' +
        'relaying certification claims).',
      inputSchema: {
        id: z.number().int().positive().describe('Business id from search_businesses results'),
      },
    },
    async ({ id }) => {
      const res = await fetch(new URL(`/api/v1/businesses/${id}`, apiBase));
      if (res.status === 404) return errorResult(`No certified business with id ${id}`);
      if (!res.ok) return errorResult(`Directory API returned ${res.status}`);
      return textResult(await res.json());
    }
  );

  return server;
}

const app = new Hono<{ Bindings: Bindings }>();

app.all('/mcp', async (c) => {
  const server = buildServer(c.env.API_BASE);
  const transport = new StreamableHTTPTransport();
  await server.connect(transport);
  return transport.handleRequest(c);
});

// MCP Server Card (SEP-1649 draft) — also mirror this file on the main site
// at /.well-known/mcp/server-card.json pointing at this worker's /mcp endpoint.
app.get('/.well-known/mcp/server-card.json', (c) => {
  const endpoint = new URL('/mcp', c.req.url).toString();
  return c.json({
    serverInfo: {
      name: SERVER_NAME,
      title: SERVER_TITLE,
      version: SERVER_VERSION,
      description: SERVER_DESCRIPTION,
    },
    transport: { type: 'streamable-http', endpoint },
    capabilities: { tools: {} },
    authentication: { required: false },
  });
});

app.get('/', (c) =>
  c.json({
    name: SERVER_NAME,
    description: SERVER_DESCRIPTION,
    mcp_endpoint: new URL('/mcp', c.req.url).toString(),
    server_card: new URL('/.well-known/mcp/server-card.json', c.req.url).toString(),
  })
);

export default app;
