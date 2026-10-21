// Server-side wording for the Instagram status, shared by the admin home card and the Instagram page.
import type { IgStatus } from '../../lib/feed';

const TZ = 'America/New_York'; // the shop is in Maryville, TN

export const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' });
export const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

/** "Today 3:00 PM", "Yesterday 9:00 PM" or "Oct 19, 9:00 PM". */
export function when(iso: string, now = new Date()): string {
  const key = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: TZ });
  const d = new Date(iso);
  if (key(d) === key(now)) return `Today ${time(iso)}`;
  if (key(d) === key(new Date(now.getTime() - 864e5))) return `Yesterday ${time(iso)}`;
  return `${day(iso)}, ${time(iso)}`;
}

export function ago(iso: string, now = new Date()): string {
  const min = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 6e4));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return day(iso);
}

/** The cron runs at the top of every hour. */
export const nextRun = (now = new Date()) => `in ${60 - now.getUTCMinutes()} min (hourly)`;

export type Tone = 'ok' | 'warn' | 'bad' | 'none';

export function statusTag(s: IgStatus | null): { label: string; tone: Tone } {
  if (!s) return { label: 'Not run yet', tone: 'none' };
  if (s.state === 'ok') return { label: 'Connected', tone: 'ok' };
  if (s.state === 'token_invalid') return { label: 'Token failed', tone: 'bad' };
  return { label: 'Refresh failed', tone: 'warn' };
}

export const tokenLine = (s: IgStatus | null) =>
  s?.tokenExpiresAt ? `Renews itself · good until ${day(s.tokenExpiresAt)}` : 'Renews itself';
