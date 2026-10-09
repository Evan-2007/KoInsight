import { User } from '@koinsight/common/types';
import { NextFunction, Request, Response } from 'express';

/**
 * Created before each test by test-setup.ts
 */
export const TEST_USER: User = {
  id: 1,
  username: 'test-user',
  password_hash: '',
  oidc_sub: 'test-sub',
};
export const TEST_USER_ID = TEST_USER.id;

/**
 * Stands in for requireSession in router tests
 */
export function asTestUser(req: Request, _res: Response, next: NextFunction) {
  req.user = TEST_USER;
  next();
}
