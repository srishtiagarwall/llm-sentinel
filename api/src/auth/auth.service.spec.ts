import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from './user.entity';

function makeRepo() {
  const store: User[] = [];
  return {
    findOne: jest.fn(async ({ where: { email } }: any) => store.find((u) => u.email === email) ?? null),
    create: jest.fn((data: Partial<User>) => ({ id: `id-${store.length}`, ...data }) as User),
    save: jest.fn(async (user: User) => {
      store.push(user);
      return user;
    }),
  };
}

function makeJwt() {
  return { sign: jest.fn(() => 'signed-token') };
}

describe('AuthService', () => {
  it('registers a new user and returns a token', async () => {
    const repo = makeRepo();
    const service = new AuthService(repo as any, makeJwt() as any);
    const result = await service.register({
      tenantId: 't1',
      email: 'a@example.com',
      password: 'password123',
    });
    expect(result.token).toBe('signed-token');
    expect(repo.save).toHaveBeenCalled();
  });

  it('rejects registration with a duplicate email', async () => {
    const repo = makeRepo();
    const service = new AuthService(repo as any, makeJwt() as any);
    await service.register({ tenantId: 't1', email: 'a@example.com', password: 'password123' });
    await expect(
      service.register({ tenantId: 't1', email: 'a@example.com', password: 'different1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('logs in with correct credentials', async () => {
    const repo = makeRepo();
    const service = new AuthService(repo as any, makeJwt() as any);
    await service.register({ tenantId: 't1', email: 'a@example.com', password: 'password123' });
    const result = await service.login({ email: 'a@example.com', password: 'password123' });
    expect(result.token).toBe('signed-token');
  });

  it('rejects login with wrong password', async () => {
    const repo = makeRepo();
    const service = new AuthService(repo as any, makeJwt() as any);
    await service.register({ tenantId: 't1', email: 'a@example.com', password: 'password123' });
    await expect(service.login({ email: 'a@example.com', password: 'wrongpass' })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects login for unknown email', async () => {
    const repo = makeRepo();
    const service = new AuthService(repo as any, makeJwt() as any);
    await expect(
      service.login({ email: 'nobody@example.com', password: 'password123' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
