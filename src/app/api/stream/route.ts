
import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { lookup } from 'dns/promises';
import path from 'path';
import { getTwitchStreamM3u8, getTwitchStreamViewers } from '@/lib/twitch';
import { getKickStreamViewers } from '@/lib/kick';

export interface LogEntry {
    time: number;
    text: string;
}

interface StartParams {
    twitchUsername: string;
    kickUsername: string;
    kickStreamKey: string;
    quality: string;
    kickRtmpUrl: string;
}

interface StreamState {
    process: ChildProcess | null;
    info: { twitchUser: string; kickUser: string; startTime: number } | null;
    logs: LogEntry[];
    stats: { fps: string; bitrate: string; speed: string; time: string } | null;
    twitchViewers: number | null;
    kickViewers: number | null;
    lastTwitchViewerCheck: number;
    lastKickViewerCheck: number;
    retryCount: number;
    startParams: StartParams | null;
}

const globalForStream = globalThis as unknown as {
    streamState: StreamState | undefined;
    streamShutdownHooked: boolean | undefined;
};

if (!globalForStream.streamState) {
    globalForStream.streamState = {
        process: null,
        info: null,
        logs: [],
        stats: null,
        twitchViewers: null,
        kickViewers: null,
        lastTwitchViewerCheck: 0,
        lastKickViewerCheck: 0,
        retryCount: 0,
        startParams: null,
    };
}

const streamState = globalForStream.streamState!;
export const runtime = 'nodejs';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

// Kick hands out a per-account ingest URL. This geo-routed endpoint is only the
// fallback for when the user hasn't pasted theirs; it won't suit every account.
const DEFAULT_KICK_INGEST = 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app';

const platformDir = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux';

function addLog(text: string) {
    streamState.logs.push({ time: Date.now(), text });
    if (streamState.logs.length > 200) streamState.logs.shift();
}

// Packaged builds get FFMPEG_PATH from Electron, but `next dev` runs as its own
// process and never sees it, so look for the bundled binary here as well.
function resolveFfmpeg(): string {
    const fromEnv = process.env.FFMPEG_PATH;
    if (fromEnv && existsSync(fromEnv)) return fromEnv;

    const exe = platformDir === 'win' ? 'ffmpeg.exe' : 'ffmpeg';
    const base = path.join(process.cwd(), 'resources', 'ffmpeg');
    for (const dir of [`${platformDir}-${process.arch}`, platformDir]) {
        const candidate = path.join(base, dir, exe);
        if (existsSync(candidate)) return candidate;
    }
    return 'ffmpeg';
}

// Catch the setup mistakes that otherwise show up as a relay that says it's live
// and never sends a frame
async function preflight(rtmpServer: string, streamKey: string, isReconnect = false) {
    let url: URL;
    try {
        url = new URL(rtmpServer);
    } catch {
        throw new Error(`RTMP server is not a valid URL: "${rtmpServer}"`);
    }

    if (url.protocol !== 'rtmp:' && url.protocol !== 'rtmps:') {
        throw new Error(`RTMP server must start with rtmp:// or rtmps:// (got "${url.protocol}//")`);
    }
    if (/^rtmps?:/i.test(streamKey)) {
        throw new Error('The stream key looks like a URL — check the two fields are not swapped.');
    }
    if (/\s/.test(streamKey)) {
        throw new Error('Stream key contains a space or a line break. Re-copy it from the Kick dashboard.');
    }
    if (!streamKey.startsWith('sk_')) {
        addLog(`Warning: Kick keys normally start with "sk_", this one starts with "${streamKey.slice(0, 6)}".`);
    }

    try {
        const { address } = await lookup(url.hostname);
        addLog(`Ingest host ${url.hostname} resolves to ${address}`);
    } catch {
        // On a reconnect the host already resolved once, so a failure here is far
        // more likely a transient resolver blip than a bad URL. Let FFmpeg try —
        // blocking would spend a retry on a DNS hiccup.
        if (isReconnect) {
            addLog(`Warning: could not resolve ${url.hostname} right now, trying anyway.`);
            return;
        }
        throw new Error(
            `Ingest host "${url.hostname}" does not resolve. ` +
            'Paste the Stream URL from Kick → Creator Dashboard → Stream Key.'
        );
    }
}

// FFmpeg is a child of this server process, and Node does not take its children
// down with it. Electron SIGTERMs the server on quit, so without this the relay
// keeps pushing to Kick with no UI left to stop it.
if (!globalForStream.streamShutdownHooked) {
    globalForStream.streamShutdownHooked = true;

    const killRelay = () => {
        const proc = streamState.process;
        streamState.process = null;
        streamState.startParams = null;
        if (proc) {
            try { proc.kill('SIGKILL'); } catch { /* already gone */ }
        }
    };

    // 'exit' only allows synchronous work, which kill() is
    process.once('exit', killRelay);
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
        process.once(signal, () => {
            killRelay();
            process.exit(0);
        });
    }
}

function giveUp(reason?: string) {
    if (reason) addLog(reason);
    streamState.info = null;
    streamState.stats = null;
    streamState.startParams = null;
    streamState.retryCount = 0;
}

function scheduleRetry(saved: StartParams) {
    if (streamState.retryCount >= MAX_RETRIES) {
        giveUp('Max retries reached. Giving up.');
        return;
    }

    streamState.retryCount++;
    const attempt = streamState.retryCount;
    addLog(`Relay lost. Reconnecting in ${RETRY_DELAY_MS / 1000}s... (attempt ${attempt}/${MAX_RETRIES})`);

    setTimeout(async () => {
        // Identity check, not just null: covers stop-then-start during the wait
        if (streamState.startParams !== saved) return;
        try {
            addLog(`Reconnecting (attempt ${attempt}/${MAX_RETRIES})...`);
            await launchFFmpeg(saved, true);
        } catch (e: any) {
            addLog(`Reconnect failed: ${e.message}`);
            // No process was spawned, so no 'close' event will fire to drive the
            // next attempt. Without this the relay sits in "reconnecting" forever.
            scheduleRetry(saved);
        }
    }, RETRY_DELAY_MS);
}

async function launchFFmpeg(params: StartParams, isReconnect = false): Promise<void> {
    const { twitchUsername, kickUsername, kickStreamKey, quality, kickRtmpUrl: providedRtmpUrl } = params;

    const m3u8Url = await getTwitchStreamM3u8(twitchUsername, quality || 'auto');
    if (!m3u8Url) throw new Error('Could not retrieve Twitch stream. Is the channel live?');

    addLog(`Source: ${m3u8Url}`);

    // The sk_<region> prefix belongs to the key, not to a hostname. Building one
    // out of it gave rtmps://sk_us-west-2.kick.com, which has no DNS record.
    let rtmpServer = (providedRtmpUrl || '').trim();
    if (!rtmpServer) {
        rtmpServer = DEFAULT_KICK_INGEST;
        addLog(`No RTMP server set, falling back to ${rtmpServer}`);
        addLog('If Kick refuses the connection, paste your own Stream URL from the Creator Dashboard.');
    }

    if (rtmpServer.includes('live-video.net') && !rtmpServer.endsWith('/app') && !rtmpServer.endsWith('/app/')) {
        rtmpServer = rtmpServer.replace(/\/$/, '') + '/app';
    }

    await preflight(rtmpServer, kickStreamKey, isReconnect);

    const base = rtmpServer.endsWith('/') ? rtmpServer : rtmpServer + '/';
    const fullRtmpUrl = `${base}${kickStreamKey}`;
    addLog(`Target RTMP: ${base}***`);

    const ffmpegArgs = [
        '-headers', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        '-rw_timeout', '20000000',
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '5',
        '-i', m3u8Url,
        '-c', 'copy',
        '-bsf:a', 'aac_adtstoasc',
        '-f', 'flv',
        '-flvflags', 'no_duration_filesize',
        '-avoid_negative_ts', 'make_zero',
        fullRtmpUrl,
    ];

    const binary = resolveFfmpeg();
    addLog(`FFmpeg: ${binary}`);
    const proc = spawn(binary, ffmpegArgs);

    // Reset retry counter after 2 minutes of stable streaming
    const stabilityTimer = setTimeout(() => {
        if (streamState.process === proc) streamState.retryCount = 0;
    }, 120_000);

    // Without this, a failed spawn leaves streamState.process set and the UI
    // reports a live relay that never started
    proc.on('error', (err: NodeJS.ErrnoException) => {
        clearTimeout(stabilityTimer);
        if (streamState.process !== proc) return;

        streamState.process = null;
        streamState.stats = null;
        streamState.info = null;
        streamState.startParams = null;
        streamState.retryCount = 0;

        addLog(err.code === 'ENOENT'
            ? `FFmpeg not found at "${binary}". Put a static build in resources/ffmpeg/${platformDir}-${process.arch}/ (or resources/ffmpeg/${platformDir}/) or install ffmpeg on PATH.`
            : `Could not start FFmpeg: ${err.message}`);
    });

    proc.stderr.on('data', (data) => {
        const message = data.toString().trim();
        if (!message) return;

        addLog(message);

        if (message.includes('frame=')) {
            const fpsMatch = message.match(/fps=\s*(\d+(\.\d+)?)/);
            const bitrateMatch = message.match(/bitrate=\s*([\w\.\/]+)/);
            const speedMatch = message.match(/speed=\s*([\w\.]+)/);
            const timeMatch = message.match(/time=\s*([\d\:\.]+)/);
            if (bitrateMatch) {
                streamState.stats = {
                    fps: fpsMatch ? fpsMatch[1] : '0',
                    bitrate: bitrateMatch[1],
                    speed: speedMatch ? speedMatch[1] : '1x',
                    time: timeMatch ? timeMatch[1] : '00:00:00',
                };
            }
        } else {
            console.error(`FFmpeg: ${message}`);
        }
    });

    proc.on('close', (code) => {
        clearTimeout(stabilityTimer);
        if (streamState.process !== proc) return;

        streamState.process = null;
        streamState.stats = null;
        addLog(`Process exited with code ${code}`);

        const saved = streamState.startParams;

        if (code !== 0 && saved) {
            scheduleRetry(saved);
        } else {
            giveUp();
        }
    });

    streamState.process = proc;
    // Only set info on first start, not on reconnects
    if (!streamState.info) {
        streamState.info = { twitchUser: twitchUsername, kickUser: kickUsername, startTime: Date.now() };
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { twitchUsername, kickUsername, kickStreamKey, quality, kickRtmpUrl } = body;

        if (!twitchUsername || !kickStreamKey) {
            return NextResponse.json({ error: 'Missing twitchUsername or kickStreamKey' }, { status: 400 });
        }
        // startParams is set synchronously below, so it also guards the window
        // where launchFFmpeg is awaiting the network (and covers reconnects,
        // where there is no process but the relay is still ours)
        if (streamState.process || streamState.startParams) {
            return NextResponse.json({ error: 'A stream is already active' }, { status: 409 });
        }

        streamState.logs = [{ time: Date.now(), text: `Starting relay for ${twitchUsername} → Kick...` }];
        streamState.stats = null;
        streamState.retryCount = 0;
        streamState.twitchViewers = null;
        streamState.kickViewers = null;
        streamState.lastTwitchViewerCheck = 0;
        streamState.lastKickViewerCheck = 0;

        const params: StartParams = {
            twitchUsername,
            kickUsername: kickUsername || '',
            kickStreamKey,
            quality: quality || 'auto',
            kickRtmpUrl: kickRtmpUrl || '',
        };
        streamState.startParams = params;

        await launchFFmpeg(params);
        return NextResponse.json({ success: true, message: 'Stream started' });

    } catch (error: any) {
        streamState.startParams = null;
        console.error('Error starting stream:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE() {
    const proc = streamState.process;
    // Between retries there is no process, but the relay is still pending. Stop
    // has to work then too, otherwise it keeps reconnecting until MAX_RETRIES.
    const pendingRetry = !proc && !!streamState.startParams;

    if (!proc && !pendingRetry) {
        return NextResponse.json({ error: 'No active stream found' }, { status: 404 });
    }

    // Clear state first: the close handler and the retry timer both check it
    streamState.process = null;
    streamState.info = null;
    streamState.stats = null;
    streamState.startParams = null;
    streamState.retryCount = 0;

    if (proc) {
        // Graceful shutdown: SIGTERM, force-kill after 5s if still running
        proc.kill('SIGTERM');
        const forceKill = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5000);
        proc.once('exit', () => clearTimeout(forceKill));
    } else {
        addLog('Reconnect cancelled.');
    }

    return NextResponse.json({ success: true, message: 'Stream stopped' });
}

export async function GET() {
    const now = Date.now();

    // The client polls this every 2s, so viewer counts are refreshed in the
    // background: awaiting them here stalls the whole status response, and
    // stamping the time only after the await lets slow requests pile up.
    if (streamState.info?.twitchUser && now - streamState.lastTwitchViewerCheck > 30_000) {
        streamState.lastTwitchViewerCheck = now;
        const user = streamState.info.twitchUser;
        void getTwitchStreamViewers(user).then((count) => {
            if (streamState.info?.twitchUser === user) streamState.twitchViewers = count;
        });
    }

    if (streamState.info?.kickUser && now - streamState.lastKickViewerCheck > 60_000) {
        streamState.lastKickViewerCheck = now;
        const user = streamState.info.kickUser;
        void getKickStreamViewers(user).then((count) => {
            if (streamState.info?.kickUser === user) streamState.kickViewers = count;
        });
    }

    return NextResponse.json({
        active: !!streamState.process,
        isReconnecting: !streamState.process && !!streamState.startParams,
        retryCount: streamState.retryCount,
        info: streamState.info,
        stats: streamState.stats,
        logs: streamState.logs,
        twitchViewers: streamState.twitchViewers,
        kickViewers: streamState.kickViewers,
    });
}
