import { query } from '../db/database';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: string;
  organization_id: string;
  created_at: Date;
}

export async function createUser(data: {
  email: string;
  passwordHash: string;
  name: string;
  organizationId: string;
  role?: string;
}): Promise<UserRow> {
  const result = await query<UserRow>(
    `INSERT INTO users (email, password_hash, name, organization_id, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.email, data.passwordHash, data.name, data.organizationId, data.role ?? 'member']
  );
  return result.rows[0];
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const result = await query<UserRow>(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0];
}

export async function findUserById(id: string): Promise<UserRow | undefined> {
  const result = await query<UserRow>(
    'SELECT * FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0];
}