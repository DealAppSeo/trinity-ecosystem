'use client';

// app/lead-capture.tsx
//
// The waitlist form's submit handler, ported from the inline <script> in
// DealAppSeo/aitrinitysymphony-landing/index.html. The markup it binds to is
// injected by app/page.tsx via dangerouslySetInnerHTML, which does NOT execute
// scripts — so without this component the form would render and silently do
// nothing. That is the exact failure the source file's own comment records:
// the form captured ONE lead in 217 days because a disabled legacy JWT made
// every insert 401 and the catch block only reset the button.
//
// THE KEY BELOW IS PUBLIC BY DESIGN — it is not a leak.
// A Supabase `sb_publishable_…` key authenticates as the `anon` Postgres role
// and is meant to ship in page source; what protects the data is RLS, not
// secrecy. `public.leads` allows anon INSERT and nothing else — no SELECT — so
// this key cannot read the lead list back. It is already public in the source
// repo. Do not "fix" it into an env var without setting
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY on the Vercel project first: NEXT_PUBLIC_*
// is inlined by static analysis, so an unset name silently becomes `undefined`
// and every submission fails the same silent way it did for 217 days.
//
// Do NOT change the fetch to `Prefer: return=representation` — the insert-only
// policy has no SELECT, so asking for the row back turns a successful insert
// into an error.

import { useEffect } from 'react';

const SUPABASE_URL = 'https://qnnpjhlxljtqyigedwkb.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_oB_TJLDYhncvMtqX7lLFjw_UY6RvwmK';

export default function LeadCapture() {
  useEffect(() => {
    const form = document.getElementById('waitlist-form') as HTMLFormElement | null;
    if (!form) return;

    const onSubmit = async (e: Event) => {
      e.preventDefault();
      const target = e.target as HTMLFormElement;
      const email = (target.elements.namedItem('email') as HTMLInputElement | null)?.value;
      const button = target.querySelector('button');
      if (!email || !button) return;

      const original = button.textContent;
      button.textContent = 'Joining...';
      button.disabled = true;

      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            email,
            referral_source: 'aitrinitysymphony.com',
            verification_status: 'pending',
          }),
        });

        if (response.ok || response.status === 201) {
          form.style.display = 'none';
          document.getElementById('success-msg')?.classList.add('show');
        } else {
          // Surface the real status. The original swallowed it, which is how a
          // 401 went unnoticed for 217 days.
          throw new Error(`lead insert failed: HTTP ${response.status}`);
        }
      } catch (err) {
        console.error('[lead-capture]', err);
        button.textContent = original ?? 'Get Early Access';
        button.disabled = false;
        alert('Something went wrong. Please try again.');
      }
    };

    form.addEventListener('submit', onSubmit);
    return () => form.removeEventListener('submit', onSubmit);
  }, []);

  return null;
}
