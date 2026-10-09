import { User } from '@koinsight/common/types';
import { createHash } from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import request from 'supertest';
import { createBookDevice } from '../db/factories/book-device-factory';
import { createBook } from '../db/factories/book-factory';
import { createDevice } from '../db/factories/device-factory';
import { createPageStat } from '../db/factories/page-stat-factory';
import { TEST_USER_ID } from '../db/factories/test-user';
import { createUser } from '../db/factories/user-factory';
import { booksRouter } from '../books/books-router';
import { db } from '../knex';
import { kosyncRouter } from '../kosync/kosync-router';
import { UserRepository } from '../kosync/user-repository';
import { statsRouter } from '../stats/stats-router';
import { authRouter } from './auth-router';
import { requireSession } from './require-session';

function appWithSession(userId: () => number | undefined) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.session = { userId: userId() } as CookieSessionInterfaces.CookieSessionObject;
    next();
  });
  app.use('/', kosyncRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/books', requireSession, booksRouter);
  app.use('/api/stats', requireSession, statsRouter);
  return app;
}

describe('multi-user', () => {
  let otherUser: User;
  let currentUserId: number | undefined;
  const app = appWithSession(() => currentUserId);

  beforeEach(async () => {
    otherUser = await createUser(db, { username: 'other' });
    currentUserId = TEST_USER_ID;
  });

  describe('session', () => {
    it('returns 401 without a session', async () => {
      currentUserId = undefined;
      const response = await request(app).get('/api/books');
      expect(response.status).toBe(401);
    });

    it('returns the current user', async () => {
      const response = await request(app).get('/api/auth/me');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({ id: TEST_USER_ID, username: 'test-user', has_sync_key: false })
      );
    });
  });

  describe('data isolation', () => {
    it("does not expose another user's books or stats", async () => {
      const otherDevice = await createDevice(db, { user_id: otherUser.id });
      const book = await createBook(db, { title: 'Other book' });
      const bookDevice = await createBookDevice(db, book, otherDevice);
      await createPageStat(db, book, bookDevice, otherDevice);

      const books = await request(app).get('/api/books');
      expect(books.status).toBe(200);
      expect(books.body).toHaveLength(0);

      const bookResponse = await request(app).get(`/api/books/${book.id}`);
      expect(bookResponse.status).toBe(404);

      const stats = await request(app).get('/api/stats');
      expect(stats.body.stats).toHaveLength(0);

      currentUserId = otherUser.id;
      const otherBooks = await request(app).get('/api/books');
      expect(otherBooks.body).toHaveLength(1);
    });

    it("only returns the user's own device data for a shared book", async () => {
      const myDevice = await createDevice(db, { user_id: TEST_USER_ID });
      const otherDevice = await createDevice(db, { user_id: otherUser.id });
      const book = await createBook(db);
      await createBookDevice(db, book, myDevice, { total_read_time: 10 });
      await createBookDevice(db, book, otherDevice, { total_read_time: 1000 });

      const response = await request(app).get(`/api/books/${book.id}`);
      expect(response.status).toBe(200);
      expect(response.body.device_data).toHaveLength(1);
      expect(response.body.total_read_time).toBe(10);
    });

    it("deleting a shared book keeps the other user's data", async () => {
      const myDevice = await createDevice(db, { user_id: TEST_USER_ID });
      const otherDevice = await createDevice(db, { user_id: otherUser.id });
      const book = await createBook(db);
      await createBookDevice(db, book, myDevice);
      await createBookDevice(db, book, otherDevice);

      const response = await request(app).delete(`/api/books/${book.id}`);
      expect(response.status).toBe(200);

      expect(await db('book').where({ id: book.id }).first()).toBeDefined();
      expect(await db('book_device').where({ book_md5: book.md5 })).toEqual([
        expect.objectContaining({ device_id: otherDevice.id }),
      ]);
    });
  });

  describe('kosync', () => {
    it('disables registration', async () => {
      const response = await request(app)
        .post('/users/create')
        .send({ username: 'new', password: 'secret' });
      expect(response.status).toBe(403);
    });

    it('authenticates with a generated sync key', async () => {
      const keyResponse = await request(app).post('/api/auth/sync-key');
      expect(keyResponse.status).toBe(200);
      const { username, key } = keyResponse.body;

      const md5 = createHash('md5').update(key).digest('hex');
      const authResponse = await request(app)
        .get('/users/auth')
        .set({ 'x-auth-user': username, 'x-auth-key': md5 });
      expect(authResponse.status).toBe(200);

      const wrongResponse = await request(app)
        .get('/users/auth')
        .set({ 'x-auth-user': username, 'x-auth-key': 'wrong' });
      expect(wrongResponse.status).toBe(401);
    });
  });
});

describe(UserRepository.findOrCreateByOidc, () => {
  beforeEach(async () => {
    // Start without the default OIDC test user
    await db('user').delete();
  });

  it('creates a user and returns it on later logins', async () => {
    const user = await UserRepository.findOrCreateByOidc({ sub: 'abc', preferred_username: 'jo' });
    expect(user).toEqual(expect.objectContaining({ username: 'jo', oidc_sub: 'abc' }));

    const again = await UserRepository.findOrCreateByOidc({ sub: 'abc', preferred_username: 'jo' });
    expect(again.id).toBe(user.id);
  });

  it('gives the first user all unowned devices', async () => {
    const device = await createDevice(db, { user_id: null });

    const first = await UserRepository.findOrCreateByOidc({ sub: 'first' });
    await createDevice(db, { id: 'later-device', user_id: null });
    await UserRepository.findOrCreateByOidc({ sub: 'second' });

    expect((await db('device').where({ id: device.id }).first()).user_id).toBe(first.id);
    expect((await db('device').where({ id: 'later-device' }).first()).user_id).toBeNull();
  });

  it('links a legacy kosync user with the same username', async () => {
    const legacy = await createUser(db, { username: 'reader' });

    const user = await UserRepository.findOrCreateByOidc({
      sub: 'xyz',
      preferred_username: 'reader',
    });
    expect(user.id).toBe(legacy.id);
  });

  it('picks a free username when it is taken by another OIDC user', async () => {
    await UserRepository.findOrCreateByOidc({ sub: 'a', preferred_username: 'sam' });
    const second = await UserRepository.findOrCreateByOidc({ sub: 'b', preferred_username: 'sam' });
    expect(second.username).toBe('sam-2');
  });
});
