'use client';

/**
 * The tldraw editor itself. Split from page.tsx so it can be pulled in with `ssr: false`.
 *
 * WHY THE SPLIT IS NOT OPTIONAL, twice over:
 *
 * 1. tldraw measures and draws against the DOM. Rendering it on the server produces markup the
 *    client immediately throws away, and in the worst case a hydration mismatch.
 * 2. This repo ships the TrustRails dashboard from the same Next build. tldraw is a large
 *    dependency, and a static import here would put it in a chunk that a customer-facing route
 *    could pull in. Loading it only when /canvas is opened keeps that bill where it belongs.
 *
 * VERIFIED AGAINST THE INSTALLED PACKAGE (tldraw 5.3.2), not from documentation — tldraw.dev is
 * unreachable from this environment, so the import shape was read out of the shipped types:
 *   `export declare function Tldraw(props: TldrawProps): JSX.Element`
 *   exports map: `.` and `./tldraw.css`
 * Its peer range is `^18.2.0 || ^19.2.1`; this repo is on React 19.2.8.
 */

import { Tldraw } from 'tldraw';
import 'tldraw/tldraw.css';

/**
 * NOTHING IS SAVED YET, AND THAT IS STATED HERE RATHER THAN DISCOVERED.
 *
 * tldraw v4 had a one-prop `persistenceKey` that wrote to local storage. It is GONE in v5 — it is
 * not in the installed type definitions, and using it would have compiled to a silently ignored
 * prop, i.e. an editor that looks like it saves and does not. v5 persists through the store
 * (`TLStoreSnapshot`), which is a real piece of work and deliberately not smuggled in here.
 *
 * So: reloading this page loses the drawing. See docs/CANVAS.md for what saving needs, including
 * the part that is NOT just persistence — an agent cannot reach a browser's local storage, so
 * "agents draw too" requires a server-side document store, not a client-side one.
 */
export function CanvasClient() {
  return (
    // tldraw fills its container, so the container must have a real height or it collapses to 0.
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw />
    </div>
  );
}
