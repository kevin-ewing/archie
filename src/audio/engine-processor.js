// RAF 1a V8: individual four-stroke combustion events, rendered on the browser's audio thread.
// Eight cylinders fire four times per crank revolution. Small permanent cylinder differences and
// per-event variation keep the exhaust from collapsing into a perfectly repeating synth tone.

class Raf1aEngineProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.rpm = this.targetRpm = 1250;
    this.load = this.targetLoad = 0;
    this.rough = this.targetRough = 0;
    this.boosting = false;
    this.phase = 0;
    this.cylinder = 0;
    this.transient = 0;
    this.body = 0;
    this.noise = 0;
    this.output = 0;
    this.lfsr = 0x5eed1234;
    this.cylinderGain = Array.from({ length: 8 }, () => 0.88 + Math.random() * 0.24);
    const rawSpacing = Array.from({ length: 8 }, () => 0.98 + Math.random() * 0.04);
    const mean = rawSpacing.reduce((sum, n) => sum + n, 0) / rawSpacing.length;
    this.spacing = rawSpacing.map((n) => n / mean);
    this.nextSpacing = this.spacing[0];

    const omega = (2 * Math.PI * 108) / sampleRate; // fixed exhaust/cowling body resonance
    this.resR = 0.9;
    this.resCos = Math.cos(omega);
    this.resSin = Math.sin(omega);
    this.resX = 0;
    this.resY = 0;

    this.port.onmessage = ({ data }) => {
      if (data?.stop) {
        this.stopped = true;
        return;
      }
      if (data.rpm !== undefined) this.targetRpm = Math.max(500, Math.min(2000, data.rpm));
      if (data.load !== undefined) this.targetLoad = Math.max(0, Math.min(1, data.load));
      if (data.rough !== undefined) this.targetRough = Math.max(0, Math.min(1, data.rough));
      if (data.boosting !== undefined) this.boosting = data.boosting;
    };
  }

  process(_inputs, outputs) {
    if (this.stopped) return false;
    const out = outputs[0][0];
    if (!out) return true;
    const transDecay = Math.exp(-1 / (sampleRate * 0.0014));
    const firingInterval = sampleRate / Math.max(1, (this.rpm / 60) * 4);
    const bodyDecay = Math.exp(-1 / Math.max(firingInterval * 0.38, sampleRate * 0.0025));

    for (let i = 0; i < out.length; i++) {
      this.rpm += (this.targetRpm - this.rpm) * 0.0008;
      this.load += (this.targetLoad - this.load) * 0.0005;
      this.rough += (this.targetRough - this.rough) * 0.0005;

      const eventsPerSample = (this.rpm / 60) * 4 / sampleRate;
      this.phase += eventsPerSample;
      if (this.phase >= this.nextSpacing) {
        this.phase -= this.nextSpacing;
        const cylinder = this.cylinder;
        this.cylinder = (cylinder + 1) & 7;
        this.nextSpacing = this.spacing[this.cylinder];
        const variation = 0.96 + Math.random() * 0.08;
        const roughVariation = 1 + (Math.random() - 0.5) * this.rough * 0.12;
        const amp = this.cylinderGain[cylinder] * variation * roughVariation * (1 + this.load * 0.16);
        this.transient += amp * 0.72;
        this.body += amp * (0.65 + (this.boosting ? 0.12 : 0));
      }

      this.transient *= transDecay;
      this.body *= bodyDecay;

      this.lfsr ^= this.lfsr << 13;
      this.lfsr ^= this.lfsr >>> 17;
      this.lfsr ^= this.lfsr << 5;
      const white = ((this.lfsr >>> 0) & 0xffff) / 32768 - 1;
      this.noise += (white - this.noise) * 0.2;

      const raw = this.transient * 0.052 + this.body * (0.05 + this.noise * 0.045);
      const nx = this.resR * (this.resX * this.resCos - this.resY * this.resSin) + raw;
      const ny = this.resR * (this.resX * this.resSin + this.resY * this.resCos);
      this.resX = nx;
      this.resY = ny;
      const mixed = raw * 0.72 + nx * 0.28;
      this.output += (mixed - this.output) * 0.24; // ~2 kHz: removes digital edges, keeps exhaust crack
      out[i] = Math.tanh(this.output * 2.1) * 0.62;
    }
    return true;
  }
}

registerProcessor('raf1a-engine-processor', Raf1aEngineProcessor);
