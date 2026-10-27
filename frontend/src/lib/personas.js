// The interviewer characters. `id` is what the backend stores and whitelists (backend/app/core/personas.py, which also
// holds each character's server voice); `look` drives the SVG in components/Avatar.jsx.

export const PERSONAS = [
  {
    id: 'aria', name: 'Aria', gender: 'f', tagline: 'Warm and encouraging',
    look: {
      skin: '#E6B08E', skinShade: '#D39A78', hair: '#2A1B16', hairHi: '#4A332A', lip: '#B8524F', eye: '#5B3A24',
      hairStyle: 'side', beard: null, glasses: false, earrings: '#E8D6A0',
      blazer: ['#33466A', '#1F2C47'], lapel: '#26365A', shirt: '#F3F0EA', pin: '#C9A24B',
    },
  },
  {
    id: 'arjun', name: 'Arjun', gender: 'm', tagline: 'Direct and structured',
    look: {
      skin: '#C68E65', skinShade: '#B07850', hair: '#14100E', hairHi: '#3A2D27', lip: '#9C4C44', eye: '#2B1A10',
      hairStyle: 'short', beard: 'stubble', glasses: false, earrings: null,
      blazer: ['#454750', '#2A2B32'], lapel: '#33343B', shirt: '#E4ECF5', pin: null,
    },
  },
  {
    id: 'meera', name: 'Meera', gender: 'f', tagline: 'Calm and thoughtful',
    look: {
      skin: '#B98058', skinShade: '#A06A44', hair: '#17110F', hairHi: '#3B2B25', lip: '#9E3F45', eye: '#2B1A10',
      hairStyle: 'long', beard: null, glasses: false, earrings: '#D9B45B',
      blazer: ['#12766E', '#0B4F4A'], lapel: '#0B5A54', shirt: '#F6EFE6', pin: '#C9A24B',
    },
  },
  {
    id: 'daniel', name: 'Daniel', gender: 'm', tagline: 'Friendly and curious',
    look: {
      skin: '#F0C9A8', skinShade: '#DDB08C', hair: '#5A3A22', hairHi: '#7A5538', lip: '#C0605A', eye: '#4F6B58',
      hairStyle: 'short', beard: 'full', glasses: true, earrings: null,
      blazer: ['#2B3A57', '#172033'], lapel: '#1D2A42', shirt: '#FFFFFF', pin: null,
    },
  },
  {
    id: 'marcus', name: 'Marcus', gender: 'm', tagline: 'Sharp and to the point',
    look: {
      skin: '#8D5A3B', skinShade: '#774A2F', hair: '#0E0B0A', hairHi: '#2A211E', lip: '#6E3636', eye: '#1B120D',
      hairStyle: 'cropped', beard: null, glasses: false, earrings: null,
      blazer: ['#6E2F3D', '#47202A'], lapel: '#52232E', shirt: '#F3F0EA', pin: '#C9A24B',
    },
  },
]

export const DEFAULT_PERSONA = PERSONAS[0]
export const getPersona = (id) => PERSONAS.find((p) => p.id === id) || DEFAULT_PERSONA

const KEY = 'cpai_interviewer'
export function loadInterviewerChoice() {
  try { return getPersona(localStorage.getItem(KEY)).id } catch { return DEFAULT_PERSONA.id }
}
export function saveInterviewerChoice(id) {
  try { localStorage.setItem(KEY, id) } catch { /* private mode: the choice just is not remembered */ }
}
