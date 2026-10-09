import { BaseClient, Issuer } from 'openid-client';
import { appConfig } from '../config';

let client: BaseClient | undefined;

export const redirectUri = () => `${appConfig.auth.appUrl}/api/auth/callback`;

export async function initOidcClient(): Promise<void> {
  const { issuerUrl, clientId, clientSecret, appUrl, sessionSecret } = appConfig.auth;
  const missing = Object.entries({
    OIDC_ISSUER_URL: issuerUrl,
    OIDC_CLIENT_ID: clientId,
    OIDC_CLIENT_SECRET: clientSecret,
    APP_URL: appUrl,
    SESSION_SECRET: sessionSecret,
  })
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const issuer = await Issuer.discover(issuerUrl);
  client = new issuer.Client({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: [redirectUri()],
    response_types: ['code'],
  });
}

export function getOidcClient(): BaseClient {
  if (!client) {
    throw new Error('OIDC client has not been initialized');
  }
  return client;
}
