/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                tunecamp: {
                    bg: '#0a0a0a',
                    surface: '#121212',
                }
            }
        },
    },
    plugins: [
        require('daisyui'),
    ],
    daisyui: {
        themes: [
            {
                tunecamp: {
                    "primary": "#8b5cf6",
                    "secondary": "#d946ef",
                    "accent": "#00d1e0",
                    "neutral": "#1f2937",
                    "base-100": "#0a0a0a",
                    "base-200": "#121212",
                    "base-300": "#1e1e1e",
                    "info": "#60a5fa",
                    "success": "#34d399",
                    "warning": "#fbbf24",
                    "error": "#f87171",
                },
            },
            "dark",
        ],
    },
}
