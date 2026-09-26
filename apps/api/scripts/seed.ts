import bcrypt from 'bcryptjs';
import { createUser, findUserByEmail } from '../src/repositories/user.repository';
import { createOrganization } from '../src/repositories/organization.repository';
import { getDb, closeDb } from '../src/db/database';

async function main() {
  const existing = findUserByEmail('demo@example.com');
  if (existing) {
    // eslint-disable-next-line no-console
    console.log('Seed data already present, skipping.');
    return;
  }

  const passwordHash = await bcrypt.hash('password123', 12);

  getDb().transaction(() => {
    const organization = createOrganization('Acme Demo Org');
    createUser({
      email: 'demo@example.com',
      passwordHash,
      name: 'Demo User',
      role: 'admin',
      organizationId: organization.id
    });
  })();

  // eslint-disable-next-line no-console
  console.log('Seeded demo organization and user: demo@example.com / password123');
}

main()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    closeDb();
  });
