// components/trustrails/LiveReceiptFeed.tsx
// TrustRails Sprint — Created March 26 2026 by Gemini

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function LiveReceiptFeed() {
  const [receipts, setReceipts] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/trustrails/receipts');
      const data = await res.json();
      setReceipts(data.receipts || []);
    };
    load();

    const sub = supabase
      .channel('public:kya_compliance_receipts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kya_compliance_receipts' }, () => {
        load();
      })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  }, []);

  return (
    <div>
      <h3 style={{ color: '#f1f5f9', marginBottom: 16, fontSize: 16, fontWeight: 600 }}>
        Live Compliance Receipts
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '600px', overflowY: 'auto' }}>
        {receipts.length === 0 ? (
          <div style={{ color: '#64748b', fontSize: 13 }}>No receipts found.</div>
        ) : (
          receipts.map(r => (
            <div key={r.receipt_id} style={{
              background: '#1e293b',
              borderLeft: `4px solid ${r.bft_passed ? '#22c55e' : '#ef4444'}`,
              borderRadius: 8,
              padding: 16,
              fontSize: 13,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#f8fafc', fontWeight: 600 }}>{r.agent_name}</span>
                <span style={{ color: r.bft_passed ? '#4ade80' : '#f87171' }}>
                  {r.bft_passed ? 'COMPLIANT' : 'BLOCKED'}
                </span>
              </div>
              <div style={{ color: '#94a3b8', marginBottom: 8 }}>
                <strong>Amount:</strong> {r.payment_amount_usdc} USDC
              </div>
              
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ background: '#0f172a', padding: '2px 6px', borderRadius: 4, color: '#e2e8f0', fontSize: 11 }}>
                  RepID: {r.agent_repid_score}
                </span>
                {r.fireblocks_preauth_id && (
                  <span style={{ background: '#0f172a', padding: '2px 6px', borderRadius: 4, color: '#38bdf8', fontSize: 11 }}>
                    {r.fireblocks_preauth_id}
                  </span>
                )}
                {r.solana_tx_hash && (
                  <span style={{ background: '#0f172a', padding: '2px 6px', borderRadius: 4, color: '#a78bfa', fontSize: 11 }}>
                    Tx: {r.solana_tx_hash.slice(0, 8)}...
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
