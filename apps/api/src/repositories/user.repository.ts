import { getDb, generateId } from '../db/database';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  organization_id: string;
  created_at: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  role: string;
  organizationId: string;
}

export function createUser(input: CreateUserInput): UserRow {
  const id = generateId('usr');
  getDb()
    .prepare(
      `INSERT INTO users (id, email, password_hash, name, role, organization_id)
       VALUES (@id, @email, @passwordHash, @name, @role, @organizationId)`
    )
    .run({ id, ...input });
  return findUserById(id)!;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
}

export function findUserById(id: string): UserRow | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function sanitizeUser(user: UserRow) {
  const { password_hash: _passwordHash, ...safe } = user;
  return safe;
}
