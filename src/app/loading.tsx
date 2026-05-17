/**
 * Silent route-loading boundary.
 *
 * The landing page has its own cinematic curtain intro and the workspace has
 * its own loading states, so the global `loading.tsx` does not render any
 * visible UI - it just serves as a Suspense boundary for Next.js streaming.
 */
export default function Loading() {
  return null;
}
