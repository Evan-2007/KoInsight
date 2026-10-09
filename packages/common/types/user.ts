export type User = {
  id: number;
  username: string;
  password_hash: string;
  oidc_sub?: string | null;
};
