import { Knex } from 'knex';
import bcrypt from 'bcrypt';

export async function seed(knex: Knex): Promise<void> {
  const existingAdmin = await knex('users').where({ username: 'admin' }).first();
  if (existingAdmin) return;

  const passwordHash = await bcrypt.hash('BeyondPharmacy2024!', 12);

  await knex('users').insert({
    username: 'admin',
    email: 'admin@beyondpharmacy.ca',
    password_hash: passwordHash,
    role: 'admin',
    is_active: true,
  });
}
