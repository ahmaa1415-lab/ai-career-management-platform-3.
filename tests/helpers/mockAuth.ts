// Test helper providing a mock authenticated user without env mutation.
import type { AuthenticatedUser } from '@/lib/auth';

export async function getMockAuthenticatedUser(): Promise<AuthenticatedUser> {
  // Return a deterministic mock user matching the default candidate schema.
  return {
    id: 'user_default_01',
    email: 'test@example.com',
    full_name: 'Test User',
    role: 'candidate',
    is_verified: 1,
    profile_image: undefined,
    timezone: 'UTC',
    language: 'en',
  };
}
