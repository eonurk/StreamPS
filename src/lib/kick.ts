
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
