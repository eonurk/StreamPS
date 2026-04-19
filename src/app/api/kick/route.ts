
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
        return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    try {
        // Fetch from Kick API (Server-side)
        const response = await fetch(`https://kick.com/api/v1/channels/${username}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            return NextResponse.json({ error: `Kick API returned ${response.status}` }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching from Kick:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { username, title, token } = body;

        if (!username || !title || !token) {
            return NextResponse.json({ error: 'Username, title, and token are required' }, { status: 400 });
        }

        // Kick API endpoint for updating channel attributes
        const response = await fetch(`https://kick.com/api/v2/channels/${username}/attributes`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ title })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Kick Update Error:', errorText);
            return NextResponse.json({ error: `Kick API returned ${response.status}: ${errorText}` }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error) {
        console.error('Error updating Kick stream info:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
