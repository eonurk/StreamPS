'use client';

import { useState, useEffect, useRef } from 'react';
import { Twitch, Key, Activity, Clock, Play, Square, AlertCircle, Monitor, Radio, Zap, LayoutTemplate, MessageSquare, Cast, Terminal, Wifi, Cpu } from 'lucide-react';

export default function Home() {
    const [twitchUsername, setTwitchUsername] = useState('');
    const [kickUsername, setKickUsername] = useState('');
    const [kickStreamKey, setKickStreamKey] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [streamStartTime, setStreamStartTime] = useState<number | null>(null);
    const [elapsedTime, setElapsedTime] = useState('00:00:00');
    const [activeTab, setActiveTab] = useState<'twitch' | 'kick' | 'split' | 'preview' | 'terminal'>('twitch');
    const [quality, setQuality] = useState('auto');
    const [parentHost, setParentHost] = useState('localhost');
    
    const [stats, setStats] = useState<{ fps: string; bitrate: string; speed: string } | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Load saved values
    useEffect(() => {
        const savedUser = localStorage.getItem('twitchUsername');
        const savedKickUser = localStorage.getItem('kickUsername');
        const savedKey = localStorage.getItem('kickStreamKey');
        if (savedUser) setTwitchUsername(savedUser);
        if (savedKickUser) setKickUsername(savedKickUser);
        if (savedKey) setKickStreamKey(savedKey);
    }, []);

    // Twitch embed requires an explicit parent domain; set it dynamically for deployments
    useEffect(() => {
        if (typeof window !== 'undefined' && window.location.hostname) {
            setParentHost(window.location.hostname);
        }
    }, []);

    // Auto-scroll logs
    useEffect(() => {
        if (activeTab === 'terminal') {
            logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs, activeTab]);

    // Status polling and timer
    useEffect(() => {
        checkStatus();
        const interval = setInterval(checkStatus, 2000); // Poll faster for stats (2s)

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
            setStats(data.stats || null);
            if (data.logs) setLogs(data.logs);

            if (data.active && data.info) {
                setStatusMessage(`Live: ${data.info.twitchUser}`);
                if (!streamStartTime) setStreamStartTime(data.info.startTime);
            } else if (!data.active && isStreaming) {
                setStatusMessage('Stream offline');
                setStreamStartTime(null);
                setStats(null);
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
        setActiveTab('terminal'); // Switch to terminal to show progress

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
                setStats(null);
            }
        } catch (e) {
            setStatusMessage('Failed to stop stream.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-screen selection:bg-white/10">
            {/* Header */}
            <header className="glass-panel h-16 px-6 flex items-center justify-between shrink-0 z-50">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-lg shadow-white/5">
                        <Zap size={18} className="text-black fill-black" />
                    </div>
                    <div>
                        <h1 className="font-bold text-sm tracking-tight leading-none">StreamPS</h1>
                        <p className="text-[10px] text-[#a1a1aa] font-medium tracking-wide uppercase mt-1">Relay Console</p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {isStreaming && stats && (
                        <div className="hidden md:flex items-center gap-4 mr-4 border-r border-[#27272a] pr-6 h-8">
                            <div className="flex items-center gap-2 text-xs font-mono text-[#a1a1aa]">
                                <Wifi size={14} className="text-emerald-500" />
                                <span>{stats.bitrate}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs font-mono text-[#a1a1aa]">
                                <Activity size={14} className="text-blue-500" />
                                <span>{stats.fps} FPS</span>
                            </div>
                             <div className="flex items-center gap-2 text-xs font-mono text-[#a1a1aa]">
                                <Cpu size={14} className="text-orange-500" />
                                <span>{stats.speed}</span>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-[#18181b] border border-[#27272a]">
                        <div className={`status-dot ${isStreaming ? 'online' : 'offline'}`} />
                        <span className="text-xs font-medium text-[#ededed]">{isStreaming ? 'Live Relay' : 'Standby'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-mono text-[#a1a1aa]">
                        <Clock size={14} />
                        <span>{elapsedTime}</span>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-6 overflow-hidden flex flex-col md:flex-row gap-6">
                
                {/* Configuration Panel */}
                <section className="w-full md:w-[380px] flex flex-col gap-4 shrink-0">
                    <div className="dashboard-card p-5 flex flex-col gap-6 h-full">
                        <div className="flex items-center gap-2 pb-4 border-b border-[#27272a]">
                            <Radio size={16} className="text-[#a1a1aa]" />
                            <h2 className="text-sm font-semibold text-[#ededed]">Stream Configuration</h2>
                        </div>

                        <div className="space-y-5 flex-1 overflow-y-auto pr-1">
                            <div className="input-group">
                                <label className="input-label flex items-center gap-2">
                                    <Twitch size={12} /> Source Channel
                                </label>
                                <input
                                    type="text"
                                    placeholder="Twitch Username"
                                    value={twitchUsername}
                                    onChange={(e) => setTwitchUsername(e.target.value)}
                                    className="std-input"
                                    disabled={isStreaming}
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label flex items-center gap-2">
                                    <Monitor size={12} /> Target Channel
                                </label>
                                <input
                                    type="text"
                                    placeholder="Kick Username"
                                    value={kickUsername}
                                    onChange={(e) => setKickUsername(e.target.value)}
                                    className="std-input"
                                    disabled={isStreaming}
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label flex items-center gap-2">
                                    <Key size={12} /> Stream Key
                                </label>
                                <input
                                    type="password"
                                    placeholder="sk_..."
                                    value={kickStreamKey}
                                    onChange={(e) => setKickStreamKey(e.target.value)}
                                    className="std-input font-mono text-xs"
                                    disabled={isStreaming}
                                />
                            </div>

                            <div className="input-group">
                                <label className="input-label flex items-center gap-2">
                                    <Activity size={12} /> Quality Preset
                                </label>
                                <div className="relative">
                                    <select
                                        value={quality}
                                        onChange={(e) => setQuality(e.target.value)}
                                        className="std-input appearance-none"
                                        disabled={isStreaming}
                                    >
                                        <option value="auto">Auto (Recommended)</option>
                                        <option value="source">Source (1080p+)</option>
                                        <option value="720p60">720p60</option>
                                        <option value="720p">720p</option>
                                        <option value="480p">480p</option>
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#a1a1aa]">
                                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 mt-auto border-t border-[#27272a] space-y-3">
                            {!isStreaming ? (
                                <button
                                    onClick={startStream}
                                    disabled={isLoading}
                                    className="btn btn-primary w-full gap-2 shadow-lg shadow-white/5"
                                >
                                    {isLoading ? <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : <Play size={16} fill="currentColor" />}
                                    {isLoading ? 'Starting Engine...' : 'Start Relay'}
                                </button>
                            ) : (
                                <button
                                    onClick={stopStream}
                                    disabled={isLoading}
                                    className="btn btn-danger w-full gap-2"
                                >
                                    {isLoading ? <div className="w-4 h-4 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" /> : <Square size={16} fill="currentColor" />}
                                    {isLoading ? 'Stopping...' : 'Stop Relay'}
                                </button>
                            )}
                            
                            {statusMessage && (
                                <div className="flex items-center gap-2 text-[11px] text-[#a1a1aa] justify-center bg-[#27272a]/30 py-2 rounded-md border border-[#27272a]/50">
                                    <div className={`w-1.5 h-1.5 rounded-full ${isStreaming ? 'bg-green-500' : 'bg-zinc-500'}`} />
                                    <span>{statusMessage}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Preview & Chat Panel */}
                <section className="flex-1 flex flex-col min-w-0">
                    <div className="dashboard-card flex flex-col h-full overflow-hidden">
                        {/* Tabs */}
                        <div className="h-14 border-b border-[#27272a] flex items-center px-4 justify-between bg-[#09090b]/40">
                            <div className="flex gap-1 bg-[#18181b] p-1 rounded-lg border border-[#27272a]">
                                <button onClick={() => setActiveTab('twitch')} className={`tab-btn ${activeTab === 'twitch' ? 'active' : ''}`}>
                                    Twitch Chat
                                </button>
                                <button onClick={() => setActiveTab('kick')} className={`tab-btn ${activeTab === 'kick' ? 'active' : ''}`}>
                                    Kick Chat
                                </button>
                                <button onClick={() => setActiveTab('split')} className={`tab-btn ${activeTab === 'split' ? 'active' : ''}`}>
                                    Split View
                                </button>
                                <button onClick={() => setActiveTab('preview')} className={`tab-btn ${activeTab === 'preview' ? 'active' : ''}`}>
                                    Monitor
                                </button>
                                <button onClick={() => setActiveTab('terminal')} className={`tab-btn flex items-center gap-2 ${activeTab === 'terminal' ? 'active' : ''}`}>
                                    <Terminal size={12} />
                                    Logs
                                </button>
                            </div>

                            <div className="flex gap-2">
                                {activeTab !== 'split' && activeTab !== 'preview' && activeTab !== 'terminal' && (
                                    <button
                                        onClick={() => {
                                            const url = activeTab === 'twitch'
                                                ? `https://www.twitch.tv/popout/${twitchUsername}/chat`
                                                : `https://kick.com/popout/${kickUsername}/chat`;
                                            window.open(url, '_blank', 'width=400,height=600');
                                        }}
                                        className="p-2 text-[#a1a1aa] hover:text-white hover:bg-[#27272a] rounded-md transition-colors"
                                        title="Popout Chat"
                                    >
                                        <Cast size={16} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Viewport */}
                        <div className="flex-1 bg-black/50 relative flex items-center justify-center overflow-hidden">
                            {/* Background Pattern for Empty State */}
                            <div className="absolute inset-0 opacity-20 pointer-events-none" 
                                 style={{ backgroundImage: 'radial-gradient(#333 1px, transparent 1px)', backgroundSize: '20px 20px' }} 
                            />

                            {/* Twitch View */}
                            {(activeTab === 'twitch' || activeTab === 'split') && (
                                <div className={`h-full relative z-10 ${activeTab === 'split' ? 'w-1/2 border-r border-[#27272a]' : 'w-full'}`}>
                                    {twitchUsername ? (
                                        <iframe
                                            src={`https://www.twitch.tv/embed/${twitchUsername}/chat?parent=${parentHost}&darkpopout`}
                                            height="100%"
                                            width="100%"
                                            className="w-full h-full"
                                        />
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-[#52525b] gap-3">
                                            <div className="w-12 h-12 rounded-xl bg-[#18181b] border border-[#27272a] flex items-center justify-center">
                                                <MessageSquare size={24} />
                                            </div>
                                            <p className="text-sm font-medium">Waiting for Twitch Username...</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Kick View */}
                            {(activeTab === 'kick' || activeTab === 'split') && (
                                <div className={`h-full relative z-10 ${activeTab === 'split' ? 'w-1/2' : 'w-full'}`}>
                                    {kickUsername ? (
                                        <iframe
                                            src={`https://kick.com/${kickUsername}/chatroom`}
                                            height="100%"
                                            width="100%"
                                            className="w-full h-full"
                                        />
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-[#52525b] gap-3">
                                            <div className="w-12 h-12 rounded-xl bg-[#18181b] border border-[#27272a] flex items-center justify-center">
                                                <MessageSquare size={24} />
                                            </div>
                                            <p className="text-sm font-medium">Waiting for Kick Username...</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Video Preview */}
                            {activeTab === 'preview' && (
                                <div className="w-full h-full relative z-10">
                                    {twitchUsername ? (
                                        <iframe
                                            src={`https://player.twitch.tv/?channel=${twitchUsername}&parent=${parentHost}&muted=true`}
                                            height="100%"
                                            width="100%"
                                            allowFullScreen
                                            className="w-full h-full"
                                        />
                                    ) : (
                                        <div className="h-full flex flex-col items-center justify-center text-[#52525b] gap-3 p-4">
                                            <img
                                                src="/APP_DASHBOARD.png"
                                                alt="App Dashboard Preview"
                                                className="max-w-full max-h-full object-contain"
                                            />
                                            <div className="text-center">
                                                <p className="text-sm font-medium text-[#ededed]">App Dashboard Preview</p>
                                                <p className="text-xs mt-1">This is a preview of the application dashboard.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Terminal View */}
                            {activeTab === 'terminal' && (
                                <div className="w-full h-full bg-[#0c0c0c] p-4 font-mono text-xs text-[#22c55e] overflow-y-auto z-20">
                                    {logs.length > 0 ? (
                                        logs.map((log, i) => (
                                            <div key={i} className="whitespace-pre-wrap break-all mb-1 font-medium opacity-90">
                                                <span className="text-[#52525b] mr-2">[{new Date().toLocaleTimeString()}]</span>
                                                {log}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-[#52525b]">Waiting for stream logs...</div>
                                    )}
                                    <div ref={logsEndRef} />
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
