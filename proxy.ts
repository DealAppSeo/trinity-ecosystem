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

    // --- 1. SUBDOMAIN ROUTING (From Legacy Proxy) ---
    if (hostname.startsWith('controller.')) {
        if (pathname === '/') {
            return NextResponse.rewrite(new URL('/pulse/conductor', request.url));
        }
    }

    // 2. AUTHENTICATION & PROTECTION (From Legacy Middleware) ---

    // Explicit Public Routes (Bypass All)
    const isPublicRoute = pathname === '/health' || pathname === '/api/health';
    if (isPublicRoute) return NextResponse.next();

    // Define Protected Routes
    const isControlRoute = pathname.startsWith('/api/captain') ||
        pathname.startsWith('/api/tasks') ||
        pathname.startsWith('/api/swarm-control');

    const isProtectedRoute = pathname.startsWith('/pulse/conductor') ||
        pathname.startsWith('/pulse/directives') ||
        pathname.startsWith('/pulse/sandbox');

    // Check for Access Tokens
    const hasAccess = request.cookies.has('trinity_access');
    const hasFounderKey = request.cookies.get('trinity_role')?.value === 'founder';

    // Logic for Controller/Directives
    if (isProtectedRoute && !hasAccess) {
        return NextResponse.redirect(new URL('/join', request.url));
    }

    // Logic for Control APIs (Requires Founder Key)
    if (isControlRoute && !hasFounderKey && request.method !== 'GET') {
        return NextResponse.json(
            { error: 'Forbidden: Founder key required for command actions.' },
            { status: 403 }
        );
    }

    // --- 3. SUBDOMAIN FALLTHROUGH ---
    if (hostname.startsWith('controller.')) {
        return NextResponse.rewrite(new URL(pathname, request.url));
    }

    return NextResponse.next();
}
