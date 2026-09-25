import { useCallback, useEffect, useState } from "react";
import {
  getSession,
  onSessionChange,
  signIn,
  signOut,
  type ManufactUser,
} from "../lib/manufact-auth";

export function useManufactAuth() {
  const [loaded, setLoaded] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [user, setUser] = useState<ManufactUser | null>(null);
  const [authorizing, setAuthorizing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const session = await getSession();
      setSignedIn(!!session);
      setUser(session?.user ?? null);
    } catch {
      setSignedIn(false);
      setUser(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
    // Another window's panel may sign in, out, or refresh.
    return onSessionChange(() => void load());
  }, [load]);

  const authorize = useCallback(async () => {
    setAuthorizing(true);
    setError("");
    try {
      await signIn();
      await load();
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setAuthorizing(false);
    }
  }, [load]);

  const logout = useCallback(async () => {
    await signOut();
    await load();
  }, [load]);

  return { loaded, signedIn, user, authorizing, error, authorize, logout };
}
