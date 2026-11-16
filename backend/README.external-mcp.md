# External MCP endpoint

`/api/mcp/stream` provides the official MCP SDK's stateless Streamable HTTP
transport with JSON responses. It has no sessions or persistent SSE listener.
The existing `/api/mcp/tools/list`, `/api/mcp/tools/call`, and `/api/mcp/rpc` API
remains independent and retains its existing application authentication behavior.

## Activation and access

The endpoint is disabled unless `MCP_EXTERNAL_ENABLED` is exactly `true`.
Unset, empty, `false`, and other values return 404 before parsing, quota access,
SDK setup, or tool execution. Keep it false until the deployment checks below
are complete; migrating the implementation does not certify public deployment.

When enabled, clients are anonymous and non-admin. No OAuth, Keycloak login,
client API key, Bearer token, or user session is required. Supplied authorization,
identity, conversation, and privilege flags cannot grant access or attribution.
The external policy discards supplied context and forces `externalMcp: true`.

Native clients must omit `Origin` and send JSON POST requests with
`Content-Type: application/json` and the SDK-required
`Accept: application/json, text/event-stream`. Every supplied browser Origin,
including Atlas and preview origins, is denied. Browser preflight is not enabled.
GET, HEAD, DELETE, PUT, OPTIONS and other unsupported methods return 405 when
enabled and no Origin is supplied. Responses use `Cache-Control: no-store`.

Middleware order is Helmet → external MCP → compression → application CORS →
global 10 MB parser → general application limiter. The external endpoint has its
own stricter boundary and does not inherit permissive application CORS or parsing.
It also bypasses the general limiter; edge flood controls are still necessary.

## Backend configuration

Use backend environment settings only; never expose quota credentials through
frontend variables or client tool arguments.

| Variable                     | Requirement                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MCP_EXTERNAL_ENABLED`       | Defaults to disabled; only exact `true` enables access.                                                                                                                    |
| `MCP_QUOTA_REDIS_REST_URL`   | HTTPS origin of a Redis REST gateway supporting JSON-array `EVAL` commands and `{ "result": [...] }` replies. No URL credentials, paths, queries, fragments, or redirects. |
| `MCP_QUOTA_REDIS_REST_TOKEN` | Restricted backend write credential for that gateway; this is infrastructure configuration, not client authentication.                                                     |
| `MCP_QUOTA_NAMESPACE`        | Stable 1–64 character letters/digits/underscore/hyphen namespace shared by all instances of one quota domain. Separate preview and production stores/namespaces.           |
| `ORKG_API_BASE`              | Optional existing REST override; defaults to `https://www.orkg.org/api`.                                                                                                   |
| `ORKG_SPARQL_ENDPOINT`       | Optional existing SPARQL override; defaults to `https://orkg.org/triplestore/sparql`.                                                                                      |

With admission disabled and no work running, an operator initializes
`{NAMESPACE}:mcp:active` using `HSET {NAMESPACE}:mcp:active __initialized 2`.
Replace `NAMESPACE` but retain the braces. The hash must contain only this field
and have no TTL. Runtime admission never initializes or resets it.
The four counters, control hash, and four expiring lease slots share this Redis
hash tag. Required gateway commands include `EVAL`, `GET`, `SET ... PX`, `PTTL`,
`PEXPIRE`, `DEL`, `INCRBY`, `HGET`, `HLEN`, and operator-only initialization.

For an existing version-1 store, disable admission, drain invocations, and verify
old upstream work has stopped before migrating control state to version 2.
Do not reset rate counters, delete live slots, change namespaces, or mix formats
while work may remain active. Missing/corrupt/mixed control state fails closed.

## Public tools

Discovery and execution permit exactly these 16 tools:

```text
atlas_list_templates
orkg_build_graph
orkg_get_comparison
orkg_get_paper
orkg_get_resource
orkg_get_statements_bundle
orkg_get_statements_by_subject
orkg_get_template
orkg_search_comparisons
orkg_search_papers
orkg_search_resources
orkg_search_templates
orkg_sparql
orkg_sparql_schema
render_chart
render_graph
```

All Ask tools, saved Dynamic Questions, Atlas statistics, and future unlisted
tools are inaccessible through this endpoint. Public template catalogs contain
ORKG catalog data only, without private Atlas/Firestore additions. Visualization
tools return specifications for the client to render; they perform no AI calls.

## Limits and execution

`src/config/mcp.ts` is the single source of truth, including generated Lua limits.

| Budget                                   | Limit                                                                                                                 |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| JSON POST requests                       | 60 per 60-second counter window                                                                                       |
| Tool-call attempts                       | 30 per window; 4 concurrently                                                                                         |
| SPARQL and schema combined               | 6 per window; 2 concurrently                                                                                          |
| Schema calls                             | 2 per window; 1 concurrently                                                                                          |
| Request body / batch                     | 256 KiB / 4 messages; duplicate request IDs rejected                                                                  |
| Complete JSON-RPC response               | 3 MiB, including UTF-8, escaping, envelope, metadata, duplicated text/structured content, and aggregate batch framing |
| Ordinary tool / SPARQL / schema deadline | 20 / 10 / 8 seconds                                                                                                   |
| Complete HTTP lifecycle                  | 45 seconds, including body upload, admission and cleanup; missing SDK replies cannot extend it                        |
| Quota-store I/O                          | 1 second; 4 KiB response; no automatic retry or local fallback                                                        |
| Lease TTL / renewal                      | 45 seconds / every 10 seconds                                                                                         |
| Public SPARQL input / SELECT LIMIT       | 2,000 UTF-8 bytes / 1–100                                                                                             |
| Upstream response                        | 5,000,000 bytes per bounded request                                                                                   |
| Catalog traversal                        | 20 pages, 1,000 items, 5,000,000 aggregate bytes, helper deadline 25 seconds                                          |
| Template hierarchy                       | 20 templates, 40 class lookups, sequential requests, helper deadline 25 seconds                                       |
| Chart / graph specification              | 2,000 rows and 10 series / 500 nodes and 2,000 edges                                                                  |

Windows start at a counter's first accepted use; they are not sliding windows.
All callers share one namespace's budgets, regardless of IP, forwarded headers,
identity or cookies. This resists identity spoofing but permits global starvation.
A batch costs one HTTP unit and weighted tool units; all tool permits are reserved
atomically or the batch is denied. Discovery consumes an HTTP unit only.
Malformed JSON is charged before parsing; disallowed origins, methods and media
types are rejected before admission. Invalid tool attempts still consume quota.

The public SPARQL guard accepts SELECT only: one fixed-predicate triple anchored
to an explicit ORKG resource subject, LIMIT 1–100, and no nonzero OFFSET. ASK,
joins, property paths, variable predicates, subqueries, aggregation, ordering,
filters, named graphs and unknown query features are rejected. `SERVICE`, dataset
clauses and updates remain prohibited. Queries are rejected rather than rewritten.
Public schema guidance uses bounded REST loading and never performs live SPARQL
paper-link discovery; unresolved paths remain explicit. Internal SELECT/ASK
execution retains its broader shared policy.

Each tool verifies its UUID lease owner before execution. Request disconnects,
SDK cancellation signals, deadlines and lease loss abort supported downstream I/O.
Nested calls, retries, body reads and loops share the tool deadline, even when a
helper's own budget is longer. Execution awaits cancellation cleanup before
releasing capacity. Renewal continues through cleanup, with one store call in
flight. Local monotonic validity prevents a paused owner from reviving an expired
lease; release cannot remove a replacement owner's slot.

Redis TTLs recover abandoned owners without shutdown hooks, release callbacks or
sweepers: 45 seconds after the last Redis-side acquisition/renewal. The TTL derives
from the maximum 20-second tool deadline + 20-second cleanup allowance + 5-second
safety margin. These are cooperative leases, not fencing tokens for remote ORKG.

## Errors and lifecycle

Rate/concurrency exhaustion returns HTTP 429 with `Retry-After` and JSON-RPC
`-32000`. Missing, unavailable, malformed or ambiguously acknowledged quota storage
returns sanitized HTTP 503. Invalid batches use HTTP 400 / `-32600`; malformed JSON
uses 400 / `-32700`; oversized bodies use 413; non-JSON media uses 415.
SDK protocol errors retain SDK semantics, including Accept/version validation.

Valid tool calls return HTTP 200 with `isError` and a structured result envelope;
timeouts, lease loss, policy rejection and handler errors are explicit failures.
Cancellation notifications abort the request's work while allowing an explicit
error reply; they do not suppress replies required to finish a JSON batch.
The HTTP lifecycle deadline returns 504 / `MCP_HTTP_TIMEOUT` before headers are
sent, or terminates an already-started response. Started tool leases remain held
until their work and cancellation cleanup settle, even if HTTP has already ended.
Oversized results replace the complete response with `MCP_RESPONSE_TOO_LARGE`
errors preserving request IDs; data is never silently truncated to fit the cap.
Batch replacement covers every reply. Notifications may return HTTP 202 without a
body. The SDK server and transport are created per request and cleaned up on
success, disconnect and setup failure; unused reservations are released separately.

## Local verification

Use Node 24.x (the backend declares Node >=24) and install backend dependencies:

```bash
npm --prefix backend ci
npm --prefix backend test -- --run src/routes/mcpExternal.test.ts src/routes/mcpExternal.limits.test.ts src/routes/mcpExternal.abuse.test.ts src/services/mcp src/middleware/mcpQuota.test.ts
npm --prefix backend test -- --run
npm --prefix backend run lint
./backend/node_modules/.bin/tsc --noEmit -p backend/tsconfig.json
git diff --check
```

The backend has its own Vitest configuration. Tests use loopback HTTP, the real
SDK, synthetic safe tools, and mocked quota REST contracts; no production account
or localhost demo is needed. They verify disabled access without quota/tool work,
anonymous discovery and chart execution, legacy routes, cancellation, setup
cleanup, public query restrictions, batches, response boundaries, and quota abuse.

For actual Lua execution, install local Redis binaries and run the optional
isolated suite described in [Redis verification](README.mcp-redis-tests.md).
It cannot target configured production Redis and includes a full 45-second expiry
test. Local Redis verification does not certify a deployment provider.

To inspect the complete application locally, supply its existing backend/Firebase
configuration and run `npm --prefix backend run dev`. The normal application
startup requirements still apply even though allowed external tools avoid
Firestore. Keep MCP disabled except in a controlled verification environment.

## Deployment prerequisites and remaining limitations

Before changing the production flag to true:

- Verify the selected Node runtime, Vercel build/bundle tracing of shared imports,
  HTTPS routing, deployment-protection settings, and anonymous SDK compatibility
  in a controlled preview. No Vercel configuration is changed by this migration.
- Verify function duration includes admission, tool execution, cancellation
  cleanup and release, and check current platform body/response, memory and CPU
  limits. A 3 MiB output cap does not bound peak intermediate memory or CPU.
- Verify one authoritative atomic Redis writer, durable acknowledgements, no key
  eviction, stable clocks, and failover without stale state or data loss. A REST
  command-compatible service alone does not guarantee semaphore correctness.
- Test the real gateway's permissions, TLS, latency, outages, ambiguous commits,
  crash expiry, contention and renewal/release races; provision version-2 control
  state with admission disabled. Keep credentials backend-only and least-privilege.
- Apply edge/WAF flood controls, upload timeouts and spend/traffic alerts. Rejected
  requests still incur function/store work; application quotas do not prevent
  billing abuse. Shared quotas provide no per-client fairness.
- Validate representative ORKG query cost and cancellation. Local HTTP aborts do
  not prove the remote triplestore stopped computing. JavaScript CPU work cannot
  be interrupted by timers; an uncooperative promise is awaited rather than
  abandoned. Event-loop suspension, Redis clock changes or storage data loss can
  still create overlap after lease expiry; these leases provide no remote fencing.
- Resolve or explicitly disposition existing backend type-check/build failures.
  The package's existing `start` path also needs checking against the emitted
  `dist/backend/src/server.js` layout before a compiled local deployment.

All browser origins remain denied. Browser CORS/preflight support requires a
separate explicit policy and verification. Stateless notifications sent in a
different HTTP request cannot locate another invocation for cancellation;
disconnects and deadlines still bound supported local I/O. No provider, live ORKG
cost/cancellation behavior, or Vercel deployment is certified by local tests.
