"use client";

import { useCacheState } from "@/store/slices/cacheSlice";
import type { SuspenseResource } from "@/types/suspense";

/**
 * Read a Suspense resource in a component. Subscribes to the cache so a
 * background stale-while-revalidate fetch re-renders the component with fresh
 * data when it completes; `resource.read()` throws the pending promise (for the
 * enclosing Suspense boundary) or the error (for the ErrorBoundary).
 */
export function useSuspenseResource<T>(resource: SuspenseResource<T>): T {
  useCacheState(); // re-render on cache updates (SWR revalidation)
  return resource.read();
}
