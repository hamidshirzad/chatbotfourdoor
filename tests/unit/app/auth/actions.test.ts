import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks
// vi.hoisted() ensures these refs are available inside vi.mock() factories,
// which are hoisted above all const declarations.
// ---------------------------------------------------------------------------

const mockSignIn = vi.hoisted(() => vi.fn());
const mockGetUser = vi.hoisted(() => vi.fn());
const mockCreateUser = vi.hoisted(() => vi.fn());

vi.mock('@/app/(auth)/auth', () => ({ signIn: mockSignIn }));
vi.mock('@/lib/db/queries', () => ({
  getUser: mockGetUser,
  createUser: mockCreateUser,
}));

import { login, register } from '@/app/(auth)/actions';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    fd.append(key, value);
  }
  return fd;
}

const INITIAL_LOGIN = { status: 'idle' } as const;
const INITIAL_REGISTER = { status: 'idle' } as const;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe('login', () => {
  it('returns success when credentials are valid and signIn succeeds', async () => {
    mockSignIn.mockResolvedValue(undefined);

    const result = await login(
      INITIAL_LOGIN,
      makeFormData({ email: 'alice@example.com', password: 'secret123' }),
    );

    expect(result.status).toBe('success');
    expect(mockSignIn).toHaveBeenCalledWith('credentials', {
      email: 'alice@example.com',
      password: 'secret123',
      redirect: false,
    });
  });

  it('returns invalid_data when email is missing', async () => {
    const result = await login(
      INITIAL_LOGIN,
      makeFormData({ email: '', password: 'secret123' }),
    );

    expect(result.status).toBe('invalid_data');
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('returns invalid_data when email is malformed', async () => {
    const result = await login(
      INITIAL_LOGIN,
      makeFormData({ email: 'not-an-email', password: 'secret123' }),
    );

    expect(result.status).toBe('invalid_data');
  });

  it('returns invalid_data when password is too short (under 6 chars)', async () => {
    const result = await login(
      INITIAL_LOGIN,
      makeFormData({ email: 'alice@example.com', password: '123' }),
    );

    expect(result.status).toBe('invalid_data');
  });

  it('returns invalid_data when both fields are missing', async () => {
    const result = await login(
      INITIAL_LOGIN,
      makeFormData({}),
    );

    expect(result.status).toBe('invalid_data');
  });

  it('returns failed when signIn throws a non-Zod error', async () => {
    mockSignIn.mockRejectedValue(new Error('Invalid credentials'));

    const result = await login(
      INITIAL_LOGIN,
      makeFormData({ email: 'alice@example.com', password: 'wrongpassword' }),
    );

    expect(result.status).toBe('failed');
  });
});

// ---------------------------------------------------------------------------
// register
// ---------------------------------------------------------------------------

describe('register', () => {
  it('returns success when registration and sign-in both succeed', async () => {
    mockGetUser.mockResolvedValue([]); // No existing user
    mockCreateUser.mockResolvedValue(undefined);
    mockSignIn.mockResolvedValue(undefined);

    const result = await register(
      INITIAL_REGISTER,
      makeFormData({ email: 'newuser@example.com', password: 'newpass1' }),
    );

    expect(result.status).toBe('success');
    expect(mockCreateUser).toHaveBeenCalledWith('newuser@example.com', 'newpass1');
    expect(mockSignIn).toHaveBeenCalledWith('credentials', {
      email: 'newuser@example.com',
      password: 'newpass1',
      redirect: false,
    });
  });

  it('returns user_exists when the email is already registered', async () => {
    mockGetUser.mockResolvedValue([{ id: 'u1', email: 'existing@example.com', password: 'hash' }]);

    const result = await register(
      INITIAL_REGISTER,
      makeFormData({ email: 'existing@example.com', password: 'anypassword' }),
    );

    expect(result.status).toBe('user_exists');
    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('returns invalid_data when email is malformed', async () => {
    const result = await register(
      INITIAL_REGISTER,
      makeFormData({ email: 'bad-email', password: 'password123' }),
    );

    expect(result.status).toBe('invalid_data');
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('returns invalid_data when password is too short (under 6 chars)', async () => {
    const result = await register(
      INITIAL_REGISTER,
      makeFormData({ email: 'alice@example.com', password: '123' }),
    );

    expect(result.status).toBe('invalid_data');
  });

  it('returns invalid_data when both fields are missing', async () => {
    const result = await register(
      INITIAL_REGISTER,
      makeFormData({}),
    );

    expect(result.status).toBe('invalid_data');
  });

  it('returns failed when createUser throws', async () => {
    mockGetUser.mockResolvedValue([]);
    mockCreateUser.mockRejectedValue(new Error('DB error'));

    const result = await register(
      INITIAL_REGISTER,
      makeFormData({ email: 'new@example.com', password: 'password123' }),
    );

    expect(result.status).toBe('failed');
  });

  it('returns failed when signIn throws after successful registration', async () => {
    mockGetUser.mockResolvedValue([]);
    mockCreateUser.mockResolvedValue(undefined);
    mockSignIn.mockRejectedValue(new Error('Auth error'));

    const result = await register(
      INITIAL_REGISTER,
      makeFormData({ email: 'new@example.com', password: 'password123' }),
    );

    expect(result.status).toBe('failed');
  });
});
