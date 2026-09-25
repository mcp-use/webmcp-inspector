// Adapted from mcp-use Inspector (client/auth/manufact-auth.ts); see THIRD_PARTY_NOTICES.md.
// The Inspector's popup + /auth/callback route is replaced by chrome.identity's
// web auth flow, and only bearer tokens are used: the cloud's CORS and cookie
// origin checks do not trust chrome-extension:// origins, so requests are
// cookieless and rely on the manifest's host permission.
import { browser } from "wxt/browser";

export const MANUFACT_CLOUD_URL = (
  (import.meta.env.WXT_MANUFACT_CLOUD_URL as string | undefined) ||
  "https://cloud.manufact.com"
).replace(/\/$/, "");

const SCOPES = "openid profile email offline_access";
const CLIENT_KEY = "manufact:client";
const SESSION_KEY = "manufact:session";

export interface ManufactUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface OAuthMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
  registration_endpoint?: string;
  revocation_endpoint?: string;
}

interface ClientRegistration {
  client_id: string;
  redirect_uri: string;
}

interface TokenSet {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

export interface ManufactSession {
  tokens: TokenSet;
  user: ManufactUser | null;
}

/** Thrown when no usable Manufact session exists. */
export class ManufactLoginRequiredError extends Error {
  constructor() {
    super("Sign in with Manufact to use chat.");
    this.name = "ManufactLoginRequiredError";
  }
}

async function read<T>(key: string): Promise<T | null> {
  const record = await browser.storage.local.get(key);
  return (record[key] as T | undefined) ?? null;
}

function cloudFetch(url: string, init: RequestInit = {}) {
  return fetch(url, { ...init, credentials: "omit" });
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomValue(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64Url(new Uint8Array(digest));
}

let metadataPromise: Promise<OAuthMetadata> | null = null;
function discover(): Promise<OAuthMetadata> {
  metadataPromise ??= cloudFetch(
    `${MANUFACT_CLOUD_URL}/api/auth/.well-known/openid-configuration`,
  )
    .then((response) => {
      if (!response.ok) throw new Error("Manufact sign-in is unavailable.");
      return response.json() as Promise<OAuthMetadata>;
    })
    .catch((error) => {
      metadataPromise = null;
      throw error;
    });
  return metadataPromise;
}

function redirectUri(): string {
  return browser.identity.getRedirectURL("manufact");
}

async function getClient(metadata: OAuthMetadata): Promise<ClientRegistration> {
  const uri = redirectUri();
  const stored = await read<ClientRegistration>(CLIENT_KEY);
  if (stored?.client_id && stored.redirect_uri === uri) return stored;
  if (!metadata.registration_endpoint)
    throw new Error("Manufact OAuth registration is unavailable.");
  const response = await cloudFetch(metadata.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "WebMCP Inspector",
      redirect_uris: [uri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPES,
    }),
  });
  if (!response.ok)
    throw new Error("Could not register WebMCP Inspector with Manufact.");
  const client = (await response.json()) as { client_id?: string };
  if (!client.client_id)
    throw new Error("Manufact returned no OAuth client ID.");
  const persisted = { client_id: client.client_id, redirect_uri: uri };
  await browser.storage.local.set({ [CLIENT_KEY]: persisted });
  return persisted;
}

async function exchangeToken(
  tokenEndpoint: string,
  body: Record<string, string>,
): Promise<TokenSet> {
  const response = await cloudFetch(tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token)
    throw new Error(
      payload.error_description ?? "Manufact token exchange failed.",
    );
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
}

async function fetchUser(
  metadata: OAuthMetadata,
  accessToken: string,
): Promise<ManufactUser | null> {
  if (!metadata.userinfo_endpoint) return null;
  const response = await cloudFetch(metadata.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    sub?: string;
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  };
  return data.sub
    ? { id: data.sub, name: data.name, email: data.email, image: data.picture }
    : null;
}

/**
 * Refresh tokens rotate and reuse revokes the whole family, so every side
 * panel (one per window) refreshes under a single cross-context lock and
 * re-reads storage once it holds it.
 */
async function refreshSession(
  stale: ManufactSession,
): Promise<ManufactSession | null> {
  return navigator.locks.request("manufact-token-refresh", async () => {
    const current = await read<ManufactSession>(SESSION_KEY);
    if (!current) return null;
    if (current.tokens.access_token !== stale.tokens.access_token)
      return current;
    const client = await read<ClientRegistration>(CLIENT_KEY);
    if (!current.tokens.refresh_token || !client) {
      await browser.storage.local.remove(SESSION_KEY);
      return null;
    }
    try {
      const metadata = await discover();
      const next = await exchangeToken(metadata.token_endpoint, {
        grant_type: "refresh_token",
        refresh_token: current.tokens.refresh_token,
        client_id: client.client_id,
      });
      const session = {
        ...current,
        tokens: {
          ...next,
          refresh_token: next.refresh_token ?? current.tokens.refresh_token,
        },
      };
      await browser.storage.local.set({ [SESSION_KEY]: session });
      return session;
    } catch {
      await browser.storage.local.remove(SESSION_KEY);
      return null;
    }
  });
}

/** The stored session, refreshed when the access token is about to expire. */
export async function getSession(): Promise<ManufactSession | null> {
  const session = await read<ManufactSession>(SESSION_KEY);
  if (!session?.tokens?.access_token) return null;
  if (session.tokens.expires_at > Date.now() + 30_000) return session;
  return refreshSession(session);
}

export async function getAccessToken(): Promise<string> {
  const session = await getSession();
  if (!session) throw new ManufactLoginRequiredError();
  return session.tokens.access_token;
}

export async function signIn(): Promise<ManufactSession> {
  const metadata = await discover();
  const client = await getClient(metadata);
  const verifier = randomValue(64);
  const state = randomValue();
  const url = new URL(metadata.authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.client_id);
  url.searchParams.set("redirect_uri", client.redirect_uri);
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", await codeChallenge(verifier));
  url.searchParams.set("code_challenge_method", "S256");
  // A third-party OAuth client: always ask for explicit consent.
  url.searchParams.set("prompt", "consent");

  let responseUrl: string | undefined;
  try {
    responseUrl = await browser.identity.launchWebAuthFlow({
      url: url.toString(),
      interactive: true,
    });
  } catch (error) {
    // A deleted client leaves the user on an error page they can only close.
    // Forget it so the next attempt registers a fresh one.
    await browser.storage.local.remove(CLIENT_KEY);
    throw new Error(
      error instanceof Error && /did not approve|closed/i.test(error.message)
        ? "Sign-in was cancelled."
        : `Sign-in failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!responseUrl) throw new Error("Sign-in was cancelled.");
  const result = new URL(responseUrl);
  const oauthError =
    result.searchParams.get("error_description") ??
    result.searchParams.get("error");
  if (oauthError) {
    if (/invalid_client/i.test(oauthError))
      await browser.storage.local.remove(CLIENT_KEY);
    throw new Error(oauthError);
  }
  const code = result.searchParams.get("code");
  if (!code || result.searchParams.get("state") !== state)
    throw new Error("Sign-in response was invalid. Try again.");
  const tokens = await exchangeToken(metadata.token_endpoint, {
    grant_type: "authorization_code",
    code,
    redirect_uri: client.redirect_uri,
    client_id: client.client_id,
    code_verifier: verifier,
  });
  const session = {
    tokens,
    user: await fetchUser(metadata, tokens.access_token),
  };
  await browser.storage.local.set({ [SESSION_KEY]: session });
  return session;
}

export async function signOut(): Promise<void> {
  const session = await read<ManufactSession>(SESSION_KEY);
  const client = await read<ClientRegistration>(CLIENT_KEY);
  await browser.storage.local.remove(SESSION_KEY);
  const token = session?.tokens.refresh_token ?? session?.tokens.access_token;
  if (!client || !token) return;
  try {
    const metadata = await discover();
    await cloudFetch(
      metadata.revocation_endpoint ??
        `${MANUFACT_CLOUD_URL}/api/auth/oauth2/revoke`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: client.client_id,
          token,
          token_type_hint: session?.tokens.refresh_token
            ? "refresh_token"
            : "access_token",
        }),
      },
    );
  } catch {
    // Local sign-out already happened; revocation is best effort.
  }
}

/** Clear a session the cloud no longer accepts. */
export async function forgetSession(): Promise<void> {
  await browser.storage.local.remove(SESSION_KEY);
}

export function onSessionChange(listener: () => void): () => void {
  const changed = (changes: Record<string, unknown>, area: string) => {
    if (area === "local" && SESSION_KEY in changes) listener();
  };
  browser.storage.onChanged.addListener(changed);
  return () => browser.storage.onChanged.removeListener(changed);
}
