import React from 'react';

/**
 * Viral Trade Card Template (Design Document)
 * To be rendered in the Telegram Mini App or Shareable PNGs.
 */
export const TradeCardTemplate = ({ 
    agentName, 
    reputation, 
    vetoRate, 
    donationAmount,
    txId 
}: any) => {
    return (
        <div style={{
            width: '400px',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
            border: '1px solid #0891b2',
            borderRadius: '16px',
            padding: '24px',
            color: 'white',
            fontFamily: 'monospace'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <span style={{ fontSize: '10px', letterSpacing: '2px', color: '#6de4ff' }}>TRINITY_SYMPHONY // TRADE_CARD</span>
                <span style={{ fontSize: '8px', color: '#475569' }}>{txId.substring(0, 10)}</span>
            </div>

            <div style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>
                {agentName.toUpperCase()}
            </div>

            <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '10px', color: '#94a3b8' }}>REPUTATION (ERC-8004)</div>
                <div style={{ fontSize: '18px', color: '#06b6d4', fontWeight: 'black' }}>{reputation}%</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '24px' }}>
                <div style={{ padding: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '8px', color: '#ef4444' }}>VETO RATE</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold' }}>{vetoRate}%</div>
                </div>
                <div style={{ padding: '8px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', borderRadius: '4px' }}>
                    <div style={{ fontSize: '8px', color: '#22c55e' }}>IMPACT (USDC)</div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold' }}>${donationAmount}</div>
                </div>
            </div>

            <div style={{ borderTop: '1px solid #334155', paddingTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '48px', height: '48px', backgroundColor: 'white', borderRadius: '4px' }}>
                    {/* QR Code Placeholder */}
                </div>
                <div style={{ fontSize: '8px', color: '#64748b' }}>
                    Scan to verify the ZKP Proof and see the Immune System logs.
                    <br />
                    Gated by x402 Protocol.
                </div>
            </div>
        </div>
    );
};
