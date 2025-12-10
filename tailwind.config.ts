import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                // ONLY use these colors. Nothing else.
                obsidian: {
                    base: '#0a0a0f',
                    surface: '#12121a',
                    elevated: '#1a1a24',
                    border: '#1e1e2e',
                    'border-focus': '#3f3f50',
                },
                text: {
                    primary: '#e4e4e7',
                    secondary: '#a1a1aa',
                    muted: '#71717a',
                },
                accent: {
                    violet: '#8b5cf6',
                    'violet-hover': '#7c3aed',
                    'violet-glow': 'rgba(139, 92, 246, 0.15)',
                },
                status: {
                    online: '#22c55e',
                    working: '#f59e0b',
                    offline: '#6b7280',
                    error: '#ef4444',
                },
                gold: {
                    DEFAULT: '#f59e0b',
                    glow: 'rgba(245, 158, 11, 0.2)',
                }
            },
            fontFamily: {
                display: ['Outfit', 'system-ui', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            fontSize: {
                'xs': ['12px', { lineHeight: '16px' }],
                'sm': ['14px', { lineHeight: '20px' }],
                'base': ['16px', { lineHeight: '24px' }],
                'lg': ['18px', { lineHeight: '28px' }],
                'xl': ['20px', { lineHeight: '28px' }],
                '2xl': ['24px', { lineHeight: '32px' }],
                '3xl': ['30px', { lineHeight: '36px' }],
            },
            spacing: {
                '18': '72px',
                '88': '352px',
            },
            borderRadius: {
                'sm': '6px',
                'md': '10px',
                'lg': '16px',
                'xl': '20px',
            },
            boxShadow: {
                'glow-violet': '0 0 20px rgba(139, 92, 246, 0.3)',
                'glow-gold': '0 0 20px rgba(245, 158, 11, 0.3)',
                'card': '0 4px 24px rgba(0, 0, 0, 0.4)',
                'card-hover': '0 8px 32px rgba(0, 0, 0, 0.5)',
            },
            animation: {
                'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
                'fade-in': 'fade-in 0.4s ease-out',
                'slide-up': 'slide-up 0.3s ease-out',
            },
            keyframes: {
                'pulse-slow': {
                    '0%, 100%': { opacity: '1' },
                    '50%': { opacity: '0.7' },
                },
                'fade-in': {
                    '0%': { opacity: '0' },
                    '100%': { opacity: '1' },
                },
                'slide-up': {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
        },
    },
    plugins: [],
};

export default config;
