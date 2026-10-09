import { NextFunction, Request, Response } from 'express';
import { UserRepository } from '../kosync/user-repository';

/**
 * Requires a logged in web session and loads the user into req.user
 */
export const requireSession = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.session?.userId;

  if (!userId) {
    res.status(401).json({ error: 'Not logged in' });
    return;
  }

  try {
    const user = await UserRepository.getById(userId);

    if (!user) {
      req.session = null;
      res.status(401).json({ error: 'Not logged in' });
      return;
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Session middleware error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
