'use client';

import dynamic from 'next/dynamic';

/**
 * /canvas — a tldraw editor.
 *
 * `ssr: false` requires a Client Component in the App Router, which is why this page carries
 * 'use client' even though it renders almost nothing itself. The real editor lives in
 * ./canvas-client so it can be code-split away from every other route in this build.
 */
const CanvasClient = dynamic(
  () => import('./canvas-client').then((m) => m.CanvasClient),
  {
    ssr: false,
    loading: () => (
      <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>Loading canvas…</div>
    ),
  },
);

export default function CanvasPage() {
  return <CanvasClient />;
}
