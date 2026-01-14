'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Check, AlertCircle, Info, X } from 'lucide-react';
import { createPortal } from 'react-dom';

// Types
export type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastContextType {
    showToast: (message: string, type: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Hook
export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

// Component
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const showToast = useCallback((message: string, type: ToastType, duration = 3000) => {
        const id = Math.random().toString(36).substring(7);
        // Haptic Feedback for Mobile
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            if (type === 'success') navigator.vibrate([10, 30, 10]);
            if (type === 'error') navigator.vibrate([30, 50, 30]);
        }

        setToasts((prev) => [...prev, { id, message, type, duration }]);

        setTimeout(() => {
            removeToast(id);
        }, duration);
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Portal to Body for Toasts */}
            {typeof document !== 'undefined' && createPortal(
                <div className="fixed bottom-24 lg:bottom-10 right-4 lg:right-10 z-[100] flex flex-col gap-3 pointer-events-none">
                    {toasts.map((toast) => (
                        <div
                            key={toast.id}
                            className={`
                                pointer-events-auto
                                flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl backdrop-blur-xl border
                                animate-in slide-in-from-bottom-5 fade-in duration-300
                                ${toast.type === 'success' ? 'bg-[#0B0B0F]/90 border-green-500/30 text-green-400' : ''}
                                ${toast.type === 'error' ? 'bg-[#0B0B0F]/90 border-red-500/30 text-red-400' : ''}
                                ${toast.type === 'info' ? 'bg-[#0B0B0F]/90 border-blue-500/30 text-blue-400' : ''}
                            `}
                        >
                            <div className={`p-1 rounded-full ${toast.type === 'success' ? 'bg-green-500/10' : toast.type === 'error' ? 'bg-red-500/10' : 'bg-blue-500/10'}`}>
                                {toast.type === 'success' && <Check className="w-4 h-4" />}
                                {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
                                {toast.type === 'info' && <Info className="w-4 h-4" />}
                            </div>
                            <span className="text-sm font-medium text-white">{toast.message}</span>
                            <button onClick={() => removeToast(toast.id)} className="ml-2 hover:bg-white/10 p-1 rounded transition-colors text-gray-500 hover:text-white">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </ToastContext.Provider>
    );
}

