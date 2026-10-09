import { randomBytes } from 'crypto';
import { Request, Response, Router } from 'express';
import { generators } from 'openid-client';
import { UserRepository } from '../kosync/user-repository';
import { getOidcClient, redirectUri } from './oidc-client';
import { requireSession } from './require-session';

const router = Router();

router.get('/login', (req: Request, res: Response) => {
  const state = generators.state();
  const nonce = generators.nonce();
  const codeVerifier = generators.codeVerifier();

  req.session = { oidc: { state, nonce, codeVerifier } };

  const url = getOidcClient().authorizationUrl({
    scope: 'openid profile email',
    code_challenge: generators.codeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    state,
    nonce,
  });

  res.redirect(url);
});

router.get('/callback', async (req: Request, res: Response) => {
  const checks = req.session?.oidc;

  if (!checks) {
    res.redirect('/api/auth/login');
    return;
  }

  try {
    const client = getOidcClient();
    const tokenSet = await client.callback(redirectUri(), client.callbackParams(req), {
      state: checks.state,
      nonce: checks.nonce,
      code_verifier: checks.codeVerifier,
    });
    const claims = tokenSet.claims();

    const user = await UserRepository.findOrCreateByOidc({
      sub: claims.sub,
      preferred_username: claims.preferred_username,
      email: claims.email,
    });

    req.session = { userId: user.id };
    res.redirect('/');
  } catch (err) {
    console.error('OIDC callback error:', err);
    req.session = null;
    res.status(401).send('Login failed');
  }
});

router.get('/logout', (req: Request, res: Response) => {
  req.session = null;
  res.redirect('/');
});

router.get('/me', requireSession, (req: Request, res: Response) => {
  const user = req.user!;
  res.status(200).json({
    id: user.id,
    username: user.username,
    has_sync_key: Boolean(user.password_hash),
  });
});

/**
 * Generates a new sync key, used as the password for KoSync and the KoInsight plugin.
 * The key is only returned once.
 */
router.post('/sync-key', requireSession, async (req: Request, res: Response) => {
  const key = randomBytes(18).toString('base64url');

  try {
    await UserRepository.setSyncKey(req.user!.id, key);
    res.status(200).json({ username: req.user!.username, key });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate sync key' });
  }
});

export { router as authRouter };
