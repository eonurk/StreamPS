'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import tmi from 'tmi.js';
import Pusher from 'pusher-js';
import { getKickChannelInfo } from '@/lib/kick';
import { MessageSquare, AlertCircle } from 'lucide-react';

interface ChatMessage {
    id: string;
    platform: 'twitch' | 'kick';
    user: string;
    text: string;
    color?: string;
    timestamp: number;
}

interface UnifiedChatProps {
    twitchUsername: string;
    kickUsername: string;
    kickChatroomId?: string;
}

export default function UnifiedChat({ twitchUsername, kickUsername, kickChatroomId }: UnifiedChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [kickConnected, setKickConnected] = useState(false);
    const [twitchConnected, setTwitchConnected] = useState(false);
    const [kickError, setKickError] = useState<string | null>(null);
    const [unreadCount, setUnreadCount] = useState(0);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Handle Title and Visibility
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                setUnreadCount(0);
                document.title = "StreamPS";
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            document.title = "StreamPS";
        };
    }, []);

    useEffect(() => {
        if (unreadCount > 0) {
            document.title = `(${unreadCount}) StreamPS`;
        }
    }, [unreadCount]);

    const addMessage = useCallback((msg: ChatMessage) => {
        setMessages(prev => {
            const newMessages = [...prev, msg];
            if (newMessages.length > 200) newMessages.shift(); // Keep last 200
            return newMessages;
        });

        if (document.hidden) {
            setUnreadCount(prev => prev + 1);
        }
    }, []);

    // Twitch Connection
    useEffect(() => {
        if (!twitchUsername) return;

        const client = new tmi.Client({
            channels: [twitchUsername],
            connection: {
                secure: true,
                reconnect: true
            }
        });

        client.connect().then(() => {
            setTwitchConnected(true);
            console.log("[Twitch] Connected to chat");
        }).catch(console.error);

        client.on('message', (channel, tags, message, self) => {
            if (self) return;
            addMessage({
                id: tags.id || Math.random().toString(),
                platform: 'twitch',
                user: tags['display-name'] || tags.username || 'Anonymous',
                text: message,
                color: tags.color || '#a855f7', // Default purple
                timestamp: Date.now()
            });
        });

        return () => {
            client.disconnect();
            setTwitchConnected(false);
        };
    }, [twitchUsername, addMessage]);

    // Kick Connection
    useEffect(() => {
        if (!kickUsername && !kickChatroomId) return;

        let pusher: Pusher | null = null;
        let channel: any = null;

        const connectKick = async () => {
            try {
                let chatroomId = kickChatroomId;

                if (!chatroomId && kickUsername) {
                    const info = await getKickChannelInfo(kickUsername);
                    if (info && info.chatroom && info.chatroom.id) {
                         chatroomId = info.chatroom.id;
                    } else {
                         setKickError("Could not fetch Kick Chatroom ID (Check Console)");
                         return;
                    }
                }

                if (!chatroomId) return;

                console.log(`[Kick] Connecting to Chatroom ID: ${chatroomId}`);

                pusher = new Pusher('32cbd69e4b950bf97679', {
                    cluster: 'us2',
                });

                channel = pusher.subscribe(`chatrooms.${chatroomId}.v2`);

                channel.bind('App\Events\ChatMessageEvent', (data: any) => {
                    addMessage({
                        id: data.id,
                        platform: 'kick',
                        user: data.sender.username,
                        text: data.content,
                        color: data.sender.identity?.color || '#53fc18', // Default Kick green
                        timestamp: Date.now()
                    });
                });

                pusher.connection.bind('connected', () => {
                     setKickConnected(true);
                     setKickError(null);
                });

                pusher.connection.bind('error', (err: any) => {
                    console.error("[Kick] Pusher Error:", err);
                    setKickConnected(false);
                });

            } catch (e) {
                console.error("[Kick] Connection failed:", e);
                setKickError("Failed to connect to Kick");
            }
        };

        connectKick();

        return () => {
            if (channel && pusher) channel.unbind_all();
            if (pusher) pusher.disconnect();
            setKickConnected(false);
        };
    }, [kickUsername, kickChatroomId, addMessage]);

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] font-sans text-sm relative">
             {/* Connection Status Bar */}
            <div className="flex items-center gap-4 px-3 py-1 bg-[#18181b] border-b border-[#27272a] text-[10px] uppercase font-bold tracking-wider shrink-0">
                <div className={`flex items-center gap-1.5 ${twitchConnected ? 'text-purple-400' : 'text-zinc-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${twitchConnected ? 'bg-purple-500' : 'bg-zinc-500'}`} />
                    Twitch
                </div>
                <div className={`flex items-center gap-1.5 ${kickConnected ? 'text-green-400' : 'text-zinc-500'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${kickConnected ? 'bg-green-500' : 'bg-zinc-500'}`} />
                    Kick
                </div>
                 {kickError && (
                    <div className="ml-auto text-red-400 flex items-center gap-1 normal-case tracking-normal">
                         <AlertCircle size={10} /> {kickError}
                    </div>
                )}
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                     <div className="h-full flex flex-col items-center justify-center text-[#52525b] gap-2 opacity-50">
                        <MessageSquare size={24} />
                        <p>No messages yet...</p>
                    </div>
                )}
                
                {messages.map((msg) => (
                    <div key={msg.id} className="flex items-start gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
                        {/* Platform Badge */}
                        <div className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide mt-0.5 ${msg.platform === 'twitch' ? 'bg-purple-500/10 text-purple-400' : 'bg-green-500/10 text-green-400'}`}>
                            {msg.platform === 'twitch' ? 'TW' : 'KICK'}
                        </div>

                        <div className="min-w-0 flex-1 break-words leading-snug">
                            <span className="font-bold mr-2" style={{ color: msg.color }}>{msg.user}:</span>
                            <span className="text-[#e4e4e7]">{msg.text}</span>
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}
