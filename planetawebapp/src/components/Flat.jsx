// Iconos planos y sólidos (sin contorno, sin emojis). Heredan el color del texto.
const I = ({ children, size, ...p }) => <svg className="fi" viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" {...p}>{children}</svg>
export const IconBell = p => <I {...p}><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" /></I>
export const IconClock = p => <I {...p}><path fillRule="evenodd" d="M12 2a10 10 0 100 20 10 10 0 000-20zm.75 5v4.69l3.5 2.1-.75 1.23-4.25-2.55V7h1.5z" /></I>
export const IconCheck = p => <I {...p}><path fillRule="evenodd" d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.4 14.4L6.6 12.4l1.4-1.4 2.6 2.6 5.4-5.4 1.4 1.4-6.8 6.8z" /></I>
export const IconCloud = p => <I {...p}><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" /></I>
export const IconMoon = p => <I {...p}><path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z" /></I>
export const IconSun = p => <I {...p}><circle cx="12" cy="12" r="5" />{[0, 45, 90, 135, 180, 225, 270, 315].map(a => <rect key={a} x="11" y="1" width="2" height="4" rx="1" transform={`rotate(${a} 12 12)`} />)}</I>
