
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();

        // Use the server-side environment variable
        const scienceUrl = process.env.TRINITY_SCIENCE_URL || 'http://localhost:8000';

        // Forward the request to the Python backend
        const response = await fetch(`${scienceUrl}/config/rewards`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Backend error: ${response.statusText}`);
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error proxying ANFIS update:', error);
        return NextResponse.json(
            { error: 'Failed to update ANFIS weights' },
            { status: 500 }
        );
    }
}
