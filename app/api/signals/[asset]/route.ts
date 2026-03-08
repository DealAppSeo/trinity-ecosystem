import { NextRequest, NextResponse } from 'next/server';

export async function GET(
    request: NextRequest,
    { params }: { params: { asset: string } }
) {
    const asset = params.asset.toUpperCase();

    // 1. Simulating x402 Micropayment Verification
    // In a real scenario, this would check the PAYMENT-SIGNATURE or X-PAYMENT-RESPONSE
    const hasPayment = request.headers.has('PAYMENT-SIGNATURE') || request.headers.has('X-PAYMENT-RESPONSE');

    if (!hasPayment) {
        // Return 402 Payment Required for x402 flow
        return new NextResponse(JSON.stringify({ error: "Payment required for premium signal" }), {
            status: 402,
            headers: {
                'Content-Type': 'application/json',
                'PAYMENT-REQUIRED': 'true',
                'X-PRICE-USDC': '0.01' // Micropayment price
            }
        });
    }

    // 2. Generate Premium Signal
    const signal = {
        asset,
        price: 65000 + (Math.random() * 500),
        predictedDirection: Math.random() > 0.4 ? 'LONG' : 'SHORT',
        confidence: 0.85 + (Math.random() * 0.1),
        source: 'trinity-premium-signal',
        timestamp: new Date().toISOString()
    };

    return NextResponse.json(signal, {
        headers: {
            'X-PAYMENT-RESPONSE': '0x' + Math.random().toString(16).slice(2, 66) // Mock confirmation
        }
    });
}
