import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVecoPushGateway, loadVecoPushWiring } from '../../src/services/veco-push/wiring.js';

const SECRET = 'SECRETKEY123';
const URL = `https://rw-mcp.example.test/mcp?key=${SECRET}`;

function fakeLogger() {
  return { info: vi.fn(), error: vi.fn() };
}
const logged = (l: ReturnType<typeof fakeLogger>) => JSON.stringify([l.info.mock.calls, l.error.mock.calls]);

afterEach(() => vi.restoreAllMocks());

describe('createVecoPushGateway', () => {
  it('off gives null, fake gives a gateway', () => {
    expect(createVecoPushGateway({ mode: 'off', rwMcpUrl: null })).toBeNull();
    expect(createVecoPushGateway({ mode: 'fake', rwMcpUrl: null })).not.toBeNull();
  });

  it('mcp builds a gateway without any network call', () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const gw = createVecoPushGateway({ mode: 'mcp', rwMcpUrl: URL });
    expect(gw).not.toBeNull();
    expect(typeof gw?.insertReceipts).toBe('function');
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('loadVecoPushWiring', () => {
  it('URL set in production gives mcp, configured, and no secret in logs', () => {
    const l = fakeLogger();
    const r = loadVecoPushWiring({ NODE_ENV: 'production', VECO_RW_MCP_URL: URL }, l, { onInvalid: 'off' });
    expect(r.mode).toBe('mcp');
    expect(r.gateway).not.toBeNull();
    expect(l.info).toHaveBeenCalledWith({ mode: 'mcp', configured: true }, expect.any(String));
    expect(logged(l)).not.toContain(SECRET);
  });

  it('no URL in production gives off without an error', () => {
    const l = fakeLogger();
    const r = loadVecoPushWiring({ NODE_ENV: 'production' }, l, { onInvalid: 'off' });
    expect(r).toEqual({ mode: 'off', gateway: null });
    expect(l.info).toHaveBeenCalledWith({ mode: 'off', configured: false }, expect.any(String));
    expect(l.error).not.toHaveBeenCalled();
  });

  it('fake in production throws or falls back to off', () => {
    const env = { NODE_ENV: 'production', VECO_PUSH_MODE: 'fake' };
    expect(() => loadVecoPushWiring(env, fakeLogger(), { onInvalid: 'throw' })).toThrow('not allowed in production');
    const l = fakeLogger();
    expect(loadVecoPushWiring(env, l, { onInvalid: 'off' })).toEqual({ mode: 'off', gateway: null });
    expect(l.error).toHaveBeenCalledTimes(1);
    expect(l.error.mock.calls[0]?.[0].reason).toContain('not allowed in production');
  });

  it('mcp without a URL falls back to off and logs', () => {
    const l = fakeLogger();
    const r = loadVecoPushWiring({ NODE_ENV: 'production', VECO_PUSH_MODE: 'mcp' }, l, { onInvalid: 'off' });
    expect(r).toEqual({ mode: 'off', gateway: null });
    expect(l.error).toHaveBeenCalledTimes(1);
  });

  it('an invalid URL never leaks the secret', () => {
    const env = { NODE_ENV: 'production', VECO_RW_MCP_URL: 'not-a-url-' + SECRET };
    let message = '';
    try {
      loadVecoPushWiring(env, fakeLogger(), { onInvalid: 'throw' });
    } catch (err) {
      message = err instanceof Error ? err.message : '';
    }
    expect(message).not.toBe('');
    expect(message).not.toContain(SECRET);
    const l = fakeLogger();
    loadVecoPushWiring(env, l, { onInvalid: 'off' });
    expect(logged(l)).not.toContain(SECRET);
  });

  it('development default is fake', () => {
    const r = loadVecoPushWiring({}, fakeLogger(), { onInvalid: 'off' });
    expect(r.mode).toBe('fake');
    expect(r.gateway).not.toBeNull();
  });
});
