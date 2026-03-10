import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const X402_HEADER = 'PAYMENT-SIGNATURE';
const REPUTATION_REGISTRY_ADDRESS = '0x8004B663056A597Dffe9eCcC1965A193B7388713';

export const config = {
    matcher: [
        /*
         * Match all request paths except for:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};

export default function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const hostname = request.headers.get('host') || '';

    // --- 0. LANDING PAGE ROUTING (aitrinitysymphony.com) ---
    // Serves public/index.html (Waitlist v5) for the main landing domain.
    const isLandingDomain = hostname === 'aitrinitysymphony.com' || hostname === 'www.aitrinitysymphony.com';
    if (isLandingDomain && pathname === '/') {
        return NextResponse.rewrite(new URL('/index.html', request.url));
    }

    // --- 1. SUBDOMAIN ROUTING (Controller Gate) ---
    const isControllerSubdomain = hostname.startsWith('controller.');
    const isLoginPage = pathname === '/controller/login';
    const hasControllerAccess = request.cookies.get('trinity_access')?.value === 'true';

    if (isControllerSubdomain) {
        if (!hasControllerAccess && !isLoginPage && !pathname.startsWith('/api/')) {
            return NextResponse.redirect(new URL('/controller/login', request.url));
        }

        // Rewrite root to dashboard if authenticated
        if (pathname === '/' && hasControllerAccess) {
            return NextResponse.rewrite(new URL('/pulse/watch', request.url));
        }
    }

    // --- 1.5 REDUNDANT ROUTE CONSOLIDATION ---
    const redundantPulseRoutes = ['/pulse/dashboard', '/pulse/agents', '/pulse/sandbox'];
    if (redundantPulseRoutes.includes(pathname)) {
        return NextResponse.redirect(new URL('/pulse/watch', request.url));
    }

    // 2. AUTHENTICATION & PROTECTION (From Legacy Middleware) ---

    // Explicit Public Routes (Bypass All)
    const isPublicRoute =
        pathname === '/health' ||
        pathname === '/api/health' ||
        pathname === '/demo' ||
        pathname.startsWith('/demo/') ||
        pathname.startsWith('/api/telegram') ||
        pathname.startsWith('/api/bot') ||
        pathname.startsWith('/api/waitlist') ||
        pathname.startsWith('/api/stats') ||
        pathname.startsWith('/api/coach');
    if (isPublicRoute) return NextResponse.next();

    // Define Protected Routes
    const isControlRoute = pathname.startsWith('/api/captain') ||
        pathname.startsWith('/api/tasks') ||
        pathname.startsWith('/api/swarm-control');

    const isProtectedRoute = pathname.startsWith('/pulse/conductor') ||
        pathname.startsWith('/pulse/directives') ||
        pathname.startsWith('/pulse/sandbox');

    // Check for Access Tokens
    const role = request.cookies.get('trinity_role')?.value || 'guest';
    const hasAccess = request.cookies.has('trinity_access');

    const isFounder = role === 'founder';
    const isVerified = role === 'verified' || role === 'founder';

    // Logic for Controller/Directives Pages
    // Only redirect to /join if it's NOT a GET request (read-only allowed for guest) 
    // OR if we want to enforce auth for these specifically.
    // Given the user wants to defer signup, we'll allow GET requests.
    if (isProtectedRoute && !hasAccess && request.method !== 'GET') {
        return NextResponse.redirect(new URL('/join', request.url));
    }

    // RBAC: Guest Enforcement (Level 0 - Read Only Everywhere)
    if (role === 'guest' && request.method !== 'GET' && !isPublicRoute) {
        return NextResponse.json(
            { error: 'Verification Required: Please register to perform actions.' },
            { status: 403 }
        );
    }

    // RBAC: Control APIs (Level 2 - Founder Only)
    // Destructive or system-wide configuration changes
    if (isControlRoute && !isFounder && request.method !== 'GET') {
        return NextResponse.json(
            { error: 'Forbidden: Founder privileges required for system control.' },
            { status: 403 }
        );
    }

    // --- 3. x402 REPID GUARD (Phase 4.75) ---
    const isX402Route = pathname.startsWith('/api/agent-service') || pathname.startsWith('/api/execute');

    if (isX402Route) {
        const paymentSignature = request.headers.get(X402_HEADER);
        const agentId = request.headers.get('X-AGENT-ID'); // ERC-8004 Agent ID

        if (!paymentSignature) {
            // Return 402 Payment Required with x402 CHALLENGE
            return new NextResponse(
                JSON.stringify({ error: 'Payment Required', code: 402 }),
                {
                    status: 402,
                    headers: {
                        'Content-Type': 'application/json',
                        'PAYMENT-REQUIRED': Buffer.from(JSON.stringify({
                            x402Version: 2,
                            scheme: 'exact',
                            network: 'eip155:84532',
                            payment: { to: '0xTrinityReceivingWallet', value: '1000000' } // Example $1.00
                        })).toString('base64')
                    }
                }
            );
        }

        // Verify RepID if agentId is provided
        if (agentId) {
            // Log for RepID check (In production, this queries Supabase or the On-Chain Registry)
            console.log(`[x402-GUARD] Verifying RepID for Agent ${agentId} on route ${pathname}`);
        }
    }

    // --- 4. SUBDOMAIN FALLTHROUGH ---
    if (hostname.startsWith('controller.')) {
        return NextResponse.next();
    }

    return NextResponse.next();
}
