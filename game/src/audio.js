// BREACHLINE — procedural sound. No audio assets: every effect is synthesised with
// WebAudio oscillators and filtered noise, created lazily on the first user gesture
// (browsers block audio before interaction). All nodes are short-lived by design.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function noiseBurst(duration, filterFreq, gain, type = 'lowpass') {
    if (!ensure() || muted) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  function tone(freq, duration, gain, type = 'sine', slideTo = 0) {
    if (!ensure() || muted) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    toggleMute() { muted = !muted; return muted; },
    shot() { noiseBurst(0.09, 1800, 0.5); tone(160, 0.07, 0.25, 'square', 60); },
    enemyShot() { noiseBurst(0.08, 1200, 0.22); },
    dryClick() { tone(1200, 0.03, 0.15, 'square'); },
    reload() { tone(500, 0.08, 0.12, 'square', 300); setTimeout(() => tone(700, 0.06, 0.12, 'square', 400), 350); },
    hit() { tone(1900, 0.05, 0.2, 'sine'); },
    kill() { tone(880, 0.09, 0.2, 'sine'); setTimeout(() => tone(1320, 0.12, 0.2, 'sine'), 80); },
    hurt() { noiseBurst(0.15, 500, 0.4); tone(110, 0.15, 0.3, 'sawtooth', 70); },
    beep() { tone(1050, 0.09, 0.18, 'sine'); },
    plant() { tone(700, 0.1, 0.18, 'sine'); setTimeout(() => tone(1050, 0.1, 0.18, 'sine'), 120); },
    explosion() { noiseBurst(0.9, 300, 0.9); tone(60, 0.8, 0.5, 'sine', 30); },
    buy() { tone(1200, 0.05, 0.15, 'sine'); setTimeout(() => tone(1600, 0.07, 0.15, 'sine'), 70); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.2, 'sine'), i * 130)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.2, 0.2, 'sine'), i * 140)); },
    step() { noiseBurst(0.04, 400, 0.05); },
  };
}
