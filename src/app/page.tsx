'use client';

import { useState, useEffect } from 'react';
import { Twitch, Key, Activity, Clock, Play, Square, AlertCircle, MessageSquare, Monitor } from 'lucide-react';

export default function Home() {
    const [twitchUsername, setTwitchUsername] = useState('');
    const [kickUsername, setKickUsername] = useState('');
    const [kickStreamKey, setKickStreamKey] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamStartTime, setStreamStartTime] = useState<number | null>(null);
    const [elapsedTime, setElapsedTime] = useState('00:00:00');
    const [activeTab, setActiveTab] = useState<'twitch' | 'kick' | 'split' | 'preview'>('twitch');
    const [quality, setQuality] = useState('auto');

    // Load saved values
    useEffect(() => {
        const savedUser = localStorage.getItem('twitchUsername');
        const savedKickUser = localStorage.getItem('kickUsername');
        const savedKey = localStorage.getItem('kickStreamKey');
        if (savedUser) setTwitchUsername(savedUser);
        if (savedKickUser) setKickUsername(savedKickUser);
        if (savedKey) setKickStreamKey(savedKey);
    }, []);

    // Status polling and timer
    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 5000);

        const timerInterval = setInterval(() => {
            if (isStreaming && streamStartTime) {
                const now = Date.now();
                const diff = now - streamStartTime;
                const hours = Math.floor(diff / 3600000);
                const minutes = Math.floor((diff % 3600000) / 60000);
                const seconds = Math.floor((diff % 60000) / 1000);
                setElapsedTime(
                    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
                );
            } else {
                setElapsedTime('00:00:00');
            }
        }, 1000);

        return () => {
            clearInterval(interval);
            clearInterval(timerInterval);
        };
    }, [isStreaming, streamStartTime]);

    const checkStatus = async () => {
        try {
            const res = await fetch('/api/stream');
            const data = await res.json();
            setIsStreaming(data.active);
            if (data.active && data.info) {
                setStatusMessage(`Live: ${data.info.twitchUser}`);
                setStreamStartTime(data.info.startTime);
            } else if (!data.active && isStreaming) {
                setStatusMessage('Stream offline');
                setStreamStartTime(null);
            }
        } catch (e) {
            console.error("Failed to check status", e);
        }
    };

    const startStream = async () => {
        if (!twitchUsername || !kickStreamKey) {
            setStatusMessage('Please fill in all fields.');
            return;
        }
        localStorage.setItem('twitchUsername', twitchUsername);
        localStorage.setItem('kickUsername', kickUsername);
        localStorage.setItem('kickStreamKey', kickStreamKey);

        setIsLoading(true);
        setStatusMessage('Initializing...');

        try {
            const res = await fetch('/api/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ twitchUsername, kickStreamKey, quality }),
            });

            const data = await res.json();

            if (res.ok) {
                setIsStreaming(true);
                setStatusMessage('Stream started');
                checkStatus();
            } else {
                setStatusMessage(`Error: ${data.error}`);
            }
        } catch (e) {
            setStatusMessage('Failed to start stream.');
        } finally {
            setIsLoading(false);
        }
    };

    const stopStream = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/stream', { method: 'DELETE' });
            if (res.ok) {
                setIsStreaming(false);
                setStatusMessage('Stream stopped');
                setStreamStartTime(null);
            }
        } catch (e) {
            setStatusMessage('Failed to stop stream.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex h-screen bg-[#09090b] text-[#f4f4f5]">
            {/* Sidebar */}
            <aside className="w-64 border-r border-[#27272a] p-6 flex flex-col justify-between hidden md:flex">
                <div>
                    <div className="flex items-center gap-2 mb-10">
                        <div className="w-6 h-6 bg-white rounded-sm flex items-center justify-center">
                            <Activity size={14} className="text-black" />
                        </div>
                        <span className="font-bold text-lg tracking-tight">StreamPS</span>
                    </div>

                    <nav className="space-y-1">
                        <div className="px-3 py-2 bg-[#18181b] rounded-md text-sm font-medium text-white">Dashboard</div>
                        <div className="px-3 py-2 text-sm font-medium text-[#a1a1aa] hover:text-white cursor-pointer transition-colors">Settings</div>
                    </nav>
                </div>

                <div className="space-y-4">
                    <div className="p-4 rounded-lg border border-[#27272a] bg-[#09090b]">
                        <div className="text-xs text-[#a1a1aa] font-medium uppercase mb-2">Status</div>
                        <div className="flex items-center gap-2">
                            <div className={`status-dot ${isStreaming ? 'online' : 'offline'}`} />
                            <span className="text-sm font-medium">{isStreaming ? 'Online' : 'Offline'}</span>
                        </div>
                    </div>

                    <div className="p-4 rounded-lg border border-[#27272a] bg-[#09090b]">
                        <div className="text-xs text-[#a1a1aa] font-medium uppercase mb-2">Session</div>
                        <div className="flex items-center gap-2 font-mono text-sm">
                            <Clock size={14} className="text-[#a1a1aa]" />
                            {elapsedTime}
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Header */}
                <header className="h-16 border-b border-[#27272a] flex items-center px-8 justify-between bg-[#09090b]/50 backdrop-blur-sm">
                    <div className="flex items-center gap-2 text-sm text-[#a1a1aa]">
                        <span>StreamPS</span>
                        <span>/</span>
                        <span className="text-white">Dashboard</span>
                    </div>
                    <div className="md:hidden flex items-center gap-2">
                        <div className={`status-dot ${isStreaming ? 'online' : 'offline'}`} />
                        <span className="text-sm font-medium">{isStreaming ? 'Live' : 'Off'}</span>
                    </div>
                </header>

                {/* Dashboard Grid */}
                <div className="flex-1 overflow-auto p-8">
                    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

                        {/* Config Column */}
                        <div className="lg:col-span-1 space-y-6">
                            <div className="dashboard-card p-6 space-y-6">
                                <h2 className="text-base font-semibold">Configuration</h2>

                                <div className="space-y-4">
                                    <div className="input-group">
                                        <label className="input-label flex items-center gap-2">
                                            <Twitch size={14} /> Twitch Username
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. shroud"
                                            value={twitchUsername}
                                            onChange={(e) => setTwitchUsername(e.target.value)}
                                            className="std-input"
                                            disabled={isStreaming}
                                        />
                                    </div>

                                    <div className="input-group">
                                        <label className="input-label flex items-center gap-2">
                                            <Monitor size={14} /> Kick Username
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g. trainwreckstv"
                                            value={kickUsername}
                                            onChange={(e) => setKickUsername(e.target.value)}
                                            className="std-input"
                                            disabled={isStreaming}
                                        />
                                    </div>

                                    <div className="input-group">
                                        <label className="input-label flex items-center gap-2">
                                            <Key size={14} /> Kick Stream Key
                                        </label>
                                        <input
                                            type="password"
                                            placeholder="sk_..."
                                            value={kickStreamKey}
                                            onChange={(e) => setKickStreamKey(e.target.value)}
                                            className="std-input"
                                            disabled={isStreaming}
                                        />
                                    </div>

                                    <div className="input-group">
                                        <label className="input-label flex items-center gap-2">
                                            <Activity size={14} /> Stream Quality
                                        </label>
                                        <select
                                            value={quality}
                                            onChange={(e) => setQuality(e.target.value)}
                                            className="std-input"
                                            disabled={isStreaming}
                                        >
                                            <option value="auto">Auto (Stable 720p)</option>
                                            <option value="source">Source (Best Quality)</option>
                                            <option value="720p60">720p60 (High Framerate)</option>
                                            <option value="720p">720p (Standard)</option>
                                            <option value="480p">480p (Low Bandwidth)</option>
                                            <option value="360p">360p (Very Low)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="pt-2">
                                    {!isStreaming ? (
                                        <button
                                            onClick={startStream}
                                            disabled={isLoading}
                                            className="btn btn-primary w-full gap-2"
                                        >
                                            <Play size={16} fill="currentColor" />
                                            {isLoading ? 'Starting...' : 'Start Stream'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={stopStream}
                                            disabled={isLoading}
                                            className="btn btn-danger w-full gap-2"
                                        >
                                            <Square size={16} fill="currentColor" />
                                            {isLoading ? 'Stopping...' : 'Stop Stream'}
                                        </button>
                                    )}
                                </div>

                                {statusMessage && (
                                    <div className="flex items-start gap-2 text-xs text-[#a1a1aa] bg-[#27272a]/30 p-3 rounded-md">
                                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                                        <span>{statusMessage}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Preview/Chat Column */}
                        <div className="lg:col-span-2 h-[600px] lg:h-auto flex flex-col">
                            <div className="dashboard-card flex-1 overflow-hidden flex flex-col">
                                <div className="h-10 border-b border-[#27272a] bg-[#18181b] flex items-center px-4 justify-between">
                                    <div className="flex gap-4">
                                        <button
                                            onClick={() => setActiveTab('twitch')}
                                            className={`text-xs font-medium uppercase tracking-wider h-10 border-b-2 px-2 transition-colors ${activeTab === 'twitch' ? 'border-white text-white' : 'border-transparent text-[#a1a1aa] hover:text-white'}`}
                                        >
                                            Twitch Chat
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('kick')}
                                            className={`text-xs font-medium uppercase tracking-wider h-10 border-b-2 px-2 transition-colors ${activeTab === 'kick' ? 'border-white text-white' : 'border-transparent text-[#a1a1aa] hover:text-white'}`}
                                        >
                                            Kick Chat
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('split')}
                                            className={`text-xs font-medium uppercase tracking-wider h-10 border-b-2 px-2 transition-colors ${activeTab === 'split' ? 'border-white text-white' : 'border-transparent text-[#a1a1aa] hover:text-white'}`}
                                        >
                                            Split View
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('preview')}
                                            className={`text-xs font-medium uppercase tracking-wider h-10 border-b-2 px-2 transition-colors ${activeTab === 'preview' ? 'border-white text-white' : 'border-transparent text-[#a1a1aa] hover:text-white'}`}
                                        >
                                            Video Preview
                                        </button>
                                    </div>
                                    <div className="flex gap-2">
                                        {activeTab !== 'split' && activeTab !== 'preview' && (
                                            <button
                                                onClick={() => {
                                                    const url = activeTab === 'twitch'
                                                        ? `https://www.twitch.tv/popout/${twitchUsername}/chat`
                                                        : `https://kick.com/popout/${kickUsername}/chat`;
                                                    window.open(url, '_blank', 'width=400,height=600');
                                                }}
                                                className="p-2 text-[#a1a1aa] hover:text-white transition-colors"
                                                title="Open Chat in New Window (Required for Kick Login)"
                                            >
                                                <Square size={16} className="rotate-45" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex-1 bg-black relative flex">
                                    {(activeTab === 'twitch' || activeTab === 'split') && (
                                        <div className={`h-full ${activeTab === 'split' ? 'w-1/2 border-r border-[#27272a]' : 'w-full'}`}>
                                            {twitchUsername ? (
                                                <iframe
                                                    src={`https://www.twitch.tv/embed/${twitchUsername}/chat?parent=localhost&darkpopout`}
                                                    height="100%"
                                                    width="100%"
                                                    className="w-full h-full"
                                                />
                                            ) : (
                                                <div className="h-full flex flex-col items-center justify-center text-[#27272a]">
                                                    <Twitch size={24} className="mb-2" />
                                                    <p className="text-sm font-medium">No Twitch User</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {(activeTab === 'kick' || activeTab === 'split') && (
                                        <div className={`h-full ${activeTab === 'split' ? 'w-1/2' : 'w-full'}`}>
                                            {kickUsername ? (
                                                <iframe
                                                    src={`https://kick.com/${kickUsername}/chatroom`}
                                                    height="100%"
                                                    width="100%"
                                                    className="w-full h-full"
                                                />
                                            ) : (
                                                <div className="h-full flex flex-col items-center justify-center text-[#27272a]">
                                                    <div className="w-6 h-6 bg-[#27272a] rounded-sm flex items-center justify-center mb-2 text-[#09090b] font-bold text-xs">K</div>
                                                    <p className="text-sm font-medium">No Kick User</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {activeTab === 'preview' && (
                                        <div className="w-full h-full">
                                            {twitchUsername ? (
                                                <iframe
                                                    src={`https://player.twitch.tv/?channel=${twitchUsername}&parent=localhost&muted=true`}
                                                    height="100%"
                                                    width="100%"
                                                    allowFullScreen
                                                    className="w-full h-full"
                                                />
                                            ) : (
                                                <div className="h-full flex flex-col items-center justify-center text-[#27272a]">
                                                    <Play size={24} className="mb-2" />
                                                    <p className="text-sm font-medium">Enter a username to preview stream</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </main>
        </div>
    );
}
