import { query } from '../db/database';

export interface OrganizationRow {
  id: string;
  name: string;
  created_at: Date;
}

export async function createOrganization(name: string): Promise<OrganizationRow> {
  const result = await query<OrganizationRow>(
    `INSERT INTO organizations (name) VALUES ($1) RETURNING *`,
    [name]
  );
  return result.rows[0];
}

export async function findOrganizationById(id: string): Promise<OrganizationRow | undefined> {
  const result = await query<OrganizationRow>(
    'SELECT * FROM organizations WHERE id = $1',
    [id]
  );
  return result.rows[0];
}