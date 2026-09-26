import bcrypt from 'bcryptjs';
import { getDb } from '../db/database';
import { createOrganization } from '../repositories/organization.repository';
import { createUser, findUserByEmail, sanitizeUser } from '../repositories/user.repository';
import { signAuthToken } from '../utils/jwt';
import { LoginInput, RegisterInput } from '../utils/validation';

const SALT_ROUNDS = 12;

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('An account with this email already exists.');
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid email or password.');
  }
}

export async function registerUser(input: RegisterInput) {
  const existing = findUserByEmail(input.email);
  if (existing) {
    throw new EmailAlreadyRegisteredError();
  }

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

  // First user in a new organization is made "admin" -- a simple, explicit
  // default rather than an implicit/hidden rule. better-sqlite3 transactions
  // must be synchronous, so the async hash above happens before entering it;
  // the org+user insert itself is then atomic.
  const { user, organization } = getDb().transaction(() => {
    const organization = createOrganization(input.organizationName);
    const user = createUser({
      email: input.email,
      passwordHash,
      name: input.name,
      role: 'admin',
      organizationId: organization.id
    });
    return { user, organization };
  })();

  const token = signAuthToken({ userId: user.id, organizationId: organization.id, role: user.role });

  return { token, user: sanitizeUser(user), organization };
}

export async function loginUser(input: LoginInput) {
  const user = findUserByEmail(input.email);
  if (!user) {
    throw new InvalidCredentialsError();
  }

  const passwordMatches = await bcrypt.compare(input.password, user.password_hash);
  if (!passwordMatches) {
    throw new InvalidCredentialsError();
  }

  const token = signAuthToken({ userId: user.id, organizationId: user.organization_id, role: user.role });

  return { token, user: sanitizeUser(user) };
}
