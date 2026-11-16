# MCP Redis Lua verification

The optional suite executes the actual admission, renewal and release Lua scripts.
It is skipped unless `MCP_REDIS_INTEGRATION=1` is explicitly set.

Install `redis-server` and `redis-cli` locally, then run from the repository root:

```bash
MCP_REDIS_INTEGRATION=1 npm --prefix backend test -- --run src/services/mcp/quotaScripts.integration.test.ts
```

Alternatively, set `MCP_REDIS_TEST_BIN_DIR` to a directory containing both binaries.
The suite starts a fresh Redis child process with TCP disabled (`--port 0`), a
private temporary Unix socket, and persistence disabled. It never reads a Redis
URL, token, existing socket, or application quota namespace. Every test uses UUID
keys under a `mcp-test-` hash tag; cleanup deletes only those keys, stops its own
child process, and removes its temporary directory. It never uses `FLUSHDB` or
`FLUSHALL`, and cannot target an existing production Redis through configuration.

Coverage includes counter budgets/windows, simultaneous acquisitions, weighted
batch rejection, control-state validation, owner-conditional renewal/release,
renewal/release races and native expiry of abandoned owners. The expiry test waits
the full configured 45 seconds; allow roughly one minute for the suite.

This verifies a local Redis process, not the production REST gateway, distributed
failover, persistence, eviction policy, clock behavior, or upstream ORKG query
cancellation. Those remain deployment validation requirements. Leases coordinate
cooperating invocations; they do not fence remote triplestore work.

The production router is now integrated but disabled by default. See
[External MCP](README.external-mcp.md) for activation, execution boundaries and
deployment prerequisites. Internal SELECT/ASK behavior remains independent of
the resource-anchored SELECT-only public guard.
