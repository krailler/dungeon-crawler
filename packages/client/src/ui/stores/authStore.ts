import { Client } from "@colyseus/sdk";

const AUTH_TOKEN_KEY = "authToken";

// Connect directly to the game server.
// In production, this would be the same origin; in dev, we bypass Vite proxy
// so the SDK's WebSocket connects directly to the Colyseus port.
// Use VITE_SERVER_URL env var to override (e.g. for LAN play).
const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.DEV
    ? `http://${window.location.hostname}:3000`
    : `${window.location.protocol}//${window.location.host}`);

type Listener = () => void;

export type AuthSnapshot = {
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  characterName: string | null;
  role: string | null;
  /** True when connection was lost but session may still be alive on the server */
  canReconnect: boolean;
};

const listeners = new Set<Listener>();
let client: Client | null = null;
let snapshot: AuthSnapshot = {
  isAuthenticated: false,
  loading: false,
  error: null,
  characterName: null,
  role: null,
  canReconnect: false,
};

function emit(): void {
  for (const fn of listeners) fn();
}

function update(partial: Partial<AuthSnapshot>): void {
  snapshot = { ...snapshot, ...partial };
  emit();
}

export const authStore = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getSnapshot(): AuthSnapshot {
    return snapshot;
  },

  /** Get or create the Colyseus client instance */
  getClient(): Client {
    if (!client) {
      client = new Client(SERVER_URL);
    }
    return client;
  },

  /** Attempt to restore a saved auth token from localStorage */
  async tryRestore(): Promise<boolean> {
    const saved = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!saved) return false;

    update({ loading: true, error: null });
    try {
      const c = this.getClient();
      c.auth.token = saved;
      const { user } = await c.auth.getUserData();
      if (user) {
        update({ isAuthenticated: true, loading: false });
        return true;
      }
      // Token invalid — clear it
      localStorage.removeItem(AUTH_TOKEN_KEY);
      update({ isAuthenticated: false, loading: false });
      return false;
    } catch {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      update({ isAuthenticated: false, loading: false });
      return false;
    }
  },

  /** Login with email and password. In dev mode, auto-registers if account doesn't exist. */
  async login(email: string, password: string): Promise<boolean> {
    update({ loading: true, error: null });
    try {
      const c = this.getClient();
      let token: string;
      try {
        ({ token } = await c.auth.signInWithEmailAndPassword(email, password));
      } catch (loginErr) {
        // In dev mode, auto-register if account not found
        if (import.meta.env.DEV) {
          try {
            ({ token } = await c.auth.registerWithEmailAndPassword(email, password));
          } catch (regErr) {
            throw loginErr;
          }
        } else {
          throw loginErr;
        }
      }
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      update({ isAuthenticated: true, loading: false });
      return true;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const msg = raw.includes("Failed to fetch")
        ? "login.connectionError"
        : raw.includes("invalid_credentials")
          ? "login.invalidCredentials"
          : raw.includes("email_malformed")
            ? "login.emailMalformed"
            : raw.includes("password_too_short") || raw.includes("Password must be at least")
              ? "login.passwordTooShort"
              : "login.unknownError";
      update({ loading: false, error: msg });
      return false;
    }
  },

  /** Logout — clear tokens and reset state */
  logout(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    const c = this.getClient();
    c.auth.signOut().catch(() => {});
    update({
      isAuthenticated: false,
      characterName: null,
      role: null,
      error: null,
      canReconnect: false,
    });
  },

  /** Kicked by server — force logout and show reason on login screen */
  kick(reason: string): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem("reconnectionToken");
    update({
      isAuthenticated: false,
      characterName: null,
      role: null,
      error: reason,
      canReconnect: false,
    });
  },

  /** Connection lost (not kicked) — session may still be alive on server */
  disconnect(): void {
    // Keep auth token + reconnection token + characterName so user can reconnect
    update({ isAuthenticated: false, error: null, canReconnect: true });
  },

  /** User clicked "Reconnect" — re-enter the game (ClientGame.init will use saved token) */
  attemptReconnect(): void {
    update({ isAuthenticated: true, error: null });
  },

  /** Reconnection attempt failed (token expired, server removed player) */
  reconnectFailed(reason: string): void {
    localStorage.removeItem("reconnectionToken");
    update({ isAuthenticated: false, canReconnect: false, error: reason });
  },

  /** Clear reconnect flag after successful reconnection */
  clearReconnect(): void {
    update({ canReconnect: false });
  },

  setCharacterName(name: string): void {
    update({ characterName: name });
  },

  setRole(role: string): void {
    update({ role });
  },
};
