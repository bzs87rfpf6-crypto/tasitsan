/**
 * WebAudio-based notification sounds. No external files.
 * Each kind plays a distinct tonal pattern so admins can recognize
 * the event by ear.
 *
 * Browsers require a user gesture before AudioContext can play.
 * We lazily create the context on first user interaction.
 */

export type NotifSoundKind =
  | "new_user"
  | "new_listing"
  | "urgent_request"
  | "new_quote"
  | "new_inquiry"
  | "bulk_upload"
  | "signup_failure"
  | "system_error"
  | "generic";

const STORAGE_KEY = "tasitsan:notif-sound-enabled";

let ctx: AudioContext | null = null;
let unlocked = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Call from any user-gesture event handler to unlock audio playback. */
export function unlockNotificationAudio(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    void c.resume();
  }
  unlocked = true;
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === null ? true : v === "1";
}

export function setSoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
}

interface Beep {
  freq: number;
  duration: number; // seconds
  type?: OscillatorType;
  gain?: number;
}

function play(beeps: Beep[]): void {
  if (!isSoundEnabled()) return;
  const c = getCtx();
  if (!c || !unlocked) return;
  let t = c.currentTime;
  for (const b of beeps) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = b.type ?? "sine";
    osc.frequency.setValueAtTime(b.freq, t);
    const peak = b.gain ?? 0.12;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + b.duration);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + b.duration + 0.02);
    t += b.duration + 0.04;
  }
}

const PATTERNS: Record<NotifSoundKind, Beep[]> = {
  // Rising friendly two-note for a welcome event
  new_user: [
    { freq: 660, duration: 0.14, type: "sine" },
    { freq: 880, duration: 0.22, type: "sine" },
  ],
  new_listing: [
    { freq: 740, duration: 0.18, type: "triangle" },
  ],
  // Urgent: three-pulse high alert
  urgent_request: [
    { freq: 980, duration: 0.12, type: "square", gain: 0.18 },
    { freq: 980, duration: 0.12, type: "square", gain: 0.18 },
    { freq: 980, duration: 0.18, type: "square", gain: 0.18 },
  ],
  new_quote: [
    { freq: 520, duration: 0.18, type: "sine" },
    { freq: 780, duration: 0.18, type: "sine" },
  ],
  new_inquiry: [
    { freq: 620, duration: 0.16, type: "sine" },
    { freq: 520, duration: 0.16, type: "sine" },
  ],
  bulk_upload: [
    { freq: 420, duration: 0.1, type: "triangle" },
    { freq: 560, duration: 0.1, type: "triangle" },
    { freq: 700, duration: 0.18, type: "triangle" },
  ],
  // Descending error tone
  signup_failure: [
    { freq: 480, duration: 0.16, type: "sawtooth", gain: 0.15 },
    { freq: 360, duration: 0.16, type: "sawtooth", gain: 0.15 },
    { freq: 260, duration: 0.24, type: "sawtooth", gain: 0.15 },
  ],
  system_error: [
    { freq: 220, duration: 0.3, type: "sawtooth", gain: 0.18 },
    { freq: 180, duration: 0.3, type: "sawtooth", gain: 0.18 },
  ],
  generic: [
    { freq: 660, duration: 0.16, type: "sine" },
  ],
};

export function playNotificationSound(kind: NotifSoundKind): void {
  play(PATTERNS[kind] ?? PATTERNS.generic);
}
