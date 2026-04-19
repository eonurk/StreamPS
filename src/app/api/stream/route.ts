
import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
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

const globalForStream = globalThis as unknown as { streamState: StreamState | undefined };

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
const ffmpegBinary = process.env.FFMPEG_PATH || 'ffmpeg';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 5000;

function addLog(text: string) {
    streamState.logs.push({ time: Date.now(), text });
    if (streamState.logs.length > 200) streamState.logs.shift();
}

async function launchFFmpeg(params: StartParams): Promise<void> {
    const { twitchUsername, kickUsername, kickStreamKey, quality, kickRtmpUrl: providedRtmpUrl } = params;

    const m3u8Url = await getTwitchStreamM3u8(twitchUsername, quality || 'auto');
    if (!m3u8Url) throw new Error('Could not retrieve Twitch stream. Is the channel live?');

    addLog(`Source: ${m3u8Url}`);

    let rtmpServer = providedRtmpUrl;
    if (!rtmpServer) {
        if (kickStreamKey.startsWith('sk_us-west-2')) {
            rtmpServer = 'rtmps://sk_us-west-2.kick.com/app';
        } else if (kickStreamKey.startsWith('sk_us-east-1')) {
            rtmpServer = 'rtmps://sk_us-east-1.kick.com/app';
        } else if (kickStreamKey.startsWith('sk_eu-west-1')) {
            rtmpServer = 'rtmps://sk_eu-west-1.kick.com/app';
        } else {
            rtmpServer = 'rtmps://fa723fc1b171.global-contribute.live-video.net/app';
        }
        addLog(`Auto-detected RTMP server: ${rtmpServer}`);
    }

    if (rtmpServer.includes('live-video.net') && !rtmpServer.endsWith('/app') && !rtmpServer.endsWith('/app/')) {
        rtmpServer = rtmpServer.replace(/\/$/, '') + '/app';
    }

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

    const proc = spawn(ffmpegBinary, ffmpegArgs);

    // Reset retry counter after 2 minutes of stable streaming
    const stabilityTimer = setTimeout(() => {
        if (streamState.process === proc) streamState.retryCount = 0;
    }, 120_000);

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

        if (code !== 0 && saved && streamState.retryCount < MAX_RETRIES) {
            streamState.retryCount++;
            const attempt = streamState.retryCount;
            addLog(`Relay lost. Reconnecting in ${RETRY_DELAY_MS / 1000}s... (attempt ${attempt}/${MAX_RETRIES})`);

            setTimeout(async () => {
                if (!streamState.startParams) return; // user stopped
                try {
                    addLog(`Reconnecting (attempt ${attempt}/${MAX_RETRIES})...`);
                    await launchFFmpeg(saved);
                } catch (e: any) {
                    addLog(`Reconnect failed: ${e.message}`);
                    if (streamState.retryCount >= MAX_RETRIES) {
                        addLog('Max retries reached. Giving up.');
                        streamState.info = null;
                        streamState.startParams = null;
                        streamState.retryCount = 0;
                    }
                }
            }, RETRY_DELAY_MS);
        } else {
            streamState.info = null;
            streamState.startParams = null;
            streamState.retryCount = 0;
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
        if (streamState.process) {
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
    if (!streamState.process) {
        return NextResponse.json({ error: 'No active stream found' }, { status: 404 });
    }

    const proc = streamState.process;
    // Clear state first so the close handler doesn't trigger auto-restart
    streamState.process = null;
    streamState.info = null;
    streamState.stats = null;
    streamState.startParams = null;
    streamState.retryCount = 0;

    // Graceful shutdown: SIGTERM, force-kill after 5s if still running
    proc.kill('SIGTERM');
    const forceKill = setTimeout(() => { try { proc.kill('SIGKILL'); } catch {} }, 5000);
    proc.once('exit', () => clearTimeout(forceKill));

    return NextResponse.json({ success: true, message: 'Stream stopped' });
}

export async function GET() {
    const now = Date.now();

    // Twitch viewers: max once every 30s
    if (streamState.info?.twitchUser && now - streamState.lastTwitchViewerCheck > 30_000) {
        streamState.twitchViewers = await getTwitchStreamViewers(streamState.info.twitchUser);
        streamState.lastTwitchViewerCheck = now;
    }

    // Kick viewers: max once every 60s
    if (streamState.info?.kickUser && now - streamState.lastKickViewerCheck > 60_000) {
        streamState.kickViewers = await getKickStreamViewers(streamState.info.kickUser);
        streamState.lastKickViewerCheck = now;
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
