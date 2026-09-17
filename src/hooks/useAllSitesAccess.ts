import { useCallback, useEffect, useRef, useState } from "react";
import { browser } from "wxt/browser";

const origins = ["<all_urls>"];

/** Optional all-sites host permission; without it activeTab is revoked on cross-origin navigation. */
export function useAllSitesAccess() {
  const [granted, setGranted] = useState<boolean | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const read = () => {
      void browser.permissions
        .contains({ origins })
        .then((has) => {
          if (mounted.current) setGranted(has);
        })
        .catch(() => {
          if (mounted.current) setGranted(false);
        });
    };
    read();
    browser.permissions.onAdded.addListener(read);
    browser.permissions.onRemoved.addListener(read);
    return () => {
      mounted.current = false;
      browser.permissions.onAdded.removeListener(read);
      browser.permissions.onRemoved.removeListener(read);
    };
  }, []);
  // Chrome requires a user gesture, so nothing may be awaited before the request.
  const request = useCallback(async () => {
    const result = await browser.permissions.request({ origins });
    if (mounted.current) setGranted(result);
    return result;
  }, []);
  return { granted, request };
}
