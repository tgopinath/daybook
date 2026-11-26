"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** Window event the global "New" menu sends when the page it targets is already open. */
export const CREATE_EVENT = "pad:create";
type CreateDetail = { path: string; param: string; value: string };

/** Ask the current page to open its create form (used instead of navigating to the same URL). */
export function dispatchCreate(path: string, param: string, value: string) {
  window.dispatchEvent(new CustomEvent<CreateDetail>(CREATE_EVENT, { detail: { path, param, value } }));
}

/**
 * Deep link into a page's create form: `/reminders?new=1`, `/finance?add=expense`, `/drive?upload=1`.
 * Reads the param once on mount, removes it from the URL (router.replace) and calls `onCreate(value)`.
 * Also answers the "New" menu while the page is already open (see `dispatchCreate`).
 * Uses window.location instead of useSearchParams so pages need no Suspense boundary.
 */
export function useCreateParam(param: string, onCreate: (value: string) => void) {
  const router = useRouter();
  const cb = useRef(onCreate);
  cb.current = onCreate;
  const handled = useRef(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const value = url.searchParams.get(param);
    if (value && !handled.current) {
      handled.current = true;
      url.searchParams.delete(param);
      router.replace(url.pathname + url.search + url.hash, { scroll: false });
      cb.current(value);
    }
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<CreateDetail>).detail;
      if (d && d.param === param && d.path === window.location.pathname) cb.current(d.value);
    };
    window.addEventListener(CREATE_EVENT, onEvent);
    return () => window.removeEventListener(CREATE_EVENT, onEvent);
  }, [param]); // eslint-disable-line react-hooks/exhaustive-deps
}
