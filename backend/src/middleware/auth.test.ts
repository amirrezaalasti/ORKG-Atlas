import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

vi.mock('../config/keycloak.js', () => ({
  verifyKeycloakToken: vi.fn(),
}));

vi.mock('../config/firebase.js', () => ({
  db: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ data: () => ({ is_admin: false }) }),
      })),
    })),
  },
}));

import { verifyKeycloakToken } from '../config/keycloak.js';
import {
  requireAdmin,
  validateKeycloakToken,
  type AuthenticatedRequest,
} from '../middleware/auth.js';

const createMockRes = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res as unknown as Response;
};

describe('validateKeycloakToken', () => {
  const next = vi.fn() as NextFunction;
  const originalEnv = process.env.NODE_ENV;
  const originalDisableAuth = process.env.DISABLE_AUTH;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'development';
    // Most cases below describe the enforcing behaviour; public-access mode
    // has its own dedicated cases.
    process.env.DISABLE_AUTH = 'false';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalDisableAuth === undefined) delete process.env.DISABLE_AUTH;
    else process.env.DISABLE_AUTH = originalDisableAuth;
  });

  it('accepts valid Bearer token', async () => {
    vi.mocked(verifyKeycloakToken).mockResolvedValue({
      userId: 'user-1',
      userEmail: 'admin@example.com',
    });

    const req = {
      headers: { authorization: 'Bearer valid-token' },
    } as unknown as Request;
    const res = createMockRes();

    await validateKeycloakToken(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects invalid Bearer token', async () => {
    vi.mocked(verifyKeycloakToken).mockRejectedValue(new Error('invalid'));

    const req = {
      headers: { authorization: 'Bearer bad-token' },
    } as unknown as Request;
    const res = createMockRes();

    await validateKeycloakToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('allows dev header fallback when no token', async () => {
    const req = {
      headers: {
        'x-user-id': 'dev-user',
        'x-user-email': 'dev@example.com',
      },
    } as unknown as Request;
    const res = createMockRes();

    await validateKeycloakToken(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when no auth in production and auth is enforced', async () => {
    process.env.NODE_ENV = 'production';

    const req = { headers: {} } as unknown as Request;
    const res = createMockRes();

    await validateKeycloakToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  describe('public-access mode', () => {
    beforeEach(() => {
      delete process.env.DISABLE_AUTH;
      process.env.NODE_ENV = 'production';
    });

    it('admits an anonymous request as a guest', async () => {
      const req = { headers: {} } as unknown as AuthenticatedRequest;
      const res = createMockRes();

      await validateKeycloakToken(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(req.isGuest).toBe(true);
      expect(req.isAdmin).toBe(false);
      expect(req.userId).toBe('guest');
    });

    it('scopes the guest to the per-browser id header', async () => {
      const req = {
        headers: { 'x-guest-id': 'guest-abc123' },
      } as unknown as AuthenticatedRequest;
      const res = createMockRes();

      await validateKeycloakToken(req, res, next);

      expect(req.userId).toBe('guest-abc123');
    });

    it('ignores a malformed guest id header', async () => {
      const req = {
        headers: { 'x-guest-id': 'not a valid/id' },
      } as unknown as AuthenticatedRequest;
      const res = createMockRes();

      await validateKeycloakToken(req, res, next);

      expect(req.userId).toBe('guest');
    });

    it('still rejects an invalid Bearer token', async () => {
      vi.mocked(verifyKeycloakToken).mockRejectedValue(new Error('invalid'));

      const req = {
        headers: { authorization: 'Bearer bad-token' },
      } as unknown as Request;
      const res = createMockRes();

      await validateKeycloakToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });
});

describe('requireAdmin', () => {
  const next = vi.fn() as NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a public-access guest', async () => {
    const req = {
      headers: {},
      userId: 'guest-abc123',
      isGuest: true,
      isAdmin: false,
    } as unknown as AuthenticatedRequest;
    const res = createMockRes();

    await requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('lets a verified admin through', async () => {
    const req = {
      headers: {},
      userId: 'user-1',
      userEmail: 'admin@example.com',
      isAdmin: true,
    } as unknown as AuthenticatedRequest;
    const res = createMockRes();

    await requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
