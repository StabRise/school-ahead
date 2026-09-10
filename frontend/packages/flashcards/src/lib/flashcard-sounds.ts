// Audio feedback for marking a card in Навчання mode (docs/preschool/
// games/cards.md) — short synthesized clicks, deliberately understated
// rather than the bright chimes @school-ahead/preschool-games uses for its
// much younger audience, per this game's "Дорослий дизайн" requirement. No
// audio asset pipeline exists in this project, so both are generated on
// the fly via Web Audio (same technique as that package's
// kit/sound-effects.ts); every call is best-effort — failures (autoplay
// restrictions, unsupported browser) are swallowed rather than surfaced,
// since marking a card should never be blocked on a sound.

function getAudioContextClass(): typeof AudioContext | undefined {
  return window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function playTone(frequency: number, duration: number, gain: number, glideTo: number) {
  const AudioContextClass = getAudioContextClass();
  if (!AudioContextClass) return;
  try {
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(glideTo, ctx.currentTime + duration * 0.8);
    gainNode.gain.setValueAtTime(gain, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + duration + 0.02);
    oscillator.onended = () => ctx.close();
  } catch {
    // Best-effort only.
  }
}

// «Знаю» — a brief upward tick.
export function playKnowSound() {
  playTone(660, 0.12, 0.12, 880);
}

// «Складно» — a brief, lower, downward tick — distinct from playKnowSound
// but still gentle, not a buzzer.
export function playDifficultSound() {
  playTone(440, 0.14, 0.12, 330);
}
