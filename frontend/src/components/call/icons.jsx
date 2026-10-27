// Minimal inline icon set for the call controls (no icon library dependency).
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export const MicIcon = (p) => (<svg {...base} {...p}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>)
export const MicOffIcon = (p) => (<svg {...base} {...p}><path d="M3 3l18 18" /><path d="M9 9v2a3 3 0 0 0 5 2.2M15 9.3V6a3 3 0 0 0-5.7-1.3" /><path d="M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.6 2.8M12 18v3" /></svg>)
export const CamIcon = (p) => (<svg {...base} {...p}><rect x="3" y="6" width="13" height="12" rx="2.5" /><path d="M16 10.5l5-3v9l-5-3" /></svg>)
export const CamOffIcon = (p) => (<svg {...base} {...p}><path d="M3 3l18 18" /><path d="M7 6h6.5A2.5 2.5 0 0 1 16 8.5v4M16 16.5V17a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5v-8A2.5 2.5 0 0 1 4 6.6" /><path d="M16 10.5l5-3v9l-3-1.8" /></svg>)
export const CcIcon = (p) => (<svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 10.2a2.4 2.4 0 1 0 0 3.6M17 10.2a2.4 2.4 0 1 0 0 3.6" /></svg>)
export const ChatIcon = (p) => (<svg {...base} {...p}><path d="M4 5h16v11H9l-5 4V5z" /></svg>)
export const KeyboardIcon = (p) => (<svg {...base} {...p}><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>)
export const PhoneOffIcon = (p) => (<svg {...base} {...p}><path d="M3 14c4.5-4 13.5-4 18 0l-2.4 2.4-3-1.4v-2.5a11 11 0 0 0-7.2 0V15l-3 1.4L3 14z" /></svg>)
export const CheckIcon = (p) => (<svg {...base} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>)
export const SendIcon = (p) => (<svg {...base} {...p}><path d="M4 12l16-8-6 17-3-7-7-2z" /></svg>)
