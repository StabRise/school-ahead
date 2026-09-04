// Procedural Web Audio sound effects shared by every preschool minigame —
// no audio asset pipeline exists in this project, so each blip/chime is
// synthesized on the fly instead. Every call is best-effort: failures
// (autoplay restrictions, unsupported browser, ...) are swallowed rather
// than surfaced, since a game should never be blocked on a sound effect.

function getAudioContextClass(): typeof AudioContext | undefined {
  return window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

interface ToneOptions {
  // Reuse an already-open AudioContext (e.g. a sound repeated several times
  // a second, like the trains game's chug) instead of opening/closing one
  // per call — the caller stays responsible for eventually closing it.
  ctx?: AudioContext;
  type?: OscillatorType;
  duration?: number; // seconds until silent
  gain?: number;
  glideTo?: number; // exponential frequency ramp target
}

// Plays a single tone, optionally gliding to a second frequency — used for
// short one-off blips/nudges (pop, miss, a train chuff, ...).
export function playTone(frequency: number, { ctx, type = "sine", duration = 0.2, gain = 0.2, glideTo }: ToneOptions = {}) {
  const AudioContextClass = getAudioContextClass();
  if (!ctx && !AudioContextClass) return;
  try {
    const audioCtx = ctx ?? new AudioContextClass!();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    if (glideTo !== undefined) {
      oscillator.frequency.exponentialRampToValueAtTime(glideTo, audioCtx.currentTime + duration * 0.8);
    }
    gainNode.gain.setValueAtTime(gain, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration + 0.02);
    if (!ctx) oscillator.onended = () => audioCtx.close();
  } catch {
    // Best-effort only.
  }
}

interface ChimeOptions {
  type?: OscillatorType;
  noteGap?: number; // seconds between note starts
  noteDuration?: number; // seconds each note rings
  gain?: number;
}

// Plays a short arpeggio across `notes` (Hz) — used for match/correct/
// level-complete/pass sounds, which all share this "chord of blips" shape.
export function playChime(
  notes: number[],
  { type = "sine", noteGap = 0.1, noteDuration = 0.35, gain = 0.3 }: ChimeOptions = {},
) {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    notes.forEach((frequency, i) => {
      const startTime = ctx.currentTime + i * noteGap;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, startTime);
      gainNode.gain.setValueAtTime(0.0001, startTime);
      gainNode.gain.exponentialRampToValueAtTime(gain, startTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + noteDuration);
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + noteDuration + 0.02);
    });
    setTimeout(() => ctx.close(), (notes.length * noteGap + noteDuration) * 1000);
  } catch {
    // Best-effort only.
  }
}

// A short, bright "match!"/"correct!" bell — shared by every game's
// right-answer feedback (Reading's playMatchSound, Cards' playCorrectSound).
export function playMatchSound() {
  playChime([783.99, 1046.5], { noteGap: 0.1, noteDuration: 0.35, gain: 0.3 }); // G5, C6
}

// A soft, low "not quite" nudge — deliberately gentle, not a harsh buzzer,
// for a young child being tested (Reading's and Cards' playMissSound).
export function playMissSound() {
  playTone(220, { duration: 0.2, gain: 0.15, glideTo: 160 });
}

// A short "pop" — Balloon Pop's and Cards' falling-object pop sound.
export function playPopSound() {
  playTone(700, { type: "triangle", duration: 0.18, gain: 0.25, glideTo: 140 });
}

// The bigger celebratory arpeggio for a Diamond milestone or clearing a
// whole level — Balloon Pop's playDiamondChime, Reading's and Cards'
// playLevelCompleteChime were all this exact same sound.
export function playCelebrationChime() {
  playChime([523.25, 659.25, 783.99, 1046.5], { noteGap: 0.09, noteDuration: 0.4, gain: 0.3 }); // C5, E5, G5, C6
}
