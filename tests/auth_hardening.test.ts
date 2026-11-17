import assert from 'assert';
import { getAuthenticatedUser } from '@/lib/auth';

/** Helper to create a mock Request-like object with headers */
function mockHeaders(headers: Record<string, string>) {
  return new Headers(headers);
}

/** Helper to temporarily set NODE_ENV */
async function withNodeEnv<T>(env: string, fn: () => Promise<T>): Promise<T> {
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = env;
    return await fn();
  } finally {
    process.env.NODE_ENV = original;
  }
}


// Test suite for authentication hardening
(async () => {
  // 1. No token, fallback allowed, NODE_ENV='test' -> should return default user
  await withNodeEnv('test', async () => {
    const user = await getAuthenticatedUser(undefined, { allowDefaultFallback: true });
    assert(user !== null, 'Expected default user in test environment');
    assert(user?.id === 'user_default_01', 'Default user id mismatch');
  });

  // 2. No token, fallback allowed, NODE_ENV='production' -> should return null
  await withNodeEnv('production', async () => {
    const user = await getAuthenticatedUser(undefined, { allowDefaultFallback: true });
    assert(user === null, 'Expected null when not in test env');
  });

  // 3. No token, fallback disallowed, any env -> should return null
  await withNodeEnv('test', async () => {
    const user = await getAuthenticatedUser(undefined, { allowDefaultFallback: false });
    assert(user === null, 'Expected null when fallback disabled');
  });

  // 4. Authorization header with Bearer token (simulated valid token):
  // This test relies on existing token validation logic; we use a dummy value that will be rejected, expecting null.
  const headers = mockHeaders({ authorization: 'Bearer invalid-token' });
  const userInvalid = await getAuthenticatedUser(headers, {});
  assert(userInvalid === null, 'Expected null for invalid token');

  console.log('All authentication hardening tests passed');
})();
