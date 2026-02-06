import { NextResponse } from 'next/server';

export function verifyAdminKey(req: Request) {
    const adminKey = req.headers.get('x-trinity-admin-key');
    const expectedKey = process.env.TRINITY_ADMIN_KEY || process.env.MASTER_ACCESS_KEY;

    // If key is not set in ENV, we block all admin operations as a fail-safe
    if (!expectedKey || adminKey !== expectedKey) {
        return false;
    }
    return true;
}

export function unauthorizedResponse() {
    return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing Trinity Admin Key' },
        { status: 401 }
    );
}
