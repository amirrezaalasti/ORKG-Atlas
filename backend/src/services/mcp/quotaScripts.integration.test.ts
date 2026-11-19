import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { MCP_QUOTAS } from '../../config/mcp.js';
import { ADMIT_QUOTA, RELEASE_QUOTA, RENEW_QUOTA } from './quotaScripts.js';

const run = promisify(execFile);

// No Redis URL, credentials, existing socket or production namespace is read.
// Even when opted in, this suite can only connect to the server it starts.
describe.skipIf(process.env.MCP_REDIS_INTEGRATION !== '1')(
  'actual Redis Lua scripts',
  () => {
    let directory: string, socket: string, server: ChildProcess;
    let keys: string[] = [];
    const executable = (name: string) =>
      process.env.MCP_REDIS_TEST_BIN_DIR
        ? join(process.env.MCP_REDIS_TEST_BIN_DIR, name)
        : name;
    const command = async (...args: (string | number)[]): Promise<unknown> => {
      const { stdout } = await run(
        executable('redis-cli'),
        ['-s', socket, '--json', ...args.map(String)],
        {
          encoding: 'utf8',
          env: { PATH: process.env.PATH },
          timeout: 5_000,
          maxBuffer: 128 * 1024,
        }
      );
      return JSON.parse(stdout);
    };
    const evaluate = (
      script: string,
      scriptKeys: string[],
      ...args: string[]
    ) =>
      command(
        'EVAL',
        script,
        scriptKeys.length,
        ...scriptKeys,
        ...args
      ) as Promise<number[]>;
    const admit = (costs: number[], permits: string[][] = []) =>
      evaluate(
        ADMIT_QUOTA,
        keys,
        JSON.stringify(costs),
        JSON.stringify(permits)
      );
    const release = (...owners: string[]) =>
      evaluate(RELEASE_QUOTA, keys.slice(4), JSON.stringify(owners));
    const renew = (...owners: string[]) =>
      evaluate(RENEW_QUOTA, keys.slice(4), JSON.stringify(owners));

    beforeAll(async () => {
      directory = await mkdtemp(join(tmpdir(), 'mcp-redis-test-'));
      socket = join(directory, 'redis.sock');
      let startupError: Error | undefined;
      server = spawn(
        executable('redis-server'),
        [
          '--port',
          '0',
          '--unixsocket',
          socket,
          '--unixsocketperm',
          '700',
          '--save',
          '',
          '--appendonly',
          'no',
          '--dir',
          directory,
        ],
        { stdio: 'ignore', env: { PATH: process.env.PATH } }
      );
      server.once('error', (error) => {
        startupError = error;
      });
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        if (startupError)
          throw new Error(
            'Install redis-server and redis-cli to run the opt-in Redis suite.'
          );
        try {
          if ((await command('PING')) === 'PONG') return;
        } catch {
          /* Wait only for this newly spawned private socket. */
        }
        await delay(20);
      }
      throw new Error('The isolated Redis test server did not start.');
    }, 10_000);

    beforeEach(async () => {
      const prefix = `{mcp-test-${randomUUID()}}:mcp`;
      keys = [
        'requests',
        'tools',
        'expensive',
        'schema',
        'active',
        ...Array.from(
          { length: MCP_QUOTAS.activeTools },
          (_, i) => `lease-${i + 1}`
        ),
      ].map((key) => `${prefix}:${key}`);
      await command(
        'HSET',
        keys[4],
        '__initialized',
        MCP_QUOTAS.controlVersion
      );
    });
    afterEach(async () => {
      if (keys.length) await command('DEL', ...keys);
      keys = [];
    });
    afterAll(async () => {
      if (server?.pid && server.exitCode === null) {
        const stopped = new Promise<void>((resolve) =>
          server.once('exit', () => resolve())
        );
        server.kill('SIGTERM');
        await stopped;
      }
      if (directory) await rm(directory, { recursive: true, force: true });
    });

    it.each(['missing', 'old version', 'extra owner', 'control TTL'])(
      'fails closed with invalid control state: %s',
      async (kind) => {
        if (kind === 'missing') await command('DEL', keys[4]);
        if (kind === 'old version')
          await command('HSET', keys[4], '__initialized', 1);
        if (kind === 'extra owner')
          await command('HSET', keys[4], 'old-owner', 'standard');
        if (kind === 'control TTL') await command('PEXPIRE', keys[4], 10_000);
        expect((await admit([1, 0, 0, 0]))[0]).toBe(3);
        expect((await renew(randomUUID()))[0]).toBe(3);
        expect((await release(randomUUID()))[0]).toBe(3);
        expect(await command('GET', keys[0])).toBeNull();
      }
    );

    it.each([
      ['requests', [1, 0, 0, 0], MCP_QUOTAS.requestsPerMinute, undefined],
      ['tools', [0, 1, 0, 0], MCP_QUOTAS.toolsPerMinute, 'standard'],
      ['expensive', [0, 1, 1, 0], MCP_QUOTAS.expensivePerMinute, 'expensive'],
      ['schema', [0, 1, 1, 1], MCP_QUOTAS.schemaPerMinute, 'schema'],
    ] as const)(
      'enforces the actual %s counter budget',
      async (_name, costs, limit, kind) => {
        for (let i = 0; i < limit; i++) {
          const owner = randomUUID();
          expect(await admit([...costs], kind ? [[owner, kind]] : [])).toEqual([
            0, 0,
          ]);
          if (kind) await release(owner);
        }
        const denied = await admit(
          [...costs],
          kind ? [[randomUUID(), kind]] : []
        );
        expect(denied[0]).toBe(1);
        expect(denied[1]).toBeGreaterThan(0);
        expect(denied[1]).toBeLessThanOrEqual(MCP_QUOTAS.windowMs);
      }
    );

    it.each([
      ['standard', MCP_QUOTAS.activeTools, [0, 1, 0, 0]],
      ['expensive', MCP_QUOTAS.activeExpensive, [0, 1, 1, 0]],
      ['schema', MCP_QUOTAS.activeSchema, [0, 1, 1, 1]],
    ] as const)(
      'atomically bounds competing %s acquisitions',
      async (kind, limit, costs) => {
        const results = await Promise.all(
          Array.from({ length: limit + 1 }, () =>
            admit([...costs], [[randomUUID(), kind]])
          )
        );
        expect(results.filter(([status]) => status === 0)).toHaveLength(limit);
        expect(results.filter(([status]) => status === 2)).toHaveLength(1);
      }
    );

    it('does not reserve part of a weighted batch or charge its tool counter on rejection', async () => {
      await command(
        'SET',
        keys[2],
        MCP_QUOTAS.expensivePerMinute,
        'PX',
        MCP_QUOTAS.windowMs
      );
      expect(
        (
          await admit(
            [0, 2, 1, 0],
            [
              [randomUUID(), 'standard'],
              [randomUUID(), 'expensive'],
            ]
          )
        )[0]
      ).toBe(1);
      expect(await command('GET', keys[1])).toBeNull();
      for (const key of keys.slice(5))
        expect(await command('GET', key)).toBeNull();
    });

    it('starts the counter window once and never initializes control state during admission', async () => {
      await admit([1, 0, 0, 0]);
      const first = Number(await command('PTTL', keys[0]));
      expect(first).toBeGreaterThan(MCP_QUOTAS.windowMs - 1_000);
      expect(first).toBeLessThanOrEqual(MCP_QUOTAS.windowMs);
      await delay(30);
      await admit([1, 0, 0, 0]);
      expect(Number(await command('PTTL', keys[0]))).toBeLessThan(first);
      expect(await command('PTTL', keys[4])).toBe(-1);
      expect(await command('HLEN', keys[4])).toBe(1);
    });

    it('renews verified owners with the configured TTL and checks all owners before changing TTLs', async () => {
      const first = randomUUID(),
        second = randomUUID();
      await admit(
        [0, 2, 0, 0],
        [
          [first, 'standard'],
          [second, 'standard'],
        ]
      );
      await command('PEXPIRE', keys[5], 1_000);
      expect(await renew(first)).toEqual([0, 0]);
      expect(Number(await command('PTTL', keys[5]))).toBeGreaterThan(
        MCP_QUOTAS.leaseMs - 1_000
      );
      await command('PEXPIRE', keys[5], 1_000);
      await command('DEL', keys[6]);
      expect((await renew(first, second))[0]).toBe(4);
      expect(Number(await command('PTTL', keys[5]))).toBeLessThanOrEqual(1_000);
    });

    it('cannot resurrect a released lease during a renewal/release race', async () => {
      const owner = randomUUID();
      await admit([0, 1, 0, 0], [[owner, 'standard']]);
      await Promise.all([renew(owner), release(owner)]);
      expect(await command('GET', keys[5])).toBeNull();
      const replacement = randomUUID();
      await admit([0, 1, 0, 0], [[replacement, 'standard']]);
      expect((await renew(owner))[0]).toBe(4);
      await release(owner);
      expect(JSON.parse(String(await command('GET', keys[5])))[0]).toBe(
        replacement
      );
    });

    it(
      'recovers abandoned owners through the full native 45-second TTL without release or renewal',
      async () => {
        const owners = Array.from({ length: MCP_QUOTAS.activeTools }, () =>
          randomUUID()
        );
        expect(
          await admit(
            [0, owners.length, 0, 0],
            owners.map((owner) => [owner, 'standard'])
          )
        ).toEqual([0, 0]);
        const ttl = Number(await command('PTTL', keys[5]));
        expect(ttl).toBeGreaterThan(MCP_QUOTAS.leaseMs - 1_000);
        expect(ttl).toBeLessThanOrEqual(MCP_QUOTAS.leaseMs);
        expect(
          (await admit([0, 1, 0, 0], [[randomUUID(), 'standard']]))[0]
        ).toBe(2);
        await delay(MCP_QUOTAS.leaseMs + 100);
        for (const key of keys.slice(5))
          expect(await command('GET', key)).toBeNull();
        expect((await renew(owners[0]))[0]).toBe(4);
        const replacement = randomUUID();
        expect(await admit([0, 1, 0, 0], [[replacement, 'standard']])).toEqual([
          0, 0,
        ]);
        await release(...owners);
        expect(JSON.parse(String(await command('GET', keys[5])))[0]).toBe(
          replacement
        );
      },
      MCP_QUOTAS.leaseMs + 5_000
    );
  }
);
