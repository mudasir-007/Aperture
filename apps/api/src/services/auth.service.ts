import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import {
  createUser,
  findUserByEmail,
  findUserById,
  UserRow,
} from '../repositories/user.repository';
import { createOrganization } from '../repositories/organization.repository';
import { HttpError } from '../middleware/errorHandler';

export interface AuthResult {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    organizationId: string;
  };
}

function toPublicUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organizationId: user.organization_id,
  };
}

function signToken(user: UserRow): string {
  return jwt.sign(
    {
      userId: user.id,
      organizationId: user.organization_id,
      role: user.role,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN }
  );
}

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  organizationName: string;
}): Promise<AuthResult> {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    throw new HttpError(409, 'An account with this email already exists.');
  }

  const organization = await createOrganization(input.organizationName);
  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await createUser({
    email: input.email,
    passwordHash,
    name: input.name,
    organizationId: organization.id,
    role: 'admin', // first user of an org is admin
  });

  return {
    token: signToken(user),
    user: toPublicUser(user),
  };
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const user = await findUserByEmail(input.email);
  if (!user) {
    throw new HttpError(401, 'Invalid email or password.');
  }

  const valid = await bcrypt.compare(input.password, user.password_hash);
  if (!valid) {
    throw new HttpError(401, 'Invalid email or password.');
  }

  return {
    token: signToken(user),
    user: toPublicUser(user),
  };
}

export async function getCurrentUser(userId: string) {
  const user = await findUserById(userId);
  if (!user) throw new HttpError(404, 'User not found.');
  return toPublicUser(user);
}