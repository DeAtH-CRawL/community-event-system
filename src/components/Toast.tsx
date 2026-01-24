'use client';

import { useEffect } from 'react';

type ToastProps = {
    message: string;
    type?: 'success' | 'error';
    onClose: () => void;
};

export function Toast({ message, type = 'success', onClose }: ToastProps) {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    return (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-4 rounded-2xl shadow-2xl font-black text-xs uppercase tracking-widest animate-in fade-in slide-in-from-top-4 duration-300 border border-white/10 backdrop-blur-md ${type === 'success' ? 'bg-emerald-600/90 text-white' : 'bg-red-600/90 text-white'
            }`}>
            {message}
        </div>
    );
}
