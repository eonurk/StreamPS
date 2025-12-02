
import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import { getTwitchStreamM3u8 } from '@/lib/twitch';

// Define the shape of our state
interface StreamState {
    process: ChildProcess | null;
    info: { twitchUser: string; startTime: number } | null;
    logs: string[];
    stats: { fps: string; bitrate: string; speed: string; time: string } | null;
}

// Augment the global scope to include our state
const globalForStream = globalThis as unknown as {
    streamState: StreamState | undefined;
};

// Initialize if it doesn't exist (singleton pattern)
if (!globalForStream.streamState) {
    globalForStream.streamState = {
        process: null,
        info: null,
        logs: [],
        stats: null
    };
}

// Use this reference for all operations
const streamState = globalForStream.streamState!;

// Ensure this handler always runs in a Node runtime (not Edge)
export const runtime = 'nodejs';

const ffmpegBinary = process.env.FFMPEG_PATH || 'ffmpeg';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { twitchUsername, kickStreamKey, quality } = body;

        if (!twitchUsername || !kickStreamKey) {
            return NextResponse.json({ error: 'Missing twitchUsername or kickStreamKey' }, { status: 400 });
        }

        if (streamState.process) {
            return NextResponse.json({ error: 'A stream is already active' }, { status: 409 });
        }

        // 1. Get Twitch M3U8
        const m3u8Url = await getTwitchStreamM3u8(twitchUsername, quality || 'auto');
        if (!m3u8Url) {
            return NextResponse.json({ error: 'Could not retrieve Twitch stream. Is the channel live?' }, { status: 404 });
        }

        // Reset logs and stats for new session
        streamState.logs = [`Starting stream for ${twitchUsername}...`, `Source: ${m3u8Url}`];
        streamState.stats = null;

        console.log(`Starting stream for ${twitchUsername} to Kick...`);

        // 2. Start FFmpeg
        const kickRtmpUrl = `rtmps://fa723fc1b171.global-contribute.live-video.net/app/${kickStreamKey}`;

        const ffmpegArgs = [
            '-re',
            '-i', m3u8Url,
            '-c', 'copy',
            '-f', 'flv',
            '-bufsize', '6000k', // Increase buffer
            '-max_muxing_queue_size', '1024',
            kickRtmpUrl
        ];

        const ffmpegProcess = spawn(ffmpegBinary, ffmpegArgs);

        ffmpegProcess.stderr.on('data', (data) => {
            const message = data.toString().trim();
            if (!message) return;

            // Update Logs (Keep last 100 lines)
            streamState.logs.push(message);
            if (streamState.logs.length > 100) {
                streamState.logs.shift();
            }

            // Parse Stats
            // Example: frame=  255 fps= 30 q=-1.0 size=    1234kB time=00:00:08.50 bitrate=1188.5kbits/s speed=   1x
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
                        time: timeMatch ? timeMatch[1] : '00:00:00'
                    };
                }
            } else {
                 console.error(`FFmpeg: ${message}`);
            }
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`FFmpeg process exited with code ${code}`);
            streamState.logs.push(`Process exited with code ${code}`);
            // Only clear if it matches the current process (handle race conditions)
            if (streamState.process === ffmpegProcess) {
                streamState.process = null;
                streamState.info = null;
                streamState.stats = null;
            }
        });

        streamState.process = ffmpegProcess;
        streamState.info = {
            twitchUser: twitchUsername,
            startTime: Date.now()
        };

        return NextResponse.json({ success: true, message: 'Stream started' });

    } catch (error) {
        console.error('Error starting stream:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    if (streamState.process) {
        streamState.process.kill('SIGKILL'); // Force kill
        streamState.process = null;
        streamState.info = null;
        streamState.stats = null;
        return NextResponse.json({ success: true, message: 'Stream stopped' });
    } else {
        return NextResponse.json({ error: 'No active stream found' }, { status: 404 });
    }
}

export async function GET(req: NextRequest) {
    return NextResponse.json({
        active: !!streamState.process,
        info: streamState.info,
        stats: streamState.stats,
        logs: streamState.logs
    });
}
