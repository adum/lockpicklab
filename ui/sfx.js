function pickAudioContext() {
  return window.AudioContext || window.webkitAudioContext || null;
}

export function createSfxManager(options = {}) {
  let enabled = options.enabled ?? true;
  let context = null;
  const masterGain = Math.max(0, Math.min(1, options.masterGain ?? 0.05));

  function getContext() {
    if (context) {
      return context;
    }
    const Ctor = pickAudioContext();
    if (!Ctor) {
      return null;
    }
    context = new Ctor();
    return context;
  }

  function ensureRunning() {
    const ctx = getContext();
    if (!ctx) {
      return null;
    }
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function tone(ctx, options = {}) {
    const now = ctx.currentTime;
    const start = now + (options.delay ?? 0);
    const attack = options.attack ?? 0.004;
    const hold = options.duration ?? 0.05;
    const release = options.release ?? 0.03;
    const end = start + attack + hold + release;
    const startFreq = options.freq ?? 440;
    const endFreq = options.freqTo ?? startFreq;
    const type = options.type ?? "triangle";
    const gainAmount = (options.gain ?? 1) * masterGain;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, start);
    if (endFreq !== startFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), end);
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainAmount), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(end + 0.01);
  }

  function run(callback) {
    if (!enabled) {
      return;
    }
    const ctx = ensureRunning();
    if (!ctx) {
      return;
    }
    callback(ctx);
  }

  function playCard() {
    run((ctx) => {
      tone(ctx, {
        type: "triangle",
        freq: 380,
        freqTo: 620,
        gain: 0.9,
        duration: 0.035,
      });
    });
  }

  function playDamage() {
    run((ctx) => {
      tone(ctx, {
        type: "square",
        freq: 260,
        freqTo: 120,
        gain: 0.8,
        duration: 0.04,
        release: 0.02,
      });
    });
  }

  function playWin() {
    run((ctx) => {
      tone(ctx, {
        type: "triangle",
        freq: 520,
        freqTo: 620,
        gain: 0.85,
        duration: 0.03,
        delay: 0,
      });
      tone(ctx, {
        type: "triangle",
        freq: 660,
        freqTo: 790,
        gain: 0.85,
        duration: 0.04,
        delay: 0.05,
      });
      tone(ctx, {
        type: "triangle",
        freq: 820,
        freqTo: 980,
        gain: 1.0,
        duration: 0.06,
        delay: 0.11,
      });
    });
  }

  function playLose() {
    run((ctx) => {
      tone(ctx, {
        type: "sawtooth",
        freq: 300,
        freqTo: 180,
        gain: 0.85,
        duration: 0.05,
        delay: 0,
      });
      tone(ctx, {
        type: "sawtooth",
        freq: 170,
        freqTo: 95,
        gain: 0.9,
        duration: 0.08,
        delay: 0.07,
      });
    });
  }

  function setEnabled(value, options = {}) {
    enabled = Boolean(value);
    if (enabled) {
      ensureRunning();
      if (options.preview) {
        playCard();
      }
    }
  }

  function isEnabled() {
    return enabled;
  }

  return {
    isEnabled,
    setEnabled,
    playCard,
    playDamage,
    playWin,
    playLose,
  };
}
