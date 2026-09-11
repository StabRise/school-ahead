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

// A bright, modern two-note "ding" (two lightly detuned sine unisons per
// note, for a fuller synth-pad feel) for the math game's correct-answer /
// bridge-build moment — replaced the old chiptune-y square-wave "thunk".
export function playBuildSound() {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const notes = [659.25, 987.77]; // E5, B5
    notes.forEach((frequency, i) => {
      const startTime = ctx.currentTime + i * 0.07;
      [1, 1.005].forEach((detune) => {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency * detune, startTime);
        gainNode.gain.setValueAtTime(0.0001, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.22, startTime + 0.015);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.25);
      });
    });
    setTimeout(() => ctx.close(), (notes.length * 0.07 + 0.25) * 1000);
  } catch {
    // Best-effort only.
  }
}

// A modern filtered-noise "whoosh" into a low sine "thud" for the math
// game's runner falling into the pit — replaced the old plain sawtooth
// glide with something that actually reads as an impact.
export function playFallSound() {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();

    const bufferSize = Math.floor(ctx.sampleRate * 0.3);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.3);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.2, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start();
    noise.stop(ctx.currentTime + 0.3);

    const thudStart = ctx.currentTime + 0.16;
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = "sine";
    thud.frequency.setValueAtTime(140, thudStart);
    thud.frequency.exponentialRampToValueAtTime(50, thudStart + 0.2);
    thudGain.gain.setValueAtTime(0.0001, thudStart);
    thudGain.gain.exponentialRampToValueAtTime(0.3, thudStart + 0.02);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, thudStart + 0.22);
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thud.start(thudStart);
    thud.stop(thudStart + 0.25);

    setTimeout(() => ctx.close(), 500);
  } catch {
    // Best-effort only.
  }
}

// A buzzy downward "bonk" for Jumping Frogs' wrong lily-pad tap — the
// brief (docs/preschool/games/jumping-frogs.md §3) asks for a "кумедний
// звук-помилка (наприклад, глухе «пук»)": comic, not harsh, so this stays a
// deliberately silly square-wave glide rather than a real buzzer.
export function playFrogMissSound() {
  playTone(150, { type: "square", duration: 0.22, gain: 0.18, glideTo: 50 });
}

// A cheerful two-note hop for Jumping Frogs' correct lily-pad tap — a
// bright, fast ascending arpeggio that reads as a spring rather than a
// block placing down.
export function playFrogJumpSound() {
  playChime([392, 523.25], { type: "triangle", noteGap: 0.05, noteDuration: 0.15, gain: 0.25 }); // G4, C5
}

// A longer, playful jingle for the math game's victory screen (a full run
// cleared) — a fuller arpeggio than playCelebrationChime's per-milestone
// ding, so a whole run finishing reads as a bigger moment than one Diamond.
export function playVictoryFanfare() {
  playChime([523.25, 659.25, 783.99, 1046.5, 783.99, 1318.51], {
    type: "triangle",
    noteGap: 0.13,
    noteDuration: 0.32,
    gain: 0.28,
  }); // C5, E5, G5, C6, G5, E6
}
