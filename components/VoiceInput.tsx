"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Mic, MicOff, Square, Loader2 } from "lucide-react";
import { Button } from "./ui/Button";
import { toast } from "sonner";

interface VoiceInputProps {
    onTranscript?: (transcript: string) => void;
    onStatusChange?: (status: "idle" | "listening" | "processing") => void;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({
    onTranscript,
    onStatusChange,
}) => {
    const [isListening, setIsListening] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [recognition, setRecognition] = useState<any>(null);

    useEffect(() => {
        if (typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            const recog = new SpeechRecognition();
            recog.continuous = false;
            recog.interimResults = false;
            recog.lang = "en-US";

            recog.onstart = () => {
                setIsListening(true);
                onStatusChange?.("listening");
            };

            recog.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                onTranscript?.(transcript);
                setIsListening(false);
                setIsProcessing(true);
                onStatusChange?.("processing");

                // Simulate processing delay
                setTimeout(() => {
                    setIsProcessing(false);
                    onStatusChange?.("idle");
                    toast.success("Voice command received");
                }, 1500);
            };

            recog.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                setIsListening(false);
                onStatusChange?.("idle");
                toast.error(`Voice error: ${event.error}`);
            };

            recog.onend = () => {
                setIsListening(false);
                if (!isProcessing) onStatusChange?.("idle");
            };

            setRecognition(recog);
        }
    }, [onTranscript, onStatusChange, isProcessing]);

    const toggleListening = useCallback(() => {
        if (!recognition) {
            toast.error("Voice recognition not supported in this browser");
            return;
        }

        if (isListening) {
            recognition.stop();
        } else {
            recognition.start();
        }
    }, [recognition, isListening]);

    return (
        <div className="flex flex-col items-center gap-4 p-6 bg-background/50 backdrop-blur-md rounded-2xl border border-white/10 shadow-xl transition-all duration-300">
            <div className="relative">
                {isListening && (
                    <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping scale-150" />
                )}
                <Button
                    variant={isListening ? "outline" : "primary"}
                    size="lg"
                    className={`rounded-full w-20 h-20 shadow-2xl transition-all duration-300 ${isListening ? 'scale-110 shadow-accent-violet/50 border-accent-violet' : 'hover:scale-105'}`}
                    onClick={toggleListening}
                    disabled={isProcessing}
                >
                    {isProcessing ? (
                        <Loader2 className="w-10 h-10 animate-spin" />
                    ) : isListening ? (
                        <Square className="w-10 h-10 fill-current" />
                    ) : (
                        <Mic className="w-10 h-10" />
                    )}
                </Button>
            </div>

            <div className="text-center">
                <h3 className="text-lg font-bold text-white mb-1">
                    {isListening ? "Listening..." : isProcessing ? "Processing..." : "Voice Input"}
                </h3>
                <p className="text-sm text-gray-400 max-w-[200px]">
                    {isListening
                        ? "Speak your command clearly"
                        : isProcessing
                            ? "Synthesizing with the Symphony..."
                            : "Tap to speak to your agents"}
                </p>
            </div>

            {isListening && (
                <div className="flex gap-1 items-end h-8">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div
                            key={i}
                            className="w-1 bg-primary rounded-full animate-pulse"
                            style={{
                                height: `${Math.random() * 100}%`,
                                animationDelay: `${i * 0.1}s`
                            }}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
