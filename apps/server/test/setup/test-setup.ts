import { db } from '../../src/knex';
import { TEST_USER } from '../../src/db/factories/test-user';

beforeAll(async () => {
  await db.migrate.latest();
});

beforeEach(async () => {
  await db.raw('PRAGMA foreign_keys = OFF');

  const tables = ['annotation', 'book', 'book_device', 'book_genre', 'device', 'genre', 'page_stat', 'progress', 'user'];

  for (const table of tables) {
    await db(table).truncate();
  }

  await db.raw('PRAGMA foreign_keys = ON');

  await db('user').insert(TEST_USER);
});

afterAll(async () => {
  await db.destroy();
});
