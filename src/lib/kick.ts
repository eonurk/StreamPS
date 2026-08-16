
// Server-side: called directly from API routes
export async function getKickStreamViewers(username: string): Promise<number | null> {
  try {
    const response = await fetch(`https://kick.com/api/v1/channels/${username}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
      },
      // Kick sits behind Cloudflare and can hang rather than fail
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.livestream?.viewer_count ?? null;
  } catch {
    return null;
  }
}

// Client-side: proxied through /api/kick to avoid CORS
export async function getKickChannelInfo(username: string) {
  try {
    // Fetch from our local API proxy to avoid CORS
    const response = await fetch(`/api/kick?username=${username}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch Kick channel info: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching Kick channel info:", error);
    return null;
  }
}
