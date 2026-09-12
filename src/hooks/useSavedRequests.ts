import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { readSavedRequests } from "../lib/saved-requests";
import type { SavedRequest } from "../lib/types";
export function useSavedRequests() {
  const [requests, setRequests] = useState<SavedRequest[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const read = () => {
      void readSavedRequests()
        .then((value) => {
          if (alive) {
            setRequests(value);
            setError("");
          }
        })
        .catch((error) => {
          if (alive) setError(String(error));
        });
    };
    read();
    browser.storage.onChanged.addListener(read);
    return () => {
      alive = false;
      browser.storage.onChanged.removeListener(read);
    };
  }, []);
  return { requests, error };
}
