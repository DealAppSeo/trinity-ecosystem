import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/request';

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Define Protected Routes
    const isControlRoute = pathname.startsWith('/api/captain') ||
        pathname.startsWith('/api/tasks') ||
        pathname.startsWith('/api/swarm-control');

    const isProtectedRoute = pathname.startsWith('/pulse/conductor') ||
        pathname.startsWith('/pulse/directives') ||
        pathname.startsWith('/pulse/sandbox');

    // 2. Check for Access Tokens
    const hasAccess = request.cookies.has('trinity_access');
    const hasFounderKey = request.cookies.get('trinity_role')?.value === 'founder';

    // 3. Logic for Controller/Directives
    if (isProtectedRoute && !hasAccess) {
        return NextResponse.redirect(new URL('/join', request.url));
    }

    // 4. Logic for Control APIs (Requires Founder Key)
    if (isControlRoute && !hasFounderKey && request.method !== 'GET') {
        return NextResponse.json(
            { error: 'Forbidden: Founder key required for command actions.' },
            { status: 403 }
        );
    }

    return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
    matcher: ['/pulse/:path*', '/api/:path*'],
};
