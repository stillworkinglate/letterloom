/**
 * Room store on Upstash Redis, through its REST API (no dependencies).
 *
 * Each room is a Redis hash { v, state }. The scripts run atomically on the
 * server, which is what makes "write only if the version still matches" safe
 * when both phones write at once.
 */
'use strict';

const CREATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
redis.call('HSET', KEYS[1], 'v', 1, 'state', ARGV[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
return 1
`;

const READ_SCRIPT = `
local v = redis.call('HGET', KEYS[1], 'v')
if not v then return {} end
if tonumber(v) == tonumber(ARGV[1]) then return { tonumber(v) } end
return { tonumber(v), redis.call('HGET', KEYS[1], 'state') }
`;

const WRITE_SCRIPT = `
local v = redis.call('HGET', KEYS[1], 'v')
if not v then return {} end
if tonumber(v) ~= tonumber(ARGV[1]) then
  return { 0, tonumber(v), redis.call('HGET', KEYS[1], 'state') }
end
local n = redis.call('HINCRBY', KEYS[1], 'v', 1)
redis.call('HSET', KEYS[1], 'state', ARGV[2])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3]))
return { 1, n }
`;

function roomKey(code) {
  return `letterloom:room:${code}`;
}

/**
 * @param {(command: Array<string|number>) => Promise<any>} run executes one Redis command
 */
function createRedisStore(run) {
  const evalScript = (script, code, ...args) => run(['EVAL', script, 1, roomKey(code), ...args]);
  return {
    async create(code, state, ttl) {
      return (await evalScript(CREATE_SCRIPT, code, state, ttl)) === 1;
    },
    async read(code, knownVersion) {
      const result = await evalScript(READ_SCRIPT, code, knownVersion);
      if (!Array.isArray(result) || result.length === 0) return null;
      return result.length === 1 ? { v: Number(result[0]) } : { v: Number(result[0]), state: result[1] };
    },
    async write(code, expectedVersion, state, ttl) {
      const result = await evalScript(WRITE_SCRIPT, code, expectedVersion, state, ttl);
      if (!Array.isArray(result) || result.length === 0) return null;
      if (Number(result[0]) === 1) return { ok: true, v: Number(result[1]) };
      return { ok: false, v: Number(result[1]), state: result[2] };
    },
  };
}

/** Runs commands against an Upstash REST endpoint. */
function createUpstashRunner(url, token, fetchImpl = fetch) {
  return async function run(command) {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload || payload.error) {
      throw new Error(`Redis request failed (${response.status}): ${(payload && payload.error) || 'no response body'}`);
    }
    return payload.result;
  };
}

/**
 * Reads the connection details Vercel's Upstash integration sets. The names
 * depend on how the database was added (and on any prefix chosen then), so
 * this accepts KV_REST_API_* and UPSTASH_REDIS_REST_*, with or without a prefix.
 */
function upstashConfigFromEnv(env = process.env) {
  const find = (pattern) => {
    const name = Object.keys(env).find((key) => pattern.test(key) && env[key]);
    return name ? env[name] : null;
  };
  const url = find(/(^|_)(KV_REST_API_URL|UPSTASH_REDIS_REST_URL)$/);
  const token = find(/(^|_)(KV_REST_API_TOKEN|UPSTASH_REDIS_REST_TOKEN)$/);
  return url && token ? { url, token } : null;
}

module.exports = { createRedisStore, createUpstashRunner, upstashConfigFromEnv, roomKey };
