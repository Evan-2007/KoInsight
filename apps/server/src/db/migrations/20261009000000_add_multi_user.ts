import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user', (table) => {
    table.string('oidc_sub').nullable().unique();
  });

  await knex.schema.alterTable('device', (table) => {
    table.integer('user_id').nullable().references('id').inTable('user').onDelete('CASCADE');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('device', (table) => {
    table.dropColumn('user_id');
  });

  await knex.schema.alterTable('user', (table) => {
    table.dropUnique(['oidc_sub']);
    table.dropColumn('oidc_sub');
  });
}
