
import { NextRequest, NextResponse } from 'next/server';
import { spawn, ChildProcess } from 'child_process';
import { getTwitchStreamM3u8 } from '@/lib/twitch';

// Global variable to store the active ffmpeg process
// Note: In development, this might reset on file changes.
let activeStreamProcess: ChildProcess | null = null;
let activeStreamInfo: { twitchUser: string; startTime: number } | null = null;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { twitchUsername, kickStreamKey, quality } = body;

        if (!twitchUsername || !kickStreamKey) {
            return NextResponse.json({ error: 'Missing twitchUsername or kickStreamKey' }, { status: 400 });
        }

        if (activeStreamProcess) {
            return NextResponse.json({ error: 'A stream is already active' }, { status: 409 });
        }

        // 1. Get Twitch M3U8
        const m3u8Url = await getTwitchStreamM3u8(twitchUsername, quality || 'auto');
        if (!m3u8Url) {
            return NextResponse.json({ error: 'Could not retrieve Twitch stream. Is the channel live?' }, { status: 404 });
        }

        console.log(`Starting stream for ${twitchUsername} to Kick...`);
        console.log(`Source: ${m3u8Url}`);


        // 2. Start FFmpeg
        // Optimize for network stability:
        // -re: Read input at native frame rate (crucial for live streams)
        // -bufsize: Increase buffer size to handle network jitter
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

        const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

        // Only log essential errors or start/stop info
        ffmpegProcess.stderr.on('data', (data) => {
            const message = data.toString();
            // Filter out normal frame progress logs to keep terminal clean
            if (!message.includes('frame=') && !message.includes('fps=')) {
                console.error(`FFmpeg: ${message}`);
            }
        });

        ffmpegProcess.on('close', (code) => {
            console.log(`FFmpeg process exited with code ${code}`);
            activeStreamProcess = null;
            activeStreamInfo = null;
        });

        activeStreamProcess = ffmpegProcess;
        activeStreamInfo = {
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
    if (activeStreamProcess) {
        activeStreamProcess.kill('SIGKILL'); // Force kill
        activeStreamProcess = null;
        activeStreamInfo = null;
        return NextResponse.json({ success: true, message: 'Stream stopped' });
    } else {
        return NextResponse.json({ error: 'No active stream found' }, { status: 404 });
    }
}

export async function GET(req: NextRequest) {
    return NextResponse.json({
        active: !!activeStreamProcess,
        info: activeStreamInfo
    });
}
