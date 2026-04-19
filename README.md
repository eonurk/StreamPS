# StreamPS

Currently, there is no native way to stream from PS5 to [Kick.com](https://kick.com). This dashboard allows you to broadcast your Twitch stream to Kick.

1. **Go Live on Twitch** from your PS5, Xbox, or OBS.
2. **Open StreamPS** (Download from [Releases](https://github.com/eonurk/StreamPS/releases)).
3. Enter your **Twitch Username** (Source).
4. Enter your **Kick Username** (Target) and **Stream Key** (Settings > Stream Key).
5. Click **Start Relay**.

> **Tip:** Wait 1-2 minutes after starting your Twitch stream before starting the relay to ensure segments are available (avoids "End of file" errors).

![App Dashboard Preview](/public/APP_DASHBOARD.png)

## Desktop App (Electron)

You can run StreamPS as a downloadable desktop app (Electron) so users do not need Node on their machines. FFmpeg must be on the system PATH.
