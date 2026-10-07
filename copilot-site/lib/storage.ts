import { env } from 'cloudflare:workers';
export function database(){ if(!env.DB)throw new Error('Workspace storage is unavailable. Please retry shortly.'); return env.DB; }
