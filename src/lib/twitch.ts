
export async function getTwitchStreamM3u8(channelName: string, quality: string = 'auto'): Promise<string | null> {
  try {
    console.log(`[Twitch] Fetching stream for: ${channelName} (Quality: ${quality})`);

    // 1. Get Access Token & Signature
    const gqlQuery = {
      operationName: "PlaybackAccessToken",
      variables: {
        login: channelName,
        playerType: "embed"
      },
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: "0828119ded1c134779664348596871485c815d28a38bc838173689910bf7aa36"
        }
      },
      query: `query PlaybackAccessToken($login: String!, $playerType: String!) {
  streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) {
    value
    signature
    __typename
  }
}`
    };

    const tokenResponse = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        "Client-Id": "kimne78kx3ncx6brgo4mv6wki5h1ko", // Common public client ID
        "Content-Type": "application/json"
      },
      body: JSON.stringify(gqlQuery)
    });

    if (!tokenResponse.ok) {
      console.error("[Twitch] Failed to fetch token. Status:", tokenResponse.status);
      console.error("[Twitch] Response:", await tokenResponse.text());
      return null;
    }

    const tokenData = await tokenResponse.json();

    if (tokenData.errors) {
      console.error("[Twitch] GQL Errors:", JSON.stringify(tokenData.errors, null, 2));
      return null;
    }

    const accessToken = tokenData.data?.streamPlaybackAccessToken;

    if (!accessToken) {
      console.error("[Twitch] No access token found in response:", JSON.stringify(tokenData, null, 2));
      return null;
    }

    console.log("[Twitch] Got access token. Fetching M3U8...");

    // 2. Get M3U8 Playlist
    const queryParams = new URLSearchParams({
      allow_source: "true",
      allow_audio_only: "true",
      allow_spectre: "true",
      player: "twitchweb",
      playlist_include_framerate: "true",
      segment_preference: "4",
      sig: accessToken.signature,
      token: accessToken.value,
    });

    const m3u8Url = `https://usher.ttvnw.net/api/channel/hls/${channelName}.m3u8?${queryParams.toString()}`;

    // Check if the stream is actually live by fetching the m3u8
    const m3u8Response = await fetch(m3u8Url);
    if (!m3u8Response.ok) {
      console.error("[Twitch] Failed to fetch m3u8. Status:", m3u8Response.status);
      console.error("[Twitch] Response:", await m3u8Response.text());
      return null;
    }

    const m3u8Content = await m3u8Response.text();
    const lines = m3u8Content.split('\n');

    // Helper to find URL for a specific quality tag
    const findQuality = (tag: string) => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('http')) {
          const meta = i > 0 ? lines[i - 1] : "";
          if (meta.includes(tag)) return line;
        }
      }
      return null;
    };

    // Quality Selection Logic
    if (quality === 'source') {
      // Usually the first one, or explicitly look for VIDEO="chunked"
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('http')) return lines[i];
      }
    } else if (quality === '720p60') {
      const url = findQuality('VIDEO="720p60"');
      if (url) return url;
    } else if (quality === '720p') {
      const url = findQuality('VIDEO="720p"') || findQuality('RESOLUTION=1280x720');
      if (url) return url;
    } else if (quality === '480p') {
      const url = findQuality('VIDEO="480p"') || findQuality('RESOLUTION=854x480');
      if (url) return url;
    } else if (quality === '360p') {
      const url = findQuality('VIDEO="360p"') || findQuality('RESOLUTION=640x360');
      if (url) return url;
    } else if (quality === '160p') {
      const url = findQuality('VIDEO="160p"') || findQuality('RESOLUTION=284x160');
      if (url) return url;
    }

    // Fallback Logic (Auto or if requested quality not found)
    // 1. Try 720p60
    let fallback = findQuality('VIDEO="720p60"');
    if (fallback) return fallback;

    // 2. Try 720p
    fallback = findQuality('VIDEO="720p"') || findQuality('RESOLUTION=1280x720');
    if (fallback) return fallback;

    // 3. Try 480p
    fallback = findQuality('VIDEO="480p"') || findQuality('RESOLUTION=854x480');
    if (fallback) return fallback;

    // 4. Just take the first one (Source)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('http')) return lines[i];
    }

    return m3u8Url;
  } catch (error) {
    console.error("[Twitch] Error fetching Twitch stream:", error);
    return null;
  }
}
