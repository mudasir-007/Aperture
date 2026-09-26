import { signAuthToken, verifyAuthToken } from '../../src/utils/jwt';

describe('JWT helpers', () => {
  it('round-trips a valid payload', () => {
    const payload = { userId: 'user_1', organizationId: 'org_1', role: 'admin' };
    const token = signAuthToken(payload);
    const decoded = verifyAuthToken(token);
    expect(decoded).toEqual(payload);
  });

  it('rejects a tampered token', () => {
    const token = signAuthToken({ userId: 'u', organizationId: 'o', role: 'member' });
    const tampered = token.slice(0, -2) + 'xx';
    expect(() => verifyAuthToken(tampered)).toThrow();
  });

  it('rejects a garbage string', () => {
    expect(() => verifyAuthToken('not-a-real-token')).toThrow();
  });
});
