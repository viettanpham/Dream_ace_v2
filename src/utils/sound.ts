class TacticalAudioEngine {
  private ctx: AudioContext | null = null;
  private muted = false;

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0
  ): void {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, now);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playClick(): void {
    this.playTone(540, 420, 0.055, 'triangle', 0.055);
  }

  public playStatTick(up = true): void {
    this.playTone(up ? 620 : 460, up ? 780 : 380, 0.06, 'sine', 0.055);
  }

  public playConfirm(): void {
    this.playTone(520, 520, 0.08, 'triangle', 0.07, 0);
    this.playTone(780, 820, 0.14, 'triangle', 0.07, 0.065);
  }

  public playLaser(): void {
    this.playTone(760, 140, 0.16, 'sawtooth', 0.07);
    this.playTone(340, 90, 0.14, 'square', 0.04, 0.03);
  }

  public playHeavy(): void {
    this.playTone(220, 48, 0.28, 'sawtooth', 0.1);
    this.playTone(540, 110, 0.22, 'square', 0.06, 0.03);
  }

  public playShield(): void {
    this.playTone(980, 520, 0.16, 'sine', 0.07);
    this.playTone(1320, 740, 0.14, 'triangle', 0.045, 0.02);
  }

  public playEvade(): void {
    this.playTone(420, 960, 0.12, 'sine', 0.05);
  }

  public playDefend(): void {
    this.playTone(320, 480, 0.12, 'triangle', 0.07);
    this.playTone(480, 640, 0.14, 'sine', 0.06, 0.08);
  }

  public playHeal(): void {
    this.playTone(440, 554, 0.12, 'sine', 0.06, 0);
    this.playTone(554, 659, 0.14, 'sine', 0.06, 0.07);
    this.playTone(659, 880, 0.18, 'sine', 0.055, 0.14);
  }

  public playDestroy(): void {
    this.playTone(160, 34, 0.38, 'sawtooth', 0.11);
    this.playTone(92, 28, 0.34, 'square', 0.08, 0.04);
  }

  public playVictory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      this.playTone(n, n, 0.18, 'triangle', 0.075, idx * 0.095);
    });
  }

  public playDefeat(): void {
    const notes = [349.23, 311.13, 261.63, 196.0];
    notes.forEach((n, idx) => {
      this.playTone(n, n * 0.96, 0.22, 'sawtooth', 0.06, idx * 0.12);
    });
  }
}

export const soundFx = new TacticalAudioEngine();
