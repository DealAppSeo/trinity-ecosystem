import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};

export default function middleware(req: NextRequest) {
    const url = req.nextUrl;
    const hostname = req.headers.get('host') || 'aitc-gamma.vercel.app'; // Default fallback

    // Check for 'controller' subdomain
    // Matches: controller.localhost, controller.aitrinitysymphony.com, controller.vercel.app
    if (hostname.startsWith('controller.')) {
        // ALWAYS rewrite root to /pulse/conductor for now to ensure visibility
        if (url.pathname === '/') {
            return NextResponse.rewrite(new URL('/pulse/conductor', req.url));
        }

        // Allow all other paths on controller subdomain to pass through
        // This bypasses the strict token check for debugging purposes
        return NextResponse.rewrite(new URL(url.pathname, req.url));
    }

    // standard handling for main domain
    return NextResponse.next();
}
