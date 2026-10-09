import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { db } from '../knex';
import { User } from '@koinsight/common/types/user';

const SALT_ROUNDS = 12;

async function hashPassword(plain: string): Promise<string> {
  return await bcrypt.hash(plain, SALT_ROUNDS);
}

export class UserExistsError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = 'UserExistsError';
  }
}

export type OidcClaims = {
  sub: string;
  preferred_username?: string;
  email?: string;
};

export class UserRepository {
  static async login(username: string, password: string): Promise<User | null> {
    const user = await db('User').where({ username }).first();
    if (!user || !user.password_hash) {
      return null;
    }
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  static async createUser(username: string, password: string): Promise<void> {
    const existingUser = await db('User').where({ username }).first();

    if (existingUser) {
      throw new UserExistsError();
    }

    const passwordHash = await hashPassword(password);
    await db('User').insert({ username, password_hash: passwordHash });
  }

  static async getById(id: User['id']): Promise<User | undefined> {
    return db<User>('user').where({ id }).first();
  }

  /**
   * Replaces the user's sync key. KOReader sends md5(password) as x-auth-key,
   * so we store bcrypt(md5(key)) and the regular login check works unchanged.
   */
  static async setSyncKey(id: User['id'], key: string): Promise<void> {
    const md5 = createHash('md5').update(key).digest('hex');
    const password_hash = await hashPassword(md5);
    await db<User>('user').where({ id }).update({ password_hash });
  }

  static async findOrCreateByOidc(claims: OidcClaims): Promise<User> {
    const existing = await db<User>('user').where({ oidc_sub: claims.sub }).first();
    if (existing) {
      return existing;
    }

    const isFirstOidcUser = !(await db<User>('user').whereNotNull('oidc_sub').first());
    const preferredName = claims.preferred_username || claims.email || claims.sub;

    // Link a legacy KoSync user with the same username so their progress is kept
    const legacy = await db<User>('user')
      .where({ username: preferredName })
      .whereNull('oidc_sub')
      .first();

    let user: User;
    if (legacy) {
      await db<User>('user').where({ id: legacy.id }).update({ oidc_sub: claims.sub });
      user = { ...legacy, oidc_sub: claims.sub };
    } else {
      let username = preferredName;
      for (let i = 2; await db<User>('user').where({ username }).first(); i++) {
        username = `${preferredName}-${i}`;
      }
      [user] = await db<User>('user')
        .insert({ username, password_hash: '', oidc_sub: claims.sub })
        .returning('*');
    }

    // The first user inherits all data from before multi-user support
    if (isFirstOidcUser) {
      await db('device').whereNull('user_id').update({ user_id: user.id });
    }

    return user;
  }
}
