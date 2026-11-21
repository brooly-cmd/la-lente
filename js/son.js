// Le son : uniquement sur demande. Vent, pas lourds, gouttes, grillons de nuit. Tout est synthetise, aucun fichier.
export class Son {
  constructor() { this.on = false; this.ctx = null; this.vie = 0; }
  init() {
    if (this.ctx) return;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    const a = this.ctx = new C(); this.ma = a.createGain(); this.ma.gain.value = 0; this.ma.connect(a.destination);
    const buf = a.createBuffer(1, a.sampleRate * 4, a.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.bruit = buf;
    const s = a.createBufferSource(); s.buffer = buf; s.loop = true; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; const g = a.createGain(); g.gain.value = .07;
    s.connect(f); f.connect(g); g.connect(this.ma); s.start(); this.ventF = f; this.ventG = g;
    const lfo = a.createOscillator(); lfo.frequency.value = .07; const lg = a.createGain(); lg.gain.value = 170; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
  }
  reveille() { if (this.on && this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  bascule() {
    this.init(); if (!this.ctx) return false; this.on = !this.on; this.ctx.resume();
    this.ma.gain.linearRampToValueAtTime(this.on ? .85 : 0, this.ctx.currentTime + 1.4); return this.on;
  }
  pause(h) { if (this.ctx && this.on) { if (h) this.ctx.suspend(); else this.ctx.resume(); } }
  ton(freq, fin, dur, vol, type = 'sine') {
    if (!this.on) return; const a = this.ctx, t = a.currentTime, o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(fin, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(.05, dur * .2)); g.gain.exponentialRampToValueAtTime(.0001, t + dur); o.connect(g); g.connect(this.ma); o.start(t); o.stop(t + dur + .05);
  }
  pas() { this.ton(62, 34, 1.5, .34); }
  goutte() { this.ton(520 + Math.random() * 240, 190, .42, .1); }
  touche() { this.ton(880, 660, .3, .035, 'triangle'); }
  voix() { this.ton(96, 58, 2.8, .22, 'sawtooth'); this.ton(144, 88, 2.8, .05); }
  oiseaux() { for (let i = 0; i < 5; i++) setTimeout(() => this.ton(2100 + Math.random() * 1400, 1600, .12, .02), i * 90 + Math.random() * 80); }
  maj(T, nuit) {
    if (!this.on) return; const t = this.ctx.currentTime; this.ventG.gain.setTargetAtTime(.07 - nuit * .035, t, 1);
    if (nuit > .5 && Math.random() < .012) { for (let i = 0; i < 3; i++) setTimeout(() => this.ton(4300, 4100, .05, .009), i * 70); }
  }
}
