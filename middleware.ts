import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

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

    // --- 1. SUBDOMAIN ROUTING (From Legacy Proxy) ---
    if (hostname.startsWith('controller.')) {
        if (pathname === '/') {
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
        pathname.startsWith('/api/telegram') ||
        pathname.startsWith('/api/bot');
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

    // --- 3. SUBDOMAIN FALLTHROUGH ---
    // If on controller subdomain, we've already handled / rewrite.
    // For other paths, we just want to continue.
    // Using rewrite to self can sometimes cause issues in certain environments.
    if (hostname.startsWith('controller.')) {
        return NextResponse.next();
    }

    return NextResponse.next();
}
