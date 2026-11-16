import { MCP_QUOTAS } from '../../config/mcp.js';
export { MCP_QUOTAS } from '../../config/mcp.js';

// Version 2 refuses the old permanent-permit hash and mixed-version operation.
const CHECK_CONTROL = `
if redis.call('HGET', KEYS[1], '__initialized') ~= '${MCP_QUOTAS.controlVersion}' or redis.call('PTTL', KEYS[1]) ~= -1 or redis.call('HLEN', KEYS[1]) ~= 1 then
  return {3, ${MCP_QUOTAS.retryAfterMs}}
end
`;

export const ADMIT_QUOTA = `
if redis.call('HGET', KEYS[5], '__initialized') ~= '${MCP_QUOTAS.controlVersion}' or redis.call('PTTL', KEYS[5]) ~= -1 or redis.call('HLEN', KEYS[5]) ~= 1 then
  return {3, ${MCP_QUOTAS.retryAfterMs}}
end
local costs = cjson.decode(ARGV[1])
local permits = cjson.decode(ARGV[2])
local limits = {${MCP_QUOTAS.requestsPerMinute}, ${MCP_QUOTAS.toolsPerMinute}, ${MCP_QUOTAS.expensivePerMinute}, ${MCP_QUOTAS.schemaPerMinute}}
local free, owners = {}, {}
local count, expensive, schema = 0, 0, 0
for i = 6, #KEYS do
  local raw = redis.call('GET', KEYS[i])
  if raw then
    local ok, permit = pcall(cjson.decode, raw)
    if not ok or type(permit) ~= 'table' or #permit ~= 2 or type(permit[1]) ~= 'string' or
       (permit[2] ~= 'standard' and permit[2] ~= 'expensive' and permit[2] ~= 'schema') or
       redis.call('PTTL', KEYS[i]) < 0 then return {3, ${MCP_QUOTAS.retryAfterMs}} end
    owners[permit[1]] = true
    count = count + 1
    if permit[2] ~= 'standard' then expensive = expensive + 1 end
    if permit[2] == 'schema' then schema = schema + 1 end
  else free[#free + 1] = KEYS[i] end
end
if #permits > 0 then
  if count + #permits > ${MCP_QUOTAS.activeTools} then return {2, ${MCP_QUOTAS.retryAfterMs}} end
  if expensive + costs[3] > ${MCP_QUOTAS.activeExpensive} or schema + costs[4] > ${MCP_QUOTAS.activeSchema} then return {2, ${MCP_QUOTAS.retryAfterMs}} end
  for _, permit in ipairs(permits) do
    if owners[permit[1]] then return {3, ${MCP_QUOTAS.retryAfterMs}} end
    owners[permit[1]] = true
  end
end
local retry = 0
for i = 1, 4 do
  if costs[i] > 0 then
    local raw = redis.call('GET', KEYS[i])
    local used = tonumber(raw or '0')
    local ttl = redis.call('PTTL', KEYS[i])
    if not used or used < 0 or used % 1 ~= 0 or (raw and ttl < 0) then return {3, ${MCP_QUOTAS.retryAfterMs}} end
    if used + costs[i] > limits[i] then retry = math.max(retry, ttl, 1) end
  end
end
if retry > 0 then return {1, retry} end
for i = 1, 4 do
  if costs[i] > 0 then
    local used = redis.call('INCRBY', KEYS[i], costs[i])
    if used == costs[i] then redis.call('PEXPIRE', KEYS[i], ${MCP_QUOTAS.windowMs}) end
  end
end
for i, permit in ipairs(permits) do
  redis.call('SET', free[i], cjson.encode(permit), 'PX', ${MCP_QUOTAS.leaseMs})
end
return {0, 0}
`;

export const RELEASE_QUOTA = `
${CHECK_CONTROL}
local owners = cjson.decode(ARGV[1])
for i = 2, #KEYS do
  local raw = redis.call('GET', KEYS[i])
  if raw then
    local permit = cjson.decode(raw)
    for _, owner in ipairs(owners) do
      if permit[1] == owner then redis.call('DEL', KEYS[i]) end
    end
  end
end
return {0, 0}
`;

// Never recreate an expired lease; check every owner before changing any TTL.
export const RENEW_QUOTA = `
${CHECK_CONTROL}
local owners = cjson.decode(ARGV[1])
local slots = {}
for _, owner in ipairs(owners) do
  local found = false
  for i = 2, #KEYS do
    local raw = redis.call('GET', KEYS[i])
    if raw then
      local permit = cjson.decode(raw)
      if permit[1] == owner and redis.call('PTTL', KEYS[i]) > 0 then
        slots[#slots + 1] = KEYS[i]
        found = true
      end
    end
  end
  if not found then return {4, ${MCP_QUOTAS.retryAfterMs}} end
end
for _, slot in ipairs(slots) do redis.call('PEXPIRE', slot, ${MCP_QUOTAS.leaseMs}) end
return {0, 0}
`;
