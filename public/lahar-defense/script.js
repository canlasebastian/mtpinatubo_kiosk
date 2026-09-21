const wrap = document.getElementById('gameWrap');
const canvas = document.getElementById('scene');
// alpha:false - the scene always paints a full opaque background, so the
// browser can skip per-pixel transparency compositing for the whole canvas.
// desynchronized:true reduces presentation latency on touch kiosks.
/* Reassignable: render() temporarily points ctx at the HUD overlay while
   drawing the wave gauge, then restores it. */
let ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });

const churchImg = new Image();
churchImg.src = 'assets/porac/porac_church.png'; 

const bacolorChurchImg = new Image();
bacolorChurchImg.src = 'assets/bacolor/bacolor_church.png'; // San Guillermo Parish Church — Bacolor-specific landmark art

/* Don Honorio Ventura State University — stands in for the school in
   Bacolor. The file extension was not specified, so the loader falls back
   through the usual image types and the procedural school still draws if
   none of them resolve. */
const bacolorSchoolImg = new Image();
(function loadBacolorSchool() {
  const exts = ['.png', '.webp', '.jpg', '.jpeg'];
  let i = 0;
  bacolorSchoolImg.onerror = () => {
    if (i < exts.length) bacolorSchoolImg.src = 'assets/bacolor/bacolor_dhvsu' + exts[i++];
    else console.warn('[lahar] bacolor_dhvsu not found in assets/bacolor/ — ' +
                      'drawing the built-in school instead.');
  };
  bacolorSchoolImg.src = 'assets/bacolor/bacolor_dhvsu' + exts[i++];
})();

const robotImg = new Image();
robotImg.src = 'assets/porac/babo_robot.png'; 

const monumentImg = new Image();
monumentImg.src = 'assets/bacolor/Juan_Crisostomo_Soto_Monument.png'; // Juan Crisostomo Soto Monument — Bacolor-specific landmark art

const moneyBagImg = new Image();
moneyBagImg.src = 'assets/money_bag.png'; // Falling money bag collectible art (shared across all towns)

/* Extra local-landmark art placed as scenery per municipality (see the
   `props` arrays in TOWN_MAPS and drawTownProps()). Filenames match the
   asset folders exactly — including the "porac_municapal" spelling. */
const poracMunicipalImg = new Image();  poracMunicipalImg.src = 'assets/porac/porac_municapal.png';
const poracSignImg      = new Image();  poracSignImg.src      = 'assets/porac/porac_sign.png';
const poracWetMarketImg = new Image();  poracWetMarketImg.src = 'assets/porac/porac_wet_market.png';
const angelesChurchImg  = new Image();  angelesChurchImg.src  = 'assets/angeles/angeles_church.png';
const angelesMuseumImg  = new Image();  angelesMuseumImg.src  = 'assets/angeles/angeles_museum.png';
const angelesSignImg    = new Image();  angelesSignImg.src    = 'assets/angeles/angeles_sign.png';
const angelesSalakotImg = new Image();  angelesSalakotImg.src = 'assets/angeles/angeles_salakot.png';  // new landmark asset
const holyAngelUnivImg  = new Image();  holyAngelUnivImg.src  = 'assets/angeles/holy_angel_university.png';

let DPR = window.devicePixelRatio || 1;
// The 540x960 logical scene is scaled to fill the canvas' real pixel buffer.
// These factors map logical units -> backing-store device pixels (see
// resizeCanvas). Kept in sync so the cached layers render at the same scale.
let RENDER_SX = DPR, RENDER_SY = DPR;

let W = 540, H = 960; 

// Ambient scene clock — advances every frame regardless of game state (menus,
// pauses, idle kiosk screens). Clouds/smoke/ash read this instead of
// `state.time` so the environment always feels alive, even before a storm
// starts (state.time only advances once state.running is true).
let ambientTime = 0;

const staticCanvas = document.createElement('canvas');
const staticCtx = staticCanvas.getContext('2d');
let isStaticRendered = false;

/* ---------------- ADAPTIVE RENDER QUALITY ----------------
   The scene is authored at 540x960 but the frame is scaled to fill the
   display. Backing the canvas with EVERY physical pixel looks sharpest,
   but the cost is pure fill rate: on a 1080p portrait kiosk that is ~4x
   the pixels of the logical scene, and on a 4K panel (or any display
   reporting devicePixelRatio 2) it is 16-63x. With ~5,000 canvas
   operations per frame that is what makes a kiosk stutter, even though
   the JavaScript itself costs barely 1ms.

   So the buffer is capped instead. Rendering at ~1.5x the logical size
   is already past the point where extra pixels are visible at kiosk
   viewing distance, and it bounds the work no matter what panel the
   game is plugged into. renderQuality is then trimmed further at
   runtime if real frame times say the hardware still can't keep up. */
/* Ceiling on the SCENE buffer relative to the 540x960 scene. The scene is
   allowed to render below display resolution, and to drop further under
   load, because a slightly soft mountain costs nothing. Crisp UI is handled
   separately — see the HUD overlay canvas below. */
const MAX_RENDER_SCALE = 1.5;

/* ---- HUD OVERLAY CANVAS ----
   The wave gauge looked blurry next to the budget and goal panels for a
   concrete reason: those panels are DOM elements, which the browser lays
   out at full device resolution, while the gauge is canvas pixels. The
   scene buffer is capped at 1.5x and drops as low as 0.62x when frames run
   long, so on a DPR-2 kiosk the gauge had roughly a quarter — and under
   load well over half — fewer pixels than the text beside it.

   The gauge now draws on its own small overlay canvas that is always sized
   to the true device resolution and never touched by the adaptive quality
   downgrade. It is a thin strip, so the extra pixels are negligible. */
let hudCanvas = null, hudCtx = null, HUD_SX = 1, HUD_SY = 1;
function ensureHudCanvas() {
  if (hudCanvas) return;
  hudCanvas = document.createElement('canvas');
  hudCanvas.id = 'hudLayer';
  hudCanvas.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:41;';
  (document.getElementById('gameWrap') || document.body).appendChild(hudCanvas);
  hudCtx = hudCanvas.getContext('2d');
}
function sizeHudCanvas() {
  ensureHudCanvas();
  const rect = (wrap || hudCanvas).getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  // Full device resolution, with no renderQuality multiplier: this layer
  // must never soften, which is the whole point of separating it.
  const pxW = Math.max(1, Math.round((rect.width || W) * dpr));
  const pxH = Math.max(1, Math.round((rect.height || H) * dpr));
  if (hudCanvas.width !== pxW || hudCanvas.height !== pxH) {
    hudCanvas.width = pxW; hudCanvas.height = pxH;
  }
  HUD_SX = pxW / W; HUD_SY = pxH / H;
  hudCtx.setTransform(HUD_SX, 0, 0, HUD_SY, 0, 0);
}
let renderQuality = 1;          // 1 = full, lowered automatically when frames run long

function resizeCanvas() {
  const rect = wrap.getBoundingClientRect();
  DPR = window.devicePixelRatio || 1;
  // Back the canvas with the ACTUAL on-screen size (CSS px x DPR), not a fixed
  // 540-wide buffer. Otherwise the browser upscales that fixed buffer to fill a
  // larger frame and everything looks blurry — which is exactly what shows up
  // when the window or zoom level makes the frame bigger than 540 CSS px.
  // Clamp the device scale so a high-DPI or oversized panel can't explode
  // the pixel count; anything above MAX_RENDER_SCALE is wasted work.
  const cssW = rect.width || W, cssH = rect.height || H;
  const wanted = (cssW * DPR) / W;
  const scale = Math.min(wanted, MAX_RENDER_SCALE) * renderQuality;
  const pxW = Math.max(1, Math.round(W * scale));
  const pxH = Math.max(1, Math.round(H * scale));
  canvas.width = pxW;
  canvas.height = pxH;
  // Scale the 540x960 logical scene to fill the buffer. Gameplay + input still
  // work in 540x960 logical units, so nothing else needs to change.
  RENDER_SX = pxW / W;
  RENDER_SY = pxH / H;
  ctx.setTransform(RENDER_SX, 0, 0, RENDER_SY, 0, 0);
  ctx.imageSmoothingQuality = 'high';
  sizeHudCanvas();
  isStaticRendered = false;
  isMountainCached = false; // resolution-dependent caches must rebuild on resize
}

window.addEventListener('resize', resizeCanvas);
// Browser zoom can change devicePixelRatio without a classic resize; catch it.
if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeCanvas);

/* ---------------- AUDIO ENGINE ---------------- */
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const laharRainTrack = new Audio('assets/audio/rain.mp3');
laharRainTrack.loop = true;

/* ---------------- MASTER VOLUME ----------------
   The game has two independent audio paths — the Web Audio synth used for
   UI and gameplay cues, and the looping rain <audio> track — so a single
   master level has to be applied to both. Every synth voice is routed
   through masterGain instead of straight to the destination, and the rain
   element's own volume is scaled by the same figure.

   The setting is remembered between sessions where storage is available;
   on a locked-down kiosk that may throw, so it fails quietly. */
const masterGain = audioCtx.createGain();
masterGain.connect(audioCtx.destination);

const RAIN_BASE_VOLUME = 0.55;   // the rain track's level at 100% music

/* Two independent channels rather than one master, so a visitor can silence
   the looping storm without also losing the taps, alerts and win/lose cues
   that tell them what is happening:

     MUSIC — the looping rain/storm bed, and the welcome-screen track that
             the hosting page owns.
     SFX   — every synthesised cue: taps, placements, combos, collapses,
             the victory and defeat stingers.

   Every synth voice already routes through masterGain, so that node simply
   becomes the SFX bus. The rain <audio> element is scaled by the music
   level instead. Both persist separately. */
let musicVolume = 0.7;
let sfxVolume = 0.7;
try {
  const legacy = parseFloat(localStorage.getItem('laharaya.volume'));
  const m = parseFloat(localStorage.getItem('laharaya.musicVolume'));
  const f = parseFloat(localStorage.getItem('laharaya.sfxVolume'));
  // Fall back to the old single setting so existing kiosks keep their level.
  if (!isNaN(m)) musicVolume = Math.max(0, Math.min(1, m));
  else if (!isNaN(legacy)) musicVolume = Math.max(0, Math.min(1, legacy));
  if (!isNaN(f)) sfxVolume = Math.max(0, Math.min(1, f));
  else if (!isNaN(legacy)) sfxVolume = Math.max(0, Math.min(1, legacy));
} catch (e) { /* storage unavailable — keep the defaults */ }

function applyVolume() {
  masterGain.gain.value = sfxVolume;                       // masterGain == the SFX bus
  laharRainTrack.volume = RAIN_BASE_VOLUME * musicVolume;
}

function setMusicVolume(v, fromHost) {
  musicVolume = Math.max(0, Math.min(1, v));
  applyVolume();
  try { localStorage.setItem('laharaya.musicVolume', String(musicVolume)); } catch (e) {}
  updateVolumeUI();
  // Keep the host's welcome-screen music in step, unless it sent this.
  if (!fromHost) {
    try { window.parent.postMessage('lahar-music:' + musicVolume, '*'); } catch (e) {}
  }
}

function setSfxVolume(v) {
  sfxVolume = Math.max(0, Math.min(1, v));
  applyVolume();
  try { localStorage.setItem('laharaya.sfxVolume', String(sfxVolume)); } catch (e) {}
  updateVolumeUI();
}

/* Back-compat: anything still calling setMasterVolume moves both channels
   together, which is also what the host's single control does. */
function setMasterVolume(v, fromHost) {
  setMusicVolume(v, fromHost);
  setSfxVolume(v);
}

window.addEventListener('message', (e) => {
  if (typeof e.data !== 'string') return;
  if (e.data.startsWith('lahar-music:')) {
    const v = parseFloat(e.data.slice('lahar-music:'.length));
    if (!isNaN(v)) setMusicVolume(v, true);
  } else if (e.data.startsWith('lahar-volume:')) {
    const v = parseFloat(e.data.slice('lahar-volume:'.length));
    if (!isNaN(v)) setMasterVolume(v, true);
  }
});
applyVolume();

/* ============================================================
   ROCK DIKE PLACEMENT SOUND
   ------------------------------------------------------------
   The dike is a rock-filled barrier, so it should sound like one:
   a load of heavy stone tipped onto the ground and settling.

   Built entirely from FILTERED NOISE — no oscillators anywhere.
   That is deliberate: any sustained oscillator reads as a musical
   pitch, which is what made the old version sound like concrete
   or a game blip rather than stone. Real rock impacts are broadband
   transients with a fast attack and no stable pitch, and that is
   what a short noise burst through a resonant filter produces.

   Shape, over ~1.3s:
     0.00-0.28  rocks tumbling and knocking against each other
     0.30       the heavy landing — mass, crunch and crack together
     0.34-0.76  stone grinding as the pile compacts
     0.45-1.00  dirt and gravel trickling through
     0.85-1.30  the last few small rocks rolling into place
   ============================================================ */
let _rockNoiseBuf = null;
function rockNoiseBuffer() {
  if (_rockNoiseBuf) return _rockNoiseBuf;
  const len = Math.floor(audioCtx.sampleRate * 2);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _rockNoiseBuf = buf;
  return buf;
}

/* One stony event: a noise burst shaped by a filter envelope.
   f1 sweeps the filter downward, which is what makes an impact sound like
   something heavy losing energy rather than a flat hiss. */
function rockHit(startT, dur, filterType, f0, f1, q, vol) {
  /* The per-hit timing jitter can land a few milliseconds BEFORE the context
     clock, which the Web Audio API rejects outright ("Time must be a finite
     non-negative number"). On a context that has only just started, that
     would throw on the very first placement. */
  startT = Math.max(audioCtx.currentTime, startT);
  const src = audioCtx.createBufferSource();
  src.buffer = rockNoiseBuffer();
  // A different slice of noise each time, so repeated placements never
  // sound like the same recording twice.
  src.playbackRate.value = 0.75 + Math.random() * 0.6;
  const flt = audioCtx.createBiquadFilter();
  flt.type = filterType;
  flt.Q.value = q;
  flt.frequency.setValueAtTime(Math.max(30, f0), startT);
  if (f1) flt.frequency.exponentialRampToValueAtTime(Math.max(30, f1), startT + dur);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, startT);
  // Attack length is the single biggest character cue: a 5ms ramp reads as
  // something landing, a 1ms one as something striking.
  const atk = arguments.length > 7 && arguments[7] ? arguments[7] : 0.005;
  g.gain.exponentialRampToValueAtTime(Math.max(0.0005, vol), startT + atk);
  g.gain.exponentialRampToValueAtTime(0.0001, startT + dur);
  src.connect(flt); flt.connect(g); g.connect(masterGain);
  src.start(startT, Math.random() * 0.9, dur + 0.06);
  src.stop(startT + dur + 0.06);
}

/* ============================================================
   BOULDER SMASHING A BUILDING
   ------------------------------------------------------------
   Distinct from the rock-dump used when a dike is placed. That
   one is MANY rocks tipped out and settling; this is ONE massive
   rock hitting a structure, so the shape is the opposite: almost
   all the energy is in the first 80ms, then the building comes
   apart afterwards.

     0.000  the strike — a hard crack, the rock meeting the wall
     0.005  the mass   — deep low thud carrying the weight
     0.04-0.35  masonry shattering: irregular mid-band bursts
     0.10-0.70  debris raining down and scattering
     0.05-0.9   a low rumble tail as the structure settles

   Noise-only, like the other rock sounds: a sustained oscillator
   would read as a musical pitch and break the illusion of stone.
   ============================================================ */
function playBoulderSmashSound() {
  const t = audioCtx.currentTime;

  /* REWRITE. The first version shared the dike-dump's shape — a low body
     plus a long settling tail — so the two were hard to tell apart. A pour
     and an impact differ in envelope, not ingredients:

       dike dump : slow build, lands, then settles over ~1.3s
       this      : everything detonates at once, then decays fast

     So: a near-instant attack (1ms, not 5), a body that sweeps down hard,
     splintering that is much brighter and more granular than gravel, and
     NO long rumble — the old 0.85s tail was exactly what made it sound
     like the dike. Total length roughly halved. */

  // The crack of stone meeting wall. Very short, very sharp, very bright.
  rockHit(t, 0.028, 'highpass', 5200, 3000, 0.6, 0.3, 0.0008);
  rockHit(t, 0.055, 'bandpass', 2600, 1400, 1.8, 0.26, 0.001);

  // The body: a hard downward sweep, not a settling thud.
  rockHit(t + 0.002, 0.2, 'lowpass', 520, 45, 1.3, 0.42, 0.0012);

  /* Splintering. Tight, bright, irregular clicks — wood and hollow block
     letting go. Deliberately an octave or more above the dike's gravel so
     the two never sit in the same register. */
  for (let i = 0; i < 10; i++) {
    const dt = 0.018 + i * 0.019 + Math.random() * 0.012;
    rockHit(t + dt, 0.016 + Math.random() * 0.016, 'bandpass',
            2400 + Math.random() * 3600, 1400 + Math.random() * 900, 7,
            (0.15 - i * 0.012) + Math.random() * 0.025, 0.001);
  }

  // Debris thrown clear, dying away quickly.
  [0.1, 0.16, 0.23, 0.31].forEach((dt, i) => {
    rockHit(t + dt + Math.random() * 0.03, 0.03, 'bandpass',
            2000 + Math.random() * 2600, 1100, 6, 0.06 - i * 0.012, 0.0015);
  });

  // A brief dust puff. Short on purpose: no long tail.
  rockHit(t + 0.05, 0.3, 'highpass', 3600, 6000, 0.6, 0.05);
}

/* A boulder stopped by a dike: the rock loses, nothing shatters. Blunt and
   short — no splintering layer, because no building is coming apart. */
function playBoulderCatchSound() {
  const t = audioCtx.currentTime;
  rockHit(t, 0.06, 'bandpass', 1100, 520, 2.2, 0.2);    // rock on rock
  rockHit(t + 0.003, 0.26, 'lowpass', 175, 55, 1.1, 0.3); // the stopping weight
  rockHit(t + 0.05, 0.3, 'bandpass', 700, 300, 1.5, 0.08); // grinding to a halt
  [0.16, 0.24, 0.33].forEach((dt, i) => {
    rockHit(t + dt, 0.035, 'bandpass', 1500 + Math.random() * 1200, 800, 5,
            0.05 - i * 0.012);
  });
}

function playRockDikeSound() {
  const t = audioCtx.currentTime;
  const jit = () => (Math.random() - 0.5) * 0.018;

  // 1. Rocks tumbling off the load and knocking together.
  [0, 0.05, 0.095, 0.145, 0.19, 0.245].forEach((dt) => {
    const at = t + dt + jit();
    rockHit(at, 0.05 + Math.random() * 0.045, 'bandpass',
            750 + Math.random() * 1500, 380 + Math.random() * 320, 4.5,
            0.10 + Math.random() * 0.07);            // the knock
    rockHit(at, 0.09, 'lowpass', 280, 95, 1, 0.06);  // its small body weight
  });

  // 2. The heavy landing: three layers struck together read as one big rock.
  const imp = t + 0.30;
  rockHit(imp, 0.34, 'lowpass',  190, 52,  1.2, 0.34);  // mass hitting ground
  rockHit(imp, 0.13, 'bandpass', 900, 300, 2.0, 0.21);  // crunch
  rockHit(imp, 0.05, 'highpass', 2600, 1800, 0.8, 0.11); // the crack of the strike

  // 3. Stone grinding as the pile shifts and compacts.
  rockHit(t + 0.34, 0.44, 'bandpass', 1150, 430, 1.6, 0.085);

  // 4. Dirt and gravel trickling down through the gaps.
  rockHit(t + 0.45, 0.55, 'highpass', 3200, 5400, 0.7, 0.05);

  // 5. The last few small rocks rolling and clicking into place.
  [0.85, 0.945, 1.02, 1.115, 1.22].forEach((dt, i) => {
    rockHit(t + dt + jit(), 0.03 + Math.random() * 0.02, 'bandpass',
            1700 + Math.random() * 2300, 950, 6.5,
            (0.055 - i * 0.007) + Math.random() * 0.02);
  });
}

/* ============================================================
   RECORDED SOUND EFFECTS
   ------------------------------------------------------------
   Real audio files from
     public\lahar-defense\assets\audio\sound-effect\
   Decoded into buffers and played through masterGain, which is
   the SFX bus — so they obey the Effects slider exactly like the
   synthesised cues, and are unaffected by the Music slider.

   The extension is not known here, so each name is tried as .mp3,
   .ogg then .wav and the first that decodes is cached. If none
   load, the synthesised fallback still plays, so a missing or
   misnamed file can never leave an action silent.
   ============================================================ */
const SFX_DIR = '/lahar-defense/assets/audio/sound-effect/';
const SFX_EXTS = ['.mp3', '.ogg', '.wav'];
const sfxBuffers = Object.create(null);   // name -> AudioBuffer | 'missing'

function loadSfx(name) {
  if (sfxBuffers[name] !== undefined) return;
  // Some embedding contexts have no fetch; never let that throw — the
  // synthesised fallbacks keep every action audible.
  if (typeof fetch !== 'function') { sfxBuffers[name] = 'missing'; return; }
  sfxBuffers[name] = 'loading';
  let i = 0;
  const tryNext = () => {
    if (i >= SFX_EXTS.length) {
      sfxBuffers[name] = 'missing';
      console.warn('[lahar] sound effect not found: ' + SFX_DIR + name +
                   ' (tried ' + SFX_EXTS.join(', ') + ') — using the synthesised fallback.');
      return;
    }
    const url = SFX_DIR + name + SFX_EXTS[i++];
    fetch(url)
      .then(r => r.ok ? r.arrayBuffer() : Promise.reject(r.status))
      .then(buf => audioCtx.decodeAudioData(buf))
      .then(decoded => { sfxBuffers[name] = decoded; })
      .catch(() => tryNext());
  };
  tryNext();
}

/* Plays a recorded effect, falling back to the synthesised one while the
   file is still loading or if it could not be found at all. */
function playSfx(name, fallback, gainMul) {
  const buf = sfxBuffers[name];
  if (!buf || buf === 'loading' || buf === 'missing') {
    if (fallback) fallback();
    return;
  }
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    // Slight pitch variation so repeated hits never sound like a loop.
    src.playbackRate.value = 0.94 + Math.random() * 0.12;
    const g = audioCtx.createGain();
    g.gain.value = gainMul === undefined ? 1 : gainMul;
    src.connect(g); g.connect(masterGain);     // masterGain == the SFX bus
    src.start();
  } catch (e) {
    if (fallback) fallback();
  }
}

function playSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(masterGain);   // every voice obeys the master volume
  const now = audioCtx.currentTime;
  
  if (type === 'place-sandbag' || type === 'place-shovel' ||
      type === 'place-tree'    || type === 'place-dam') {
    /* ---- ONE VOICE PER TOOL ----
       Every tool used to share a single rising blip, so the audio told you
       that something had been placed but never WHAT. Each now sounds like
       the material it is made of, so a player recognises the tool by ear
       without looking at the toolbox:

         Sandbag — a soft, dull sack landing in mud. Low and damp.
         Shovel  — a gritty scrape of steel through earth.
         Tree    — a light wooden tap that blooms upward, growing.
         Dike    — a heavy concrete slab dropping. Deep, with real weight.

       The shared oscillator above is used as each sound's tonal core; the
       gritty parts are filtered noise, built here. */
    osc.disconnect();
    const noise = (dur, filterType, freq, q, vol, sweepTo) => {
      const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = audioCtx.createBufferSource(); src.buffer = buf;
      const flt = audioCtx.createBiquadFilter();
      flt.type = filterType; flt.frequency.setValueAtTime(freq, now); flt.Q.value = q;
      if (sweepTo) flt.frequency.exponentialRampToValueAtTime(sweepTo, now + dur);
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(flt); flt.connect(g); g.connect(masterGain);
      src.start(now); src.stop(now + dur);
    };
    const tone = (wave, f0, f1, dur, vol, delay = 0) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = wave;
      o.frequency.setValueAtTime(f0, now + delay);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, now + delay + dur);
      g.gain.setValueAtTime(vol, now + delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + delay + dur);
      o.connect(g); g.connect(masterGain);
      o.start(now + delay); o.stop(now + delay + dur + 0.02);
    };

    if (type === 'place-sandbag') {
      tone('sine', 165, 70, 0.16, 0.22);          // the dull body of the drop
      noise(0.13, 'lowpass', 900, 1, 0.1);        // damp sand hitting sand
    } else if (type === 'place-shovel') {
      noise(0.28, 'bandpass', 1500, 3.5, 0.16, 4200);  // steel dragging through grit
      tone('triangle', 320, 220, 0.1, 0.07, 0.02);     // a faint metallic ring
    } else if (type === 'place-tree') {
      tone('sine', 220, 0, 0.05, 0.1);            // the wooden tap of planting
      tone('triangle', 392, 0, 0.14, 0.1, 0.05);  // then two notes opening upward
      tone('triangle', 587, 0, 0.22, 0.09, 0.13);
      noise(0.26, 'highpass', 3800, 0.7, 0.045);  // leaves settling
    } else {
      // The dike is rock, not concrete — see playRockDikeSound().
      playRockDikeSound();
    }
  } else if (type === 'place') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === 'error') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
    osc.start(now); osc.stop(now + 0.2);
  } else if (type === 'click') {
    // Soft UI tick for ordinary button presses — short and unobtrusive,
    // since a kiosk visitor will trigger it constantly.
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);
    gain.gain.setValueAtTime(0.10, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.07);
    osc.start(now); osc.stop(now + 0.08);
  } else if (type === 'confirm') {
    // Brighter two-step chime for the big affirmative actions (Next,
    // Deploy, Start Mission) so progress feels rewarded.
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.setValueAtTime(780, now + 0.07);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.16);
    osc.start(now); osc.stop(now + 0.17);
  } else if (type === 'victory' || type === 'defeat') {
    /* END-OF-RUN STINGERS.
       These are the emotional punctuation of the whole session, so unlike
       the short UI blips they are chords, not single notes: a lead voice
       plus two harmony voices, each note held long enough to ring.

       victory — a major arpeggio climbing to the octave, bright and open.
       defeat  — the same shape inverted into a minor fall, slower and
                 lower, ending unresolved so it lands as loss rather than
                 as an error buzz. */
    const win = (type === 'victory');
    const lead = win ? [523, 659, 784, 1047]     // C5 E5 G5 C6  (major)
                     : [440, 415, 349, 262];     // A4 G#4 F4 C4 (falling minor)
    const harmony = win ? [[330, 392, 523], [262, 330, 392]]
                        : [[220, 208, 175], [165, 156, 131]];
    const step = win ? 0.13 : 0.22;
    const hold = win ? 0.55 : 0.85;

    osc.type = win ? 'triangle' : 'sine';
    lead.forEach((f, i) => osc.frequency.setValueAtTime(f, now + i * step));
    const tail = now + (lead.length - 1) * step;
    gain.gain.setValueAtTime(win ? 0.17 : 0.15, now);
    gain.gain.setValueAtTime(win ? 0.17 : 0.15, tail);
    gain.gain.exponentialRampToValueAtTime(0.004, tail + hold);
    osc.start(now); osc.stop(tail + hold + 0.05);

    // Harmony voices, quieter, entering under the lead to fill it out.
    harmony.forEach((line, v) => {
      const ho = audioCtx.createOscillator();
      const hg = audioCtx.createGain();
      ho.type = win ? 'sine' : 'triangle';
      ho.connect(hg); hg.connect(masterGain);
      line.forEach((f, i) => ho.frequency.setValueAtTime(f, now + i * step));
      const ht = now + (line.length - 1) * step;
      hg.gain.setValueAtTime(0.06 - v * 0.015, now);
      hg.gain.setValueAtTime(0.06 - v * 0.015, ht);
      hg.gain.exponentialRampToValueAtTime(0.003, ht + hold);
      ho.start(now); ho.stop(ht + hold + 0.05);
    });
  } else if (type === 'launch') {
    /* START GAME — the commitment moment. A three-step rising fanfare,
       longer and fuller than 'confirm', so beginning the simulation sounds
       like an event rather than another menu step. */
    osc.type = 'sine';
    osc.frequency.setValueAtTime(392, now);          // G4
    osc.frequency.setValueAtTime(523, now + 0.08);   // C5
    osc.frequency.setValueAtTime(784, now + 0.17);   // G5
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.setValueAtTime(0.18, now + 0.17);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.42);
    osc.start(now); osc.stop(now + 0.44);
  } else if (type === 'trophy') {
    /* LEADERBOARD — a bright, bell-like sparkle. High and metallic so it
       reads as "records / achievement" and is unmistakable against the
       warm chimes used for progressing through the menus. */
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1175, now);         // D6
    osc.frequency.setValueAtTime(1568, now + 0.06);  // G6
    osc.frequency.exponentialRampToValueAtTime(2093, now + 0.2);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.004, now + 0.34);
    osc.start(now); osc.stop(now + 0.36);
  } else if (type === 'exit') {
    /* EXIT — a low, slow descent. Heavier than 'back' so leaving the game
       feels weightier than stepping back a screen, without the harsh
       sawtooth buzz of an error. */
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.26);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.3);
    osc.start(now); osc.stop(now + 0.32);
  } else if (type === 'back') {
    // Lower, downward tick for Back / cancel, so it reads as a step
    // backwards without sounding like an error.
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.08);
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.1);
    osc.start(now); osc.stop(now + 0.11);
  } else if (type === 'select') {
    // Crisp blip when arming a tool or picking a municipality.
    osc.type = 'square';
    osc.frequency.setValueAtTime(900, now);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.004, now + 0.05);
    osc.start(now); osc.stop(now + 0.06);
  } else if (type === 'storm') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 2);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 2);
    osc.start(now); osc.stop(now + 2);
  }
}

/* ---------------- TOWN & WAVE STATE ---------------- */
const gameSettings = {
  town: 'bacolor',
  difficulty: 'easy'
};

/* ---------------- 3-WAVE CAMPAIGN ----------------
   Difficulty is no longer manually chosen — every playthrough runs all
   three DIFFICULTY_SETTINGS tiers back-to-back, in order, as one
   continuous campaign against the same town: Easy, then Medium, then
   Hard. state.waveIndex tracks which of the three is currently active;
   gameSettings.difficulty is kept in sync with it (see startWave())
   purely so the rest of the file — loadDifficulty(), the rain-intensity/
   lightning lookups in simulate(), etc. — can keep reading
   DIFFICULTY_SETTINGS[gameSettings.difficulty] exactly as before without
   needing to know waves exist at all. */
/* ---- Landmark identity colours ----
   Every named structure gets one colour, used in BOTH places it appears:
   the health bar floating above it in the scene, and its dot in the goal
   panel. Matching them is what lets a player glance at a dot going red and
   know which building on the map just died — previously the bars were all
   the same green and most dots shared one beige, so the panel told you
   THAT something was lost but never WHAT.

   Hues are deliberately chosen away from green and red, which the bars
   still use to signal health, and are spaced so the set visible in any one
   town stays distinguishable (Porac shows the most at seven). */
const LANDMARK_COLORS = {
  church:      '#a855f7',   // violet
  school:      '#14b8a6',   // teal
  robot:       '#3b82f6',   // blue
  monument:    '#ec4899',   // pink
  bridge:      '#0ea5e9',   // sky
  creekBridge: '#06b6d4'    // cyan
};
// Town props (municipal hall, university, signs, market...) are indexed,
// so they draw from a small ordered palette instead of all sharing amber.
const PROP_COLORS = ['#fb923c', '#e879f9', '#facc15', '#818cf8'];
function landmarkColor(key, index) {
  if (key === 'prop') return PROP_COLORS[index % PROP_COLORS.length];
  return LANDMARK_COLORS[key] || '#94a3b8';
}

// Size of the whole HUD. Must match --hud-scale in style.css: the wave
// gauge is drawn on the canvas while the panels around it are DOM, and
// they have to shrink and grow together.
const HUD_SCALE = 0.65;
// Extra size for JUST the wave indicator, on top of HUD_SCALE.
const WAVE_GAUGE_BOOST = 1 / HUD_SCALE;   // => the gauge spans the full screen width

/* Money is denominated in pesos and runs into the millions, which is too
   long to print in full on the budget panel or a tool card. Renders
   1,250,000 as "₱1.25M" and 85,000 as "₱85K". Display only — every value
   is stored and compared at full precision. */
function formatPeso(v) {
  const n = Math.floor(v);
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return '₱' + (m >= 10 ? m.toFixed(1) : m.toFixed(2)).replace(/\.?0+$/, '') + 'M';
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return '₱' + (k >= 100 ? Math.round(k) : k.toFixed(k % 1 ? 1 : 0)) + 'K';
  }
  return '₱' + n;
}

const WAVE_ORDER = ['easy', 'medium', 'hard'];
const WAVE_LABELS = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

const TOWN_MAPS = {
  bacolor: {
    name: "Bacolor",
    // Post-1991 Bacolor: houses rebuilt on top of their buried ground floors,
    // heritage bahay na bato from its provincial-capital days, and plain
    // concrete rebuilds.
    houseStyles: [8, 5, 8, 1, 8, 2, 4, 8, 5, 3],
    infoText: "Lahar buried this town. Its church is sunk to half its height.",
    churchPos: { x: 270, y: 775 },
    schoolPos: { x: 440, y: 640 },   // clear of the church footprint
    monumentPos: { x: 90, y: 890 },
    houses: [
      // Laid out clear of San Guillermo church and of each other.
      {x: 50, y: 570, color: '#f0e6d3'},
      {x: 115, y: 570, color: '#aee4ff'},
      {x: 390, y: 570, color: '#ffdeb3'},
      {x: 455, y: 570, color: '#d4edda'},
      {x: 50, y: 640, color: '#fcf0b3'},
      {x: 180, y: 640, color: '#e8dff5'},
      {x: 320, y: 640, color: '#f7d9c4'},
      {x: 505, y: 706, color: '#e0d8f0'} /* moved clear of the DHVSU footprint */,
      {x: 50, y: 790, color: '#d7ecf5'},
      {x: 115, y: 790, color: '#f5d9d0'},
      {x: 408, y: 790, color: '#c9e4de'} /* nudged east, clear of the church */,
      {x: 455, y: 790, color: '#f5e0c8'},
      {x: 250, y: 935, color: '#e6d8c3'},
      {x: 390, y: 935, color: '#d8e6d0'}
    ],
    plants: [
      {x: 75, y: 550, size: 9, type: 'tree'}, {x: 95, y: 565, size: 6, type: 'bush'},
      {x: 460, y: 540, size: 10, type: 'tree'}, {x: 485, y: 550, size: 7, type: 'tree'},
      {x: 70, y: 640, size: 8, type: 'tree'}, {x: 85, y: 660, size: 6, type: 'bush'},
      {x: 470, y: 630, size: 7, type: 'bush'}, {x: 495, y: 645, size: 9, type: 'tree'},
      {x: 80, y: 730, size: 10, type: 'tree'}, {x: 60, y: 750, size: 7, type: 'bush'},
      {x: 460, y: 720, size: 8, type: 'tree'}, {x: 480, y: 740, size: 6, type: 'bush'},
      {x: 100, y: 800, size: 9, type: 'tree'}, {x: 85, y: 830, size: 7, type: 'bush'},
      {x: 440, y: 810, size: 9, type: 'tree'}, {x: 460, y: 840, size: 6, type: 'bush'},
      {x: 185, y: 720, size: 6, type: 'bush'}, {x: 350, y: 715, size: 7, type: 'bush'},
      {x: 215, y: 795, size: 8, type: 'tree'}, {x: 325, y: 795, size: 7, type: 'tree'},
      {x: 145, y: 875, size: 6, type: 'bush'}, {x: 395, y: 870, size: 7, type: 'bush'},
      {x: 270, y: 915, size: 8, type: 'tree'}, {x: 250, y: 925, size: 6, type: 'bush'}
    ]
  },
  porac: {
    name: "Porac",
    // Upland barangay mix: half-concrete/half-wood houses, bahay kubo, Aeta
    // cogon huts, a sari-sari store and a few concrete bungalows.
    houseStyles: [9, 0, 10, 9, 1, 3, 0, 9, 10, 2],
    infoText: "Nearest the volcano. The mud here carries rocks as big as houses.",
    // Landmark arrangement: church upper-left with the Municipal Hall aligned
    // to it on the right; below them the Babo Robot with the PORAC sign to its
    // right; the Wet Market sits below the robot.
    churchPos: { x: 130, y: 590 },
    churchScale: 1.40,             // church rendered larger
    robotPos: { x: 383, y: 801 },   // under the Municipal Hall, clear of the bridge landing
    robotScale: 0.72,              // robot rendered smaller
    schoolPos: { x: 400, y: 690 },
    // A creek runs left-to-right across the town, below the church and the
    // Municipal Hall and above the Babo Robot. Narrower than the Abacan.
    riverY: 745,
    riverHalf: 16,
    riverStyle: 'upland',          // ash-choked braided creek on the volcano's slopes
    riverBridgeAt: 0.5,            // concrete barangay bridge at mid-span
    riverMeander: 0.34,            // a gentle creek, not a full meandering river
    houses: [
      {x: 505, y: 564, color: '#ffd6ba'},
      {x: 505, y: 628, color: '#e8afb0'},
      {x: 505, y: 696, color: '#b5e2fa'},
      {x: 55,  y: 870, color: '#f5f3bb'},
      {x: 140, y: 870, color: '#f2e9e1'},
      {x: 225, y: 880, color: '#c5ded7'},
      {x: 55,  y: 950, color: '#e6d2b5'},
      {x: 140, y: 950, color: '#d7e8c5'},
      {x: 205, y: 950, color: '#dbead6'},
      {x: 275, y: 950, color: '#f0dccb'},
      {x: 505, y: 930, color: '#f2e0d4'}
    ],
    plants: [
      {x: 50, y: 450, size: 12, type: 'tree'}, {x: 490, y: 460, size: 11, type: 'tree'},
      {x: 120, y: 500, size: 10, type: 'tree'}, {x: 380, y: 510, size: 10, type: 'tree'},
      {x: 190, y: 630, size: 9, type: 'bush'}, {x: 340, y: 620, size: 8, type: 'tree'},
      {x: 150, y: 780, size: 7, type: 'tree'}, {x: 390, y: 790, size: 9, type: 'bush'}
    ],
    // Local-landmark scenery (drawn by drawTownProps): base point (x,y) is the
    // ground line, w is the on-screen width; height keeps each image's aspect.
    props: [
      { img: poracMunicipalImg, x: 400, y: 640, w: 145 , label: 'Porac Municipal Hall' },  // Municipal Hall — right of, level with the church
      { img: poracWetMarketImg, x: 383, y: 955, w: 145 , label: 'Porac Wet Market' }   // Wet Market — directly below the Babo Robot
    ]
  },
  angeles: {
    name: "Angeles",
    // City mix: two-storey concrete homes, apartment rows, Sto. Rosario
    // ancestral houses, sari-sari stores and CHB bungalows.
    // Indexed per house (see `houses` below): the tall two-storey / ancestral
    // houses go on the rows with open ground above them, and the low
    // apartment rows, CHB boxes and sari-sari stores fill the tightly
    // packed rows so nothing crowds the row above.
    houseStyles: [6, 5, 6, 7, 6,       // y 570 — top row, tall houses
                  7, 4, 7, 3, 7,       // y 620 — apartment rows (they touch, like a real block)
                  4, 7, 1, 7, 4,       // y 655 — low bungalows
                  6, 7, 5,             // y 780 — bottom-right block
                  7, 4, 6,             // y 855 — bottom-right block
                  1, 7, 5],            // y 930 — bottom-right block
    infoText: "A city split by the Abacan river. Lahar destroyed its bridge in 1991.",
    bridgePos: { x: 270, y: 705 },
    houses: [
      // The bridge deck spans the FULL width of the map at y~685-725, so
      // every house is kept clear of that band. The civic landmarks now
      // occupy the bottom-LEFT, so the residential houses below the bridge
      // sit on the bottom-RIGHT (x>=360), east of the Abacan.
      {x: 50, y: 570, color: '#f7d6c8'},
      {x: 100, y: 570, color: '#e3e4f0'},
      {x: 150, y: 570, color: '#dcf2e9'},
      {x: 200, y: 570, color: '#faede1'},
      {x: 350, y: 570, color: '#f0e6ff'},
      {x: 50, y: 620, color: '#e2f4ff'},
      {x: 100, y: 620, color: '#ffeedb'},
      {x: 150, y: 620, color: '#eafaf1'},
      {x: 200, y: 620, color: '#f9dcd0'},
      {x: 350, y: 620, color: '#dbeafe'},
      {x: 50, y: 655, color: '#fef3c7'},
      {x: 100, y: 655, color: '#e0f2fe'},
      {x: 150, y: 655, color: '#f5e6d3'},
      {x: 200, y: 655, color: '#dfe9f7'},
      {x: 350, y: 655, color: '#f0dcd0'},
      // Bottom-right residential block (clear of the river's right bank)
      {x: 360, y: 780, color: '#f7e4d0'},
      {x: 420, y: 780, color: '#dcecdc'},
      {x: 480, y: 780, color: '#e2eef5'},
      {x: 360, y: 855, color: '#ffeedb'},
      {x: 420, y: 855, color: '#dbe9f5'},
      {x: 480, y: 855, color: '#f5ead0'},
      {x: 360, y: 930, color: '#eafaf1'},
      {x: 420, y: 930, color: '#f0dcd0'},
      {x: 480, y: 930, color: '#e0f2fe'}
    ],
    plants: [
      {x: 60, y: 660, size: 7, type: 'bush'}, {x: 480, y: 660, size: 7, type: 'bush'},
      {x: 220, y: 580, size: 8, type: 'tree'}, {x: 320, y: 580, size: 8, type: 'tree'},
      {x: 50, y: 850, size: 9, type: 'tree'}, {x: 490, y: 850, size: 9, type: 'tree'}
    ],
    props: [
      // Salakot marker in the UPPER-RIGHT of the field (above the bridge,
      // east of the Abacan and clear of the x=350 house column). The three
      // civic landmarks stay grouped in the bottom-left: church and
      // university side by side (university to the RIGHT), museum below.
      { img: angelesSalakotImg, x: 466, y: 626, w: 118, label: 'Angeles Salakot' },       // upper-right marker (open ground, room to be large)
      { img: angelesChurchImg,  x: 78,  y: 884, w: 142, label: 'Angeles Church' },        // church — as wide as the left bank allows
      { img: holyAngelUnivImg,  x: 184, y: 884, w: 80,  label: 'Holy Angel University' }, // right beside the church, up to the river's edge
      { img: angelesMuseumImg,  x: 86,  y: 954, w: 120, label: 'Angeles City Museum' }    // below the church
    ]
  }
};

/* ---------------- DIFFICULTY PROFILES ---------------- */
// channelCount controls how many independent lahar channels
// generateRandomPaths() creates: Easy = 3, Medium = 4, Hard = 5.
// speedMultipliers must have at least `channelCount` entries — one
// per-channel speed factor, consumed in simulate().
/* ---- BALANCE ----
   Resources now scale UP with the threat instead of down. The old curve gave
   the player LESS money (1.5M -> 1.2M -> 0.9M) exactly as the number of
   channels to defend went UP (3 -> 4 -> 5), so the later waves were not hard,
   they were unwinnable: a fully-committed player still lost 13-14 of 24
   houses on Medium and Hard.
   The escalation now lives where it belongs — more channels, faster flows,
   heavier rain, and damage carried over from the previous wave — while the
   budget keeps roughly the same money-per-channel so the player always has a
   move available. Hard is still far tighter than Easy: five channels on a
   2.4M ceiling is much thinner cover than three on 1.8M. */
const DIFFICULTY_SETTINGS = {
  easy: {
    startBudget: 1_500_000,
    maxBudget: 1_800_000,
    passiveIncome: 80_000,
    channelCount: 3,
    speedMultipliers: [0.9, 0.65, 1.1],
    rainIntensity: 1.5
  },
  medium: {
    startBudget: 1_700_000,
    maxBudget: 2_100_000,
    passiveIncome: 100_000,
    channelCount: 4,
    speedMultipliers: [1.15, 0.85, 1.35, 1.0],
    rainIntensity: 3.5
  },
  hard: {
    startBudget: 2_000_000,
    maxBudget: 2_500_000,
    passiveIncome: 125_000,
    channelCount: 5,
    speedMultipliers: [1.28, 1.02, 1.42, 1.15, 1.33],
    rainIntensity: 7.0
  }
};

/* ---------------- EDUCATIONAL CONTENT ----------------
   Short, self-contained facts used by two lightweight, non-interrupting
   surfaces: a rotating ticker on the pre-game menu screens, and a single
   random pick shown on the end-of-round screen. Kept general (no invented
   statistics) since this is exhibit-facing educational content. */
const LAHAR_FACTS = [
  "\"Lahar\" is a Javanese word for a volcanic mudflow, now used by scientists worldwide.",
  "The June 1991 eruption of Mount Pinatubo is considered one of the largest volcanic eruptions of the 20th century.",
  "Lahars form when loose volcanic ash and debris mix with water — from heavy rain, crater lakes, or melting snow.",
  "Even years after an eruption, heavy rain falling on old ash deposits can still trigger new lahars.",
  "In Bacolor, Pampanga, the historic San Guillermo Parish Church was partially buried by lahar deposits after the Pinatubo eruption.",
  "Barriers like sandbags and check dams work by slowing a lahar's speed and trapping some of its sediment.",
  "Trees and vegetation help stabilize volcanic soil, reducing the speed and force of future mudflows.",
  "Early warning systems and evacuation planning are among the most effective ways to reduce lahar casualties.",
  "Because lahars can strike with little warning, communities near volcanoes often train with evacuation drills.",
  "Pinatubo's lahars kept reshaping river systems in Central Luzon for years after the 1991 eruption."
];

/* ---------------- GAME STATE & CHANNELS ---------------- */
// `kind` still controls placement/HP basics (area tools get Infinity hp —
// they're permanent). `mechanic` controls how the tool actually behaves in
// simulate() — see the per-mechanic branches in the channel loop below:
//   block   — classic point resistance; wears faster the more intense the
//             lahar currently is (physically getting battered by the flow)
//   absorb  — strong resistance while it still has capacity; capacity
//             drains at a FIXED rate over time in contact, independent of
//             lahar intensity (it fills up / overflows rather than being
//             washed away)
//   divert  — doesn't add resistance at all; instead directly cuts that
//             channel's flow speed while in contact. Wears down slowly
//             from fixed manual fatigue, not from the lahar's force.
//   slow    — permanent area effect (trees), never wears.
//
// Two extra effect fields were added on top of the original `mechanic`
// system so every tool has a real, distinct job (see the FLOW DEFLECTION
// ENGINE and barrierShield() below):
//
//   deflectStrength / deflectRange
//       This tool physically bends the lahar's channel geometry sideways
//       around itself, up to `deflectStrength` px of lateral push, felt
//       out to `deflectRange` px. Only the shovel (a dug diversion cut)
//       and the dike (a raised embankment wall) have this. The bend
//       scales with the tool's remaining hp, so an eroding shovel
//       gradually loses its grip on the flow and the mud creeps back to
//       its original line.
//
//   shield / shieldRadius
//       Fraction of incoming lahar contact damage this tool soaks for
//       any structure standing within shieldRadius px of it. Shields
//       from several tools combine multiplicatively and are hard-capped
//       (MAX_SHIELD) so a wall of cheap sandbags can never make a
//       building invulnerable — and soaking mud wears the barrier down,
//       so protection is temporary and has to be re-bought.
const TOOL_DEFS = {
  sandbag: { name: 'Sandbag', price: 85_000, kind: 'point', mechanic: 'block', strength: 42, radius: 26, wearMultiplier: 4.5,
             shield: 0.46, shieldRadius: 62 },
  shovel:  { name: 'Shovel', price: 200_000, kind: 'point', mechanic: 'divert', strength: 0, radius: 30, divertPercent: 0.35, fatigueRate: 1.5,
             deflectStrength: 82, deflectRange: 108 },
  tree:    { name: 'Tree', price: 425_000, kind: 'area', mechanic: 'slow', strength: 0.34, radius: 46,
             shield: 0.30, shieldRadius: 58 },
  dam:     { name: 'Dike', price: 750_000, kind: 'point', mechanic: 'block', strength: 98, radius: 40, wearMultiplier: 4,
             shield: 0.68, shieldRadius: 70, cutsFlow: true, cutReach: 52 }
};

// Hard ceilings that keep the new tool effects from trivialising the game.
/* Global severity of lahar contact damage. At 1.0 a house in the core of a
   full-volume channel dies in ~14s, which left no time to react or build.
   At 0.54 it survives ~26s of direct contact — long enough to notice, spend
   and respond, which is the loop the game is built around. Tuned against
   full-campaign playtests: committed play (damming every channel) finishes
   with 3-4 of 24 houses lost in Angeles, half-hearted play with 6-7, and no
   defence at all with 9-11 — so the win is earned but reliably reachable. */
const CONTACT_DAMAGE_SCALE = 0.54;

const MAX_SHIELD = 0.86;      // no structure can ever soak more than this fraction of incoming damage
const MAX_TREE_RES = 0.6;     // a mature grove can nearly halt a weak flow, but never fully stop it

/* ---- SLOPE COVER (the Tree's real job) ----
   As a barrier the Tree was strictly dominated: 0.071 shield per 100K
   against a sandbag's 0.541, so five sandbags beat one tree for the same
   money and it never felt worth buying.

   Rather than inflate its numbers into a worse dike, it now does the one
   thing no other tool does, and the thing reforestation actually does on
   Pinatubo: it stabilises the ash slopes so the rain mobilises less
   material. Trees planted ABOVE the town weaken every channel, everywhere,
   for the rest of the campaign — they do not block a flow, they make the
   flow itself less destructive.

   That gives the toolbox a genuine strategic axis. Sandbags, dikes and
   shovels are tactical and local: they answer the storm in front of you.
   Trees are an investment: they cost a wave's worth of protection now and
   pay it back across the two waves that follow, which is exactly the
   trade-off a disaster planner faces. */
const SLOPE_COVER_LINE  = 620;   // trees above this line count as slope cover
const TREE_COVER_EACH   = 0.06;  // each mature slope tree weakens all flows by 6%
const MAX_SLOPE_COVER   = 0.42;  // seven mature trees; never a full shutdown

function slopeCover() {
  let cover = 0;
  for (const it of (state.placedItems || [])) {
    if (it.type !== 'tree' || it.dead) continue;
    if (it.y > SLOPE_COVER_LINE) continue;      // planted down in the town: no catchment effect
    cover += TREE_COVER_EACH * treeGrow(it);
  }
  return Math.min(MAX_SLOPE_COVER, cover);
}
const MAX_DEFLECT_PX = 94;    // furthest a channel can be pushed sideways at any one point
// 8 real seconds = 12 game seconds at GAME_SPEED 1.5, i.e. exactly the
// same share of a storm a sapling needed before the speed-up. treeGrow()
// measures against the real-time ambient clock, so this cannot just be 12.
const TREE_GROW_TIME = 8;     // real seconds for a sapling to mature

// A planted tree matures from a sapling (0) to full canopy (1) over
// TREE_GROW_TIME seconds of ambient time, so it grows during the prep phase
// too. Drives its slow strength, shield, and rendered size.
function treeGrow(item) {
  if (item.plantT === undefined) return 1; // legacy / already-mature
  return Math.max(0, Math.min(1, (ambientTime - item.plantT) / TREE_GROW_TIME));
}

let state = {
  budget: 1_200_000, budgetMax: 1_500_000, passiveIncome: 60_000,
  running: false, raining: false, gameOver: false, won: false, scoreSubmitted: false,
  time: 0, rainAmount: 0, laharVolume: 0, stormTime: 0, stormOver: false, postStormTimer: 0,
  skyTransition: 0, screenShake: 0, lightningFlash: 0,
  lightningPath: [],
  laharProgresses: [0, 0, 0], branchProgresses: [],
  placedItems: [], toolsPlacedTotal: 0, dust: [],
  boulders: [], burialLevel: 0, bankScars: [], hazardTimer: 0, bridgeWarn: null,
  houses: [], church: null, school: null, robot: null, monument: null, bridge: null,
  particles: [], flowParticles: [], ripples: [],
  debris: [], splashes: [],
  // Floating "+N absorbed" numbers thrown off tools that just took a hit
  // for a building (see the TOOL IMPACT SYSTEM).
  impactTexts: [],
  comboCount: 0, lastPlacementTime: -999, maxCombo: 0,
  birdsFleeing: false, birdsFleeStartAmbient: 0,
  carsFleeing: false, carsFleeStartAmbient: 0,
  villagersFleeing: false, villagersFleeStartAmbient: 0,
  // Falling sun collectibles
  fallingSuns: [], sunSpawnTimer: 6,
  // 3-wave campaign: which wave (0=Easy,1=Medium,2=Hard) is active, and
  // a >0 countdown (seconds remaining) during the between-wave prep
  // pause — see beginWaveTransition()/startWave() below.
  waveIndex: 0, prepCountdown: -1,
};

// channelPaths holds the LIVE channel geometry the whole game reads from
// (rendering, damage corridors, tool contact). basePaths holds the
// pristine, undeflected geometry that generateRandomPaths() produced.
// Every time a diversion tool is placed, erodes or is destroyed, the live
// paths are rebuilt from basePaths by rebuildFlowGeometry() — always from
// the pristine copy, never from the already-bent result, so a bend can
// never feed back on itself and oscillate.
let channelPaths = [];
let basePaths = [];
let BASE_LENS = [];
let CHANNEL_LENS = [0, 0, 0];
let flowGeomDirty = true;   // set whenever a deflecting tool changes
let flowGeomTimer = 0;      // throttle so hp-driven bends refresh at ~4Hz, not every frame

// ---------------- LAHAR BRANCHES ----------------
// The main channelPaths only reach buildings that happen to sit close to
// one of the big procedurally-generated channels (and even then, only
// once that channel's front has "fanned out" past SPREAD_START — see
// getChannelSpread()). Houses/landmarks sitting further out from every
// main channel would otherwise never take any damage at all.
//
// branchPaths fixes that: after the main channels are generated, every
// building whose nearest main channel is farther than BRANCH_COVERAGE
// px away gets its own small offshoot — a thin trickle that peels off
// the nearest main channel (at the point along it closest to the
// building) and heads straight for that building. Branches are
// intentionally weak/small ("just a small flow of lahar"): a single
// sandbag provides meaningful resistance against one, so players don't
// need to spend on a Dike to protect an isolated house.
let branchPaths = [];
const BRANCH_COVERAGE = 26; // px — only buildings basically ON a main channel skip getting their own branch
const BRANCH_SPEED = 0.6;    // branches advance slower than the main channels they split from
const BRANCH_DAMAGE_START = 0.85; // branch progress at which it starts touching its target
// How far a diversion tool has to walk a branch's mouth off its target
// building before the trickle stops hitting it entirely.
const BRANCH_MISS_PX = 58;

function pathLength(path) {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i].x - path[i-1].x, path[i].y - path[i-1].y);
  return len;
}

function pointAtProgress(path, t, totalLen) {
  let target = t * totalLen;
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i-1], b = path[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + segLen >= target) {
      const local = (target - acc) / segLen;
      return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    acc += segLen;
  }
  const last = path[path.length-1];
  return { x: last.x, y: last.y, angle: 0 };
}

// As a channel's progress nears the bottom of the map, the front of the
// flow "fans out" instead of staying a tight point — this returns how far
// along that fan-out the channel is (0 = still a narrow front, 1 = fully
// spread) plus the resulting contact radius, in world px, used both for
// visual rendering (drawLaharFlow) and for damage contact checks (simulate).
const SPREAD_START = 0.84; // progress at which the front begins spreading
function getChannelSpread(progress) {
  const overFactor = Math.max(0, Math.min(1, (progress - SPREAD_START) / (1 - SPREAD_START)));
  // Gentler growth than before (40 -> ~95px rather than 190px). Combined
  // with the channel now exiting below the screen, the flow reads as
  // running off the bottom edge instead of fanning into a static pool.
  const radius = 40 + overFactor * 55;
  return { overFactor, radius };
}

// Terrain-aware speed: steeper slopes (high dy) move faster,
// flatter areas (low dy) slow down — mimicking real lahar behavior.
function getSlopeFactor(path, progress, totalLen) {
  const pt1 = pointAtProgress(path, Math.max(0, progress - 0.03), totalLen);
  const pt2 = pointAtProgress(path, Math.min(0.999, progress + 0.03), totalLen);
  const dy = pt2.y - pt1.y;
  const dist = Math.hypot(pt2.x - pt1.x, dy);
  const slope = dist > 0.5 ? dy / dist : 0.5;
  return 0.6 + Math.max(0, slope) * 0.6; // ~0.6 on flat, ~1.2 on steep downhill
}

/* ---------------- PROCEDURAL PATH GENERATION ---------------- */
// channelCount: how many independent lahar channels to generate — driven by
// the active difficulty's DIFFICULTY_SETTINGS.channelCount (Easy 3 / Medium 4
// / Hard 5). Defaults to 3 for safety if called without an argument.
// Generates natural volcanic radial drainage channels that originate across
// the breached crater rim, meander down distinct gullies spanning the full
// width of Mount Pinatubo, and flow to independent downstream outlets.
// ---- Flow-path safeguard ----
// On this map elevation is screen y: the crater sits at the top
// (CRATER_Y) and the town at the bottom, so "farther from the volcano"
// means "lower on screen". EVERY path the mud can follow — a freshly
// generated channel, a branch, or a channel bent by a shovel/dike — is
// passed through here before it is used. It guarantees that:
//   1. each point is at least as far downhill as the one before it, so a
//      flow following the path can never turn back toward the crater
//      (kills spline overshoot and normal-offset bends that pointed up);
//   2. every point stays inside the playable corridor (the final exit
//      point is allowed just below the screen on purpose, so a finished
//      channel runs off the bottom edge rather than pooling);
//   3. no zero-length segment survives (it would make pointAtProgress
//      divide by zero and return NaN — a teleporting front).
// Paths are corrected rather than rejected, so a bad random roll can
// never stall the game. The point count is preserved so callers can keep
// blending between successive versions of the same path.
function sanitizeLaharPath(path) {
  const out = new Array(path.length);
  for (let i = 0; i < path.length; i++) {
    let x = Math.max(22, Math.min(W - 22, path[i].x));
    let y = Math.max(0, Math.min(H + 100, path[i].y));
    if (i > 0) {
      const q = out[i - 1];
      if (y < q.y) y = q.y;                                   // never uphill
      if (y - q.y < 0.05 && Math.abs(x - q.x) < 0.05) y = q.y + 0.05; // no zero-length segment
    }
    out[i] = { x, y };
  }
  return out;
}

function generateRandomPaths(channelCount) {
  const totalChannels = channelCount || 3;
  channelPaths.length = 0;

  for (let c = 0; c < totalChannels; c++) {
    const normC = totalChannels > 1 ? c / (totalChannels - 1) : 0.5;
    
    // 1. Independent starting point along the crater breach rim (x: 245..340, y: 172..192)
    const craterStartX = Math.max(242, Math.min(342, Math.round(252 + normC * 80 + (Math.random() - 0.5) * 20)));
    const craterStartY = Math.max(170, Math.min(195, Math.round(175 + (1 - Math.abs(normC - 0.5) * 2) * 8 + (Math.random() - 0.5) * 6)));

    // 2. Multi-tier elevation contours down Mount Pinatubo
    const rows = [245, 330, 430, 535, 645, 755];
    
    // Spread target across the entire mountain flank and town width (60px to 480px)
    const flankBiasX = 65 + normC * (475 - 65);
    
    const rawWaypoints = [{ x: craterStartX, y: craterStartY }];

    // Upper volcano cone chute (y: ~210) — channels start separating immediately near the peak
    const upperDrift = (normC - 0.5) * 35 + (Math.random() - 0.5) * 16;
    rawWaypoints.push({
      x: Math.max(210, Math.min(370, Math.round(craterStartX + upperDrift))),
      y: 208 + Math.round((Math.random() - 0.5) * 6)
    });

    rows.forEach((y, index) => {
      const lerpFactor = (index + 1) / rows.length;
      // Natural terrain meander & gully wandering
      const wander = (Math.random() - 0.5) * 58 + Math.sin(index * 1.7 + c * 2.3) * 28;
      let targetX = craterStartX + (flankBiasX - craterStartX) * (lerpFactor * 0.95 + 0.05) + wander;
      targetX = Math.max(48, Math.min(492, Math.round(targetX)));
      
      rawWaypoints.push({ x: targetX, y: y + Math.round((Math.random() - 0.5) * 12) });
    });

    // 3. Downstream: carry the flow down through the town plain and then
    //    OFF the bottom edge of the screen, so a full channel keeps running
    //    away instead of piling up at the base of the map. The final
    //    waypoint sits below the visible area (y > H).
    const endWander = (Math.random() - 0.5) * 40;
    const plainX = Math.max(50, Math.min(490, Math.round(flankBiasX + endWander)));
    // A point down on the town plain (still on-screen)…
    rawWaypoints.push({ x: plainX, y: 885 + Math.round(Math.random() * 20) });
    // …then an off-screen exit so the ribbon flows out of the bottom.
    const exitX = Math.max(40, Math.min(500, Math.round(plainX + (Math.random() - 0.5) * 34)));
    rawWaypoints.push({ x: exitX, y: H + 95 });

    // 4. Smooth Catmull-Rom spline interpolation for organic curving mudflow channels
    const smoothPath = [];
    const subSteps = 6;
    for (let w = 0; w < rawWaypoints.length - 1; w++) {
      const p0 = rawWaypoints[Math.max(0, w - 1)];
      const p1 = rawWaypoints[w];
      const p2 = rawWaypoints[w + 1];
      const p3 = rawWaypoints[Math.min(rawWaypoints.length - 1, w + 2)];
      for (let s = 0; s < subSteps; s++) {
        const t = s / subSteps;
        const t2 = t * t, t3 = t2 * t;
        const sx = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
        const sy = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
        smoothPath.push({ x: Math.round(sx * 10) / 10, y: Math.round(sy * 10) / 10 });
      }
    }
    smoothPath.push(rawWaypoints[rawWaypoints.length - 1]);

    channelPaths.push(sanitizeLaharPath(smoothPath));
  }

  for (let i = 0; i < channelPaths.length; i++) {
    CHANNEL_LENS[i] = pathLength(channelPaths[i]);
  }

  // Keep a pristine copy for the deflection engine to rebuild from.
  basePaths = channelPaths.map(p => p.map(pt => ({ x: pt.x, y: pt.y })));
  BASE_LENS = CHANNEL_LENS.slice(0, basePaths.length);
  flowGeomDirty = true;
}

// Closest point on segment a->b to point p, plus the distance and how far
// along the segment (0..1) that point sits — used to find both the
// nearest main-channel point to a building AND how far along that
// channel's total length the branch point is (so the branch only starts
// flowing once the main channel has actually reached it).
function closestPointOnSegment(a, b, p) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + dx * t, py = a.y + dy * t;
  return { x: px, y: py, t, dist: Math.hypot(p.x - px, p.y - py) };
}

// Builds branchPaths (see the block comment above the BRANCH_* constants)
// from whatever buildings currently exist in `state` — call this AFTER
// generateRandomPaths() (needs channelPaths) AND after houses/church/
// school/robot/monument/bridge are populated (loadTownMap(), or already
// carried over from a previous wave in startWave()).
//
// Real lahar distributaries don't peel off right beside the thing they
// eventually hit — they split from the main flow further upstream, then
// course down the slope under their own gravity before reaching their
// target. So instead of starting each branch at the closest point on the
// parent channel, we back that split point UP the channel (toward the
// Builds branchPaths from whatever buildings currently exist in `state`.
// Branches start splitting high up on Mount Pinatubo (originT: 0.12 - 0.38,
// well before the main lahar reaches the middle of the mountain) and spread
// far laterally across the mountain flanks, creating wide separate channels
// where players can tactically deploy sandbags.
function generateBranchPaths() {
  // Lahar branches (small trickles splitting off toward individual buildings)
  // have been removed by design — only the main channels flow now. Keeping
  // branchPaths empty makes every branch loop, render, and damage pass a
  // no-op without touching the rest of the code.
  branchPaths = [];
  return;
}

function generateBranchPaths_DISABLED() {
  branchPaths = [];
  if (!channelPaths.length) return;

  const buildings = [];
  state.houses.forEach(h => buildings.push({ x: h.x, y: h.y, ref: h, type: 'house' }));
  if (state.church)   buildings.push({ x: state.church.x,   y: state.church.y,   ref: state.church,   type: 'church',   label: null });
  if (state.school)   buildings.push({ x: state.school.x,   y: state.school.y,   ref: state.school,   type: 'school',   label: 'School lost!' });
  if (state.robot)    buildings.push({ x: state.robot.x,    y: state.robot.y,    ref: state.robot,    type: 'robot',    label: 'Babo Robot fell!' });
  if (state.monument) buildings.push({ x: state.monument.x, y: state.monument.y, ref: state.monument, type: 'monument', label: 'Soto Monument fell!' });
  if (state.bridge)   buildings.push({ x: state.bridge.x,   y: state.bridge.y,   ref: state.bridge,   type: 'bridge',   label: 'Bridge collapsed!' });

  buildings.forEach((b, bIdx) => {
    let bestDist = Infinity, bestPoint = null, bestChannel = -1, bestAccLen = 0, bestSegLen = 0, bestT = 0;

    for (let ci = 0; ci < channelPaths.length; ci++) {
      const cpath = channelPaths[ci];
      let accLen = 0;
      for (let i = 1; i < cpath.length; i++) {
        const a = cpath[i - 1], c = cpath[i];
        const segLen = Math.hypot(c.x - a.x, c.y - a.y);
        const cp = closestPointOnSegment(a, c, b);
        if (cp.dist < bestDist) {
          bestDist = cp.dist; bestPoint = { x: cp.x, y: cp.y };
          bestChannel = ci; bestAccLen = accLen; bestSegLen = segLen; bestT = cp.t;
        }
        accLen += segLen;
      }
    }

    if (bestChannel < 0 || bestDist <= BRANCH_COVERAGE) return; // already covered by a main channel

    const parentPath = channelPaths[bestChannel];
    const parentLen = CHANNEL_LENS[bestChannel];
    const rand = mulberry32(2000 + bIdx * 43 + Math.floor(b.x * 5) ^ Math.floor(b.y * 11));

    // Branches strictly originate in the upper mountain slope (originT: 0.12 - 0.38)
    // BEFORE the main lahar reaches the middle of Mount Pinatubo (progress ~ 0.40 - 0.50).
    const minUpperT = 0.12;
    const maxUpperT = 0.36;
    const originT = Math.max(minUpperT, Math.min(maxUpperT, minUpperT + (bIdx / Math.max(1, buildings.length)) * (maxUpperT - minUpperT) + (rand() - 0.5) * 0.05));
    const originPoint = pointAtProgress(parentPath, originT, parentLen);

    // Direction to branch out (spreading far outward from the main channel)
    const dx = b.x - originPoint.x;
    const dy = b.y - originPoint.y;
    const sideDir = dx < 0 ? -1 : 1;
    const lateralSpread = 45 + rand() * 55; // wide lateral flare outward

    const angle = originPoint.angle || Math.PI / 2;
    // Waypoint 1: Upper mountain peel-off (diverges sharply outward from parent channel)
    const wp1 = {
      x: Math.max(40, Math.min(500, originPoint.x + Math.cos(angle + sideDir * 0.6) * 50 + sideDir * lateralSpread * 0.6)),
      y: Math.round(originPoint.y + 45 + rand() * 25)
    };

    // Waypoint 2: Mid-slope mountain valley (spreads wide across the mountain flank)
    const wp2 = {
      x: Math.max(38, Math.min(502, originPoint.x + dx * 0.45 + sideDir * lateralSpread + (rand() - 0.5) * 30)),
      y: Math.round(originPoint.y + dy * 0.48 + (rand() - 0.5) * 20)
    };

    // Waypoint 3: Lower plain channel heading toward building
    const wp3 = {
      x: Math.max(38, Math.min(502, originPoint.x + dx * 0.78 + (rand() - 0.5) * 22)),
      y: Math.round(originPoint.y + dy * 0.80 + (rand() - 0.5) * 15)
    };

    // Keep every waypoint strictly below the one before it (gravity!):
    // if the target sits close below the split point the peel-off could
    // otherwise overshoot it and the branch would climb back up.
    const endY = Math.max(originPoint.y + 30, b.y);
    wp1.y = Math.min(wp1.y, originPoint.y + (endY - originPoint.y) * 0.3);
    wp2.y = Math.max(wp1.y + 8, Math.min(wp2.y, originPoint.y + (endY - originPoint.y) * 0.62));
    wp3.y = Math.max(wp2.y + 8, Math.min(wp3.y, endY - 6));
    const rawWaypoints = [{ x: originPoint.x, y: originPoint.y }, wp1, wp2, wp3, { x: b.x, y: endY }];
    
    // Subdivide rawWaypoints into smooth Catmull-Rom spline sampled path points
    const smoothPath = [];
    const subSteps = 6;
    for (let w = 0; w < rawWaypoints.length - 1; w++) {
      const p0 = rawWaypoints[Math.max(0, w - 1)];
      const p1 = rawWaypoints[w];
      const p2 = rawWaypoints[w + 1];
      const p3 = rawWaypoints[Math.min(rawWaypoints.length - 1, w + 2)];
      for (let s = 0; s < subSteps; s++) {
        const t = s / subSteps;
        const t2 = t * t, t3 = t2 * t;
        const sx = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
        const sy = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
        smoothPath.push({ x: Math.round(sx * 10) / 10, y: Math.round(sy * 10) / 10 });
      }
    }
    smoothPath.push({ x: b.x, y: endY });
    const cleanPath = sanitizeLaharPath(smoothPath);

    branchPaths.push({
      path: cleanPath,
      // Pristine copy for the deflection engine (see rebuildFlowGeometry).
      basePath: cleanPath.map(pt => ({ x: pt.x, y: pt.y })),
      len: pathLength(smoothPath),
      parentChannel: bestChannel,
      originT,
      target: b,
      // How far the branch's mouth has been pushed off its target building
      // by diversion tools — 0 while undisturbed. Drives branch damage.
      endOffset: 0,
      divertAnnounced: false
    });
  });
}

/* =====================================================================
   FLOW DEFLECTION ENGINE  (tool mechanics)
   ---------------------------------------------------------------------
   The lahar is a path-following flow: every channel and every branch is
   a polyline, and a 0..1 `progress` says how far down it the mud has
   travelled. Rendering (drawLaharFlow / drawBranchFlows) and damage
   (distToTraveledPath / laharContactDamage) BOTH read those same
   polylines, which is exactly what makes real diversion possible: bend
   the polyline and the mud is drawn somewhere else AND stops hitting
   whatever used to be underneath it. No parallel lahar system needed.

   So a diversion tool (shovel, and to a lesser degree the dike) does not
   "block" the flow — it edits the channel. For every point of the
   pristine base path that falls inside the tool's range, the point is
   pushed sideways ALONG THE CHANNEL'S OWN NORMAL, away from the side the
   tool was planted on, by an amount that falls off smoothly to zero at
   the edge of the range. Two smoothing passes then remove any kink, so
   the result is a channel that curves out around the tool and curves
   back in downstream — the mud flows around the cut and keeps going,
   rather than stopping.

   Three properties fall out of doing it this way:
     * Local. Outside deflectRange the geometry is untouched, so one
       shovel can never re-plumb the whole map.
     * Stable. The bend is always recomputed from basePaths, never from
       the previous (already bent) result, so a deflected point moving
       out of range can't cause it to snap back and oscillate.
     * Directional. Which way the mud goes depends on which side of the
       channel the player dropped the tool: plant it between the flow and
       a house and the flow is pushed to the far side.
   ===================================================================== */

// Shortest distance from (px,py) to the portion of `path` the flow has
// ALREADY covered (from the source up to maxLen along it). Hoisted to
// module scope (it used to be a local inside simulate) so the tool code
// can ask "is mud running past this tool right now?" too.
function distToTraveledPath(path, maxLen, px, py) {
  let acc = 0, best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const segStart = acc, segEnd = acc + segLen;
    if (segStart >= maxLen) break;
    const clipLen = Math.min(segEnd, maxLen);
    const clipT = segLen > 0 ? (clipLen - segStart) / segLen : 0;
    const bClipped = { x: a.x + (b.x - a.x) * clipT, y: a.y + (b.y - a.y) * clipT };
    const cp = closestPointOnSegment(a, bClipped, { x: px, y: py });
    if (cp.dist < best) best = cp.dist;
    acc = segEnd;
  }
  return best;
}

// Along-path progress (0..1) of the point on `path` nearest to (x, y),
// plus that nearest distance — used to work out where on a channel a Dike
// sits so it can cap the flow there.
function progressOfNearestPoint(path, totalLen, x, y) {
  let acc = 0, best = Infinity, bestLen = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const cp = closestPointOnSegment(a, b, { x, y });
    if (cp.dist < best) { best = cp.dist; bestLen = acc + segLen * cp.t; }
    acc += segLen;
  }
  return { t: totalLen > 0 ? bestLen / totalLen : 0, dist: best };
}

/* =====================================================================
   DIKE FLOW-BLOCKING (coverage model)
   ---------------------------------------------------------------------
   A dike is a physical embankment that covers a LATERAL SLICE of the
   channel, not the whole thing. The channel has a blockable cross-section
   of width 2*DIKE_CHANNEL_HALF; one dike covers ±DIKE_COVER_HALF around
   wherever it was planted across that width. From the union of the dikes
   sitting at roughly the same point along the channel (a "band") we get a
   coverage fraction:

     coverage >= DIKE_CAP_COVERAGE  -> the band spans (nearly) the whole
        width: the flow is CUT. Its progress is capped at the band, the mud
        piles up behind it (see the accumulation pool), and it is released
        as a surge if the dike later breaks.
     coverage <  DIKE_CAP_COVERAGE  -> there's an open gap: the flow is
        throttled (squeezing through is slow) and the geometry engine bends
        the channel toward the gap centre, so the mud visibly flows AROUND
        the dike's open side. Add more dikes across the gap to reach a full
        cut.

   Everything is expressed in the existing path-progress + deflection
   systems — no separate fluid simulation. =============================== */
const DIKE_CHANNEL_HALF = 30;   // half-width of the channel slice a line of dikes must span to fully cut it
const DIKE_COVER_HALF   = 32;   // half-width one dike covers across that slice
const DIKE_CAP_COVERAGE = 0.8;  // coverage fraction at/above which the flow is fully cut
const DIKE_BAND_T       = 0.04; // dikes within this much progress of each other count as one line
const DIKE_DRAIN_SPD    = 0.5;  // (legacy) progress/sec — superseded by the fade model below
const DIKE_FADE_TIME    = 1.8;  // seconds for stranded downstream mud to dry up and vanish in place

// Nearest point on a path to (x,y): its along-path progress t, distance,
// the point itself, and the channel normal there.
function nearestOnPath(path, totalLen, x, y) {
  let acc = 0, best = Infinity, bestLen = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const cp = closestPointOnSegment(a, b, { x, y });
    if (cp.dist < best) { best = cp.dist; bestLen = acc + segLen * cp.t; }
    acc += segLen;
  }
  const t = totalLen > 0 ? bestLen / totalLen : 0;
  const pt = pointAtProgress(path, Math.min(0.999, t), totalLen);
  return { t, dist: best, x: pt.x, y: pt.y, nx: -Math.sin(pt.angle), ny: Math.cos(pt.angle) };
}

// Coverage fraction + widest open-gap centre for a set of lateral offsets
// (signed px from the channel centreline) of dikes sharing one band.
function coverageOfLats(lats) {
  const HALF = DIKE_CHANNEL_HALF, C = DIKE_COVER_HALF;
  const iv = lats.map(l => [Math.max(-HALF, l - C), Math.min(HALF, l + C)])
                 .filter(v => v[1] > v[0]).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const v of iv) {
    if (!merged.length || v[0] > merged[merged.length - 1][1]) merged.push(v.slice());
    else merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], v[1]);
  }
  let cov = 0; for (const m of merged) cov += m[1] - m[0];
  const gaps = []; let prev = -HALF;
  for (const m of merged) { if (m[0] > prev) gaps.push([prev, m[0]]); prev = Math.max(prev, m[1]); }
  if (prev < HALF) gaps.push([prev, HALF]);
  let gapCenter = 0, gapW = 0;
  for (const g of gaps) { const w = g[1] - g[0]; if (w > gapW) { gapW = w; gapCenter = (g[0] + g[1]) / 2; } }
  return { coverage: cov / (2 * HALF), gapCenter, gapW };
}

// Group the alive dikes on `path` into bands (dike "lines") and describe
// each: along-path position t, coverage fraction, open-gap centre (lateral
// px), and an anchor point+normal for rendering the accumulation pool.
function dikeBandsForPath(path, totalLen) {
  if (!path || path.length < 2) return [];
  const ds = [];
  for (let k = 0; k < state.placedItems.length; k++) {
    const item = state.placedItems[k];
    if (item.dead || item.hp <= 0) continue;
    const def = TOOL_DEFS[item.type];
    if (!def || !def.cutsFlow) continue;
    const near = nearestOnPath(path, totalLen, item.x, item.y);
    if (near.dist > (def.cutReach || def.radius)) continue;
    const lat = (item.x - near.x) * near.nx + (item.y - near.y) * near.ny;
    ds.push({ t: near.t, lat });
  }
  if (!ds.length) return [];
  ds.sort((a, b) => a.t - b.t);
  const groups = [[ds[0]]];
  for (let k = 1; k < ds.length; k++) {
    const g = groups[groups.length - 1];
    if (ds[k].t - g[g.length - 1].t <= DIKE_BAND_T) g.push(ds[k]);
    else groups.push([ds[k]]);
  }
  return groups.map(g => {
    const cov = coverageOfLats(g.map(d => d.lat));
    const avgT = g.reduce((s, d) => s + d.t, 0) / g.length;
    const anchor = pointAtProgress(path, Math.min(0.999, avgT), totalLen);
    return {
      t: g[0].t, avgT,
      coverage: cov.coverage, gapCenter: cov.gapCenter, gapW: cov.gapW,
      x: anchor.x, y: anchor.y,
      nx: -Math.sin(anchor.angle), ny: Math.cos(anchor.angle),
      count: g.length
    };
  });
}

// Back-compat wrapper (also used by tests): smallest along-channel progress
// at which a FULLY-covering dike line stands (1 = flow uncapped).
function flowCutCap(path, totalLen) {
  let cap = 1;
  const bands = dikeBandsForPath(path, totalLen);
  for (const b of bands) if (b.coverage >= DIKE_CAP_COVERAGE) cap = Math.min(cap, b.t);
  return cap;
}

// What coverage a dike dropped at (x,y) would produce, combined with any
// dikes already forming a line there — drives the placement preview.
function dikeCoverageIfPlaced(x, y) {
  const reach = (TOOL_DEFS.dam.cutReach || TOOL_DEFS.dam.radius);
  const info = nearestFlowInfo(x, y);
  if (!info || info.dist > reach) return null;
  let path, totalLen;
  if (info.isBranch) { const br = branchPaths[info.idx]; path = br.basePath || br.path; totalLen = pathLength(path); }
  else { path = basePaths[info.idx]; totalLen = BASE_LENS[info.idx] || pathLength(path); }
  const near = nearestOnPath(path, totalLen, x, y);
  const lats = [(x - near.x) * near.nx + (y - near.y) * near.ny];
  for (let k = 0; k < state.placedItems.length; k++) {
    const it = state.placedItems[k];
    if (it.dead || it.hp <= 0) continue;
    const d = TOOL_DEFS[it.type];
    if (!d || !d.cutsFlow) continue;
    const nn = nearestOnPath(path, totalLen, it.x, it.y);
    if (nn.dist <= reach && Math.abs(nn.t - near.t) <= DIKE_BAND_T) {
      lats.push((it.x - nn.x) * nn.nx + (it.y - nn.y) * nn.ny);
    }
  }
  return coverageOfLats(lats);
}

// Unit normal (left-hand perpendicular) of a path at index i.
function pathNormalAt(path, i) {
  const prev = path[Math.max(0, i - 1)];
  const next = path[Math.min(path.length - 1, i + 1)];
  let tx = next.x - prev.x, ty = next.y - prev.y;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len; ty /= len;
  return { nx: -ty, ny: tx };
}

// Nearest point across every pristine channel AND branch to (x, y), with
// that spot's normal and the signed side the queried point sits on.
// Used at placement time to lock in a tool's diversion direction, and by
// the drag preview to show the player which way the mud will go.
function nearestFlowInfo(x, y) {
  let best = null;
  const consider = (path, isBranch, idx) => {
    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const d = Math.hypot(p.x - x, p.y - y);
      if (!best || d < best.dist) {
        const n = pathNormalAt(path, i);
        best = { dist: d, x: p.x, y: p.y, nx: n.nx, ny: n.ny, isBranch, idx, i };
      }
    }
  };
  basePaths.forEach((p, i) => consider(p, false, i));
  branchPaths.forEach((br, i) => consider(br.basePath || br.path, true, i));
  if (!best) return null;
  // Signed lateral offset of the QUERIED point relative to the channel.
  // The channel gets pushed the opposite way (away from the tool).
  const s = (x - best.x) * best.nx + (y - best.y) * best.ny;
  best.toolSide = s >= 0 ? 1 : -1;   // which side the tool sits on
  best.divertSide = -best.toolSide;  // which way the mud will be pushed
  return best;
}

// Every alive tool that currently bends the flow, with its bend scaled by
// remaining hp (an eroding shovel loses its grip; a breached dike stops
// deflecting entirely once it dies).
function collectDeflectors() {
  const out = [];
  state.placedItems.forEach(item => {
    if (item.dead) return;
    const def = TOOL_DEFS[item.type];
    if (!def || !def.deflectStrength) return;
    const hpFrac = item.hp === Infinity ? 1 : Math.max(0, Math.min(1, item.hp / 100));
    if (hpFrac <= 0.02) return;
    out.push({
      item,
      x: item.x, y: item.y,
      range: def.deflectRange,
      // Keeps 40% of its push even when nearly worn out, then vanishes.
      strength: def.deflectStrength * (0.4 + 0.6 * hpFrac),
      side: item.divertSide || 1
    });
  });
  return out;
}

// Partially-covering dikes push the flow toward their open gap. Computed
// from the pristine base paths (dikes never move), so this can safely feed
// the geometry rebuild without depending on the bent result.
// Benders for ONE specific path only. Path-local on purpose: a dike steers
// the channel it sits on toward its open gap, and must NOT bend neighbouring
// channels or branches that merely pass nearby (that cross-talk used to bend a
// centered dike off its own channel and break the cut).
function collectDikeBenders(path, totalLen) {
  const out = [];
  const reachMul = 1.5, dikeReach = (TOOL_DEFS.dam.cutReach || 52);
  const bands = dikeBandsForPath(path, totalLen);
  for (const b of bands) {
    if (b.coverage >= DIKE_CAP_COVERAGE) continue;  // full cut: nothing to steer
    if (Math.abs(b.gapCenter) < 2) continue;        // symmetric gap: no clear side
    out.push({ absolute: true, x: b.x, y: b.y, range: dikeReach * reachMul,
               target: b.gapCenter * Math.min(1, b.coverage * 1.4) });
  }
  return out;
}

// Bends one pristine path around the given deflectors and returns a NEW
// point array. `anchorStart` keeps the first few points pinned (a main
// channel must still come out of the crater); branches are free at both
// ends so their mouth can genuinely be walked off a house.
function deflectPath(base, deflectors, anchorStart) {
  const n = base.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = base[i];
    const { nx, ny } = pathNormalAt(base, i);
    let off = 0;
    for (let d = 0; d < deflectors.length; d++) {
      const dfl = deflectors[d];
      const dx = p.x - dfl.x, dy = p.y - dfl.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= dfl.range) continue;
      // Smooth cosine falloff: full push at the tool, nothing at the rim.
      const w = 0.5 + 0.5 * Math.cos(Math.PI * (dist / dfl.range));
      // Which side of the channel is this point on relative to the tool?
      // Push it further that way (i.e. away from the tool). Right on the
      // centreline the sign is meaningless, so fall back to the side
      // locked in when the tool was planted.
      if (dfl.absolute) {
        // Dike bender: steer the centreline toward the open gap (absolute
        // lateral target) so the mud routes around the dike's covered side.
        off += dfl.target * w;
      } else {
        const lateral = dx * nx + dy * ny;
        const sign = Math.abs(lateral) < 3 ? dfl.side : Math.sign(lateral);
        off += sign * dfl.strength * w;
      }
    }
    off = Math.max(-MAX_DEFLECT_PX, Math.min(MAX_DEFLECT_PX, off));
    // Ease the bend in near the source so the channel still leaves the crater.
    if (anchorStart) off *= Math.min(1, i / 3);
    out[i] = { x: p.x + nx * off, y: p.y + ny * off };
  }
  // Two light smoothing passes remove any corner the push introduced, so
  // the mud curves around the tool instead of turning a hard angle.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < n - 1; i++) {
      out[i].x = out[i].x * 0.5 + (out[i - 1].x + out[i + 1].x) * 0.25;
      out[i].y = out[i].y * 0.5 + (out[i - 1].y + out[i + 1].y) * 0.25;
    }
  }
  return sanitizeLaharPath(out);
}

// Rebuilds every live path from its pristine base + the current
// deflectors, refreshes the cached lengths, works out how far each
// branch mouth has been walked off its target, and flags which tools are
// currently in contact with mud (used purely for the on-canvas effect
// glow). Cheap enough to run on placement and then at ~4Hz.
let flowGeomSettling = false; // a bend is still easing toward its target shape

function rebuildFlowGeometry() {
  // Shovel cuts bend whatever channel they're near (global). Dike benders are
  // path-local so a dike only steers its own channel toward its gap.
  const shovels = collectDeflectors();

  // Bends are EASED in rather than applied at once: each rebuild (~4x/s)
  // moves the live path 45% of the way to its target shape, so a channel
  // curves over to its new course in about half a second instead of
  // snapping sideways the instant a tool is planted or wears out.
  const EASE = 0.45;
  flowGeomSettling = false;
  const easeToward = (current, target) => {
    if (!current || current.length !== target.length) return target;
    for (let k = 0; k < target.length; k++) {
      const c = current[k], t = target[k];
      const dx = t.x - c.x, dy = t.y - c.y;
      if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) flowGeomSettling = true;
      c.x += dx * EASE; c.y += dy * EASE;
    }
    return current;
  };
  // Progress is stored as a FRACTION of the path length. When the path is
  // re-shaped its length changes, and keeping the same fraction would slide
  // the front along the channel — backwards if the path got shorter (e.g. a
  // shovel cut silting up and the bend relaxing). Preserving the absolute
  // distance travelled instead keeps the front where it was.
  const keepDistance = (prog, oldLen, newLen) =>
    (prog > 0 && oldLen > 0 && newLen > 0) ? Math.min(1, prog * oldLen / newLen) : prog;

  channelPaths.length = basePaths.length;
  CHANNEL_LENS.length = basePaths.length;
  for (let i = 0; i < basePaths.length; i++) {
    const defl = shovels.concat(collectDikeBenders(basePaths[i], BASE_LENS[i] || pathLength(basePaths[i])));
    const target = defl.length
      ? deflectPath(basePaths[i], defl, true)
      : basePaths[i].map(p => ({ x: p.x, y: p.y }));
    const oldLen = CHANNEL_LENS[i];
    channelPaths[i] = sanitizeLaharPath(easeToward(channelPaths[i], target));
    CHANNEL_LENS[i] = pathLength(channelPaths[i]);
    if (state.laharProgresses && state.laharProgresses[i] !== undefined) {
      state.laharProgresses[i] = keepDistance(state.laharProgresses[i], oldLen, CHANNEL_LENS[i]);
    }
  }

  for (let b = 0; b < branchPaths.length; b++) {
    const br = branchPaths[b];
    if (!br.basePath) br.basePath = br.path.map(p => ({ x: p.x, y: p.y }));
    const bl = pathLength(br.basePath);
    const defl = shovels.concat(collectDikeBenders(br.basePath, bl));
    const target = defl.length
      ? deflectPath(br.basePath, defl, false)
      : br.basePath.map(p => ({ x: p.x, y: p.y }));
    const oldLen = br.len;
    br.path = sanitizeLaharPath(easeToward(br.path, target));
    br.len = pathLength(br.path);
    if (state.branchProgresses && state.branchProgresses[b] !== undefined) {
      state.branchProgresses[b] = keepDistance(state.branchProgresses[b], oldLen, br.len);
    }
    const mouth = br.path[br.path.length - 1];
    br.endOffset = Math.hypot(mouth.x - br.target.x, mouth.y - br.target.y);
  }

  // ---- "Is mud running past me right now?" flag, for the effect glow ----
  state.placedItems.forEach(item => {
    if (item.dead) { item.engaged = false; return; }
    const def = TOOL_DEFS[item.type];
    const reach = Math.max(def.radius, def.deflectRange || 0, def.shieldRadius || 0);
    let engaged = false;
    for (let i = 0; i < channelPaths.length && !engaged; i++) {
      const prog = state.laharProgresses[i] || 0;
      if (prog <= 0.01) continue;
      if (distToTraveledPath(channelPaths[i], prog * CHANNEL_LENS[i], item.x, item.y) < reach) engaged = true;
    }
    for (let i = 0; i < branchPaths.length && !engaged; i++) {
      const prog = (state.branchProgresses && state.branchProgresses[i]) || 0;
      if (prog <= 0.01) continue;
      if (distToTraveledPath(branchPaths[i].path, prog * branchPaths[i].len, item.x, item.y) < reach) engaged = true;
    }
    item.engaged = engaged;
  });

  flowGeomDirty = false;
  flowGeomTimer = 0;
}

// True if anything on the map is currently bending the flow — lets
// simulate() skip the periodic rebuild entirely when no diversion tool
// is in play.
function hasActiveDeflectors() {
  return state.placedItems.some(it => !it.dead && TOOL_DEFS[it.type] && (TOOL_DEFS[it.type].deflectStrength || TOOL_DEFS[it.type].cutsFlow) && (it.hp === Infinity || it.hp > 2));
}

/* ---------------- BARRIER SHIELDING ----------------
   Sandbags, dikes and trees don't only fight the flow where its leading
   edge happens to be — they also stand between the mud and whatever is
   behind them. Any structure inside a barrier's shieldRadius has part of
   its incoming lahar contact damage soaked by that barrier.

   Deliberate limits so this can't be farmed:
     * contributions combine multiplicatively and are capped at MAX_SHIELD
       (75%) — stacking sandbags gives sharply diminishing returns and can
       never reach immunity;
     * a barrier's contribution scales with its REMAINING hp and with how
       close it was planted;
     * soaking mud costs the barrier hp, so protection is consumable —
       the player has to keep paying for it. */
function applyBarrierShield(x, y, dmg, dt) {
  if (dmg <= 0) return dmg;
  let remaining = 1;
  const contributors = [];
  for (let i = 0; i < state.placedItems.length; i++) {
    const item = state.placedItems[i];
    if (item.dead || item.hp <= 0) continue;
    const def = TOOL_DEFS[item.type];
    if (!def || !def.shield) continue;
    const r = def.shieldRadius || def.radius;
    const dist = Math.hypot(item.x - x, item.y - y);
    if (dist >= r) continue;
    const hpFrac = item.hp === Infinity ? 1 : Math.max(0, item.hp / 100);
    const closeness = 1 - dist / r;
    // A young tree shields little; it protects more as its canopy fills in.
    const growFrac = item.type === 'tree' ? treeGrow(item) : 1;
    const p = def.shield * hpFrac * growFrac * (0.45 + 0.55 * closeness);
    remaining *= (1 - p);
    contributors.push({ item, p });
  }
  const shield = Math.min(MAX_SHIELD, 1 - remaining);
  if (shield <= 0.001) return dmg;

  // Soaked mud batters the barrier itself, and lights up its effect ring.
  // The damage the barriers collectively kept off this structure is
  // dmg * shield; each contributor is credited its share of that, which
  // is what the floating "+N" and the end-of-round report display.
  const prevented = dmg * shield;
  const pSum = contributors.reduce((t, c) => t + c.p, 0) || 1;
  contributors.forEach(c => {
    c.item.fxT = 0.35;
    if (c.item.hp !== Infinity) c.item.hp -= dmg * c.p * 3.2;
    creditToolSave(c.item, prevented * (c.p / pSum), x, y);
  });
  return dmg * (1 - shield);
}

let pathSpeedMultipliers = [1.15, 0.85, 1.35];
const DECORATIVE_PLANTS = [];

/* =====================================================================
   MOUNTAIN & SKY SCENE RENDERING
   ---------------------------------------------------------------------
   Everything below draws the volcano, sky, atmosphere and clouds only.
   No gameplay state, collision, budget, or simulation logic lives here —
   this module only ever READS from `state` (e.g. state.time,
   state.skyTransition) to animate lighting/weather/clouds.

   Performance strategy: the volcano geometry (ridges, rock shading,
   crater walls, sparse vegetation) is expensive to paint (gradients,
   many small shapes) but never changes shape, so it is rendered ONCE
   into two offscreen canvases — a "day" and a "night" lighting state —
   and every frame simply cross-fades between them with two drawImage
   calls. Clouds are a single cached soft sprite, stamped a handful of
   times with cheap position math. This keeps the whole scene at a
   near-fixed per-frame cost, well within budget for a 60fps kiosk.
   ===================================================================== */

// Seeded pseudo-random generator (deterministic — same volcano every run)
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Turns a sparse list of anchor points into a smooth, naturally undulating
// ridgeline using quadratic curves through midpoints (Catmull-Rom-ish).
// Kept for elements that SHOULD read as smooth (e.g. water, soft rim glow) —
// no longer used for the mountain silhouette itself (see traceJaggedRidge).
function traceSmoothRidge(context, points, closeToY) {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    context.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }
  const last = points[points.length - 1];
  context.lineTo(last.x, last.y);
  if (closeToY !== undefined) {
    context.lineTo(last.x, closeToY);
    context.lineTo(points[0].x, closeToY);
    context.closePath();
  }
}

// Turns the same sparse anchor points into a RUGGED, broken silhouette.
// Anchors still define the large-scale shape (so the massif's overall
// profile stays intentional), but every segment between anchors is walked
// with straight lineTo() steps and a seeded random jitter — never a smooth
// curve — so the outline reads as fractured volcanic rock rather than a
// rolling hill. `seed` is fixed per call site so day/night paint passes
// (and the matching edge-light stroke) always trace the identical outline.
function traceJaggedRidge(context, points, closeToY, seed, ruggedness) {
  const rand = mulberry32(seed);
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const segCount = 3; // jagged sub-steps per anchor-to-anchor span
    for (let s = 1; s <= segCount; s++) {
      const t = s / segCount;
      let x = a.x + (b.x - a.x) * t;
      let y = a.y + (b.y - a.y) * t;
      if (s < segCount) {
        // Interior points get jittered; the shared anchor point (t===1,
        // i.e. `b` itself) is left untouched so consecutive spans still
        // connect exactly — no visible seams between anchors.
        x += (rand() - 0.5) * ruggedness;
        y += (rand() - 0.5) * ruggedness * 0.65;
        if (rand() < 0.18) y -= ruggedness * (0.5 + rand()); // occasional sharp cliff step
      }
      context.lineTo(x, y);
    }
  }
  if (closeToY !== undefined) {
    const last = points[points.length - 1];
    context.lineTo(last.x, closeToY);
    context.lineTo(points[0].x, closeToY);
    context.closePath();
  }
}

// Fixed seeds so the clipped fill, the shading passes, and the final
// edge-light stroke all trace the exact same jagged outline.
const BACK_RIDGE_SEED = 4411, MID_RIDGE_SEED = 6633, FRONT_RIDGE_SEED = 9911;

/* ---- Cloud sprites: two soft multi-blob puffs (different silhouettes),
   cached once and reused/stamped many times — cheap per-frame cost ---- */
let cloudSpriteA = null, cloudSpriteB = null;
let cloudSprite = null; // kept for backward-compat reference (== cloudSpriteA)

function paintCloudBlob(targetCanvas, seed, blobCount) {
  const w = targetCanvas.width, h = targetCanvas.height;
  const cctx = targetCanvas.getContext('2d');
  const rand = mulberry32(seed);
  for (let i = 0; i < blobCount; i++) {
    const bx = w * (0.18 + rand() * 0.64);
    const by = h * (0.38 + rand() * 0.32);
    const br = w * (0.14 + rand() * 0.15);
    const g = cctx.createRadialGradient(bx, by, 0, bx, by, br);
    g.addColorStop(0, 'rgba(255,255,255,0.92)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = g;
    cctx.beginPath(); cctx.ellipse(bx, by, br, br * 0.62, 0, 0, Math.PI * 2); cctx.fill();
  }
}

function buildCloudSprite() {
  cloudSpriteA = document.createElement('canvas');
  cloudSpriteA.width = 260; cloudSpriteA.height = 145;
  paintCloudBlob(cloudSpriteA, 4242, 6);

  cloudSpriteB = document.createElement('canvas');
  cloudSpriteB.width = 210; cloudSpriteB.height = 120;
  paintCloudBlob(cloudSpriteB, 7788, 5);

  cloudSprite = cloudSpriteA;
}

// Fixed cloud layout (varied depth/speed/size for gentle multi-layer parallax).
// Layers with larger `speed` feel closer (drift faster) — classic parallax cue.
const CLOUD_LAYER = [
  { x: 20,  y: 78,  scale: 1.05, speed: 2.0,  alpha: 0.5,  sprite: 'A' },
  { x: 250, y: 50,  scale: 0.7,  speed: 1.3,  alpha: 0.38, sprite: 'B' },
  { x: 420, y: 115, scale: 0.9,  speed: 2.6,  alpha: 0.42, sprite: 'A' },
  { x: 140, y: 160, scale: 0.55, speed: 1.7,  alpha: 0.3,  sprite: 'B' },
  { x: 340, y: 200, scale: 0.4,  speed: 3.1,  alpha: 0.26, sprite: 'A' },
  { x: 60,  y: 235, scale: 0.65, speed: 1.0,  alpha: 0.22, sprite: 'B' }
];

// updateClouds() — stateless, like updateSmoke()/updateAsh(): cloud position
// is derived purely from ambientTime inside drawClouds(), so there is no
// per-frame array to mutate. Present for symmetry/readability at the call site.
function updateClouds(dt) { /* stateless — position derived from ambientTime */ }

function drawClouds(context, dayFactor) {
  if (!cloudSpriteA) return;
  context.save();
  CLOUD_LAYER.forEach(c => {
    const sprite = c.sprite === 'B' ? cloudSpriteB : cloudSpriteA;
    const cw = sprite.width * c.scale, ch = sprite.height * c.scale;
    // Continuous wrap-around drift driven by the ambient clock (never
    // static, never resets abruptly — smoothly re-enters from the left).
    const drift = (ambientTime * c.speed * 4) % (W + cw);
    const x = ((c.x + drift) % (W + cw)) - cw * 0.5;
    context.globalAlpha = c.alpha * (0.55 + 0.45 * dayFactor);
    context.drawImage(sprite, x, c.y, cw, ch);
  });
  context.restore();
}

// Precomputed sparse rock/ash speckle field (subtle shading, not per-pixel noise)
function buildSpeckles(rand, minX, maxX, topY, baseY, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push({
      x: minX + rand() * (maxX - minX),
      y: topY + rand() * (baseY - topY),
      size: 1 + rand() * 2.2,
      alpha: 0.04 + rand() * 0.08
    });
  }
  return out;
}

// Crater outlet — matches the lahar channel origin in generateRandomPaths()
// so the mudflow visually emerges straight out of the breached crater wall.
const CRATER_X = 292, CRATER_Y = 180;

// Tool-placement boundary: the main Pinatubo massif silhouette (see
// frontAnchors in paintMountainScene) never dips below y=345 at its
// lowest edges, and the sky above it obviously isn't placeable either.
// A small margin below that (360) is used as the "you're now on solid
// ground" line — anywhere at or below this y is grass/town, anywhere
// above it is volcano or open sky, regardless of x.
const GRASS_MIN_Y = 360;

/* =====================================================================
   VOLCANIC SMOKE & ASH — quiet, continuous crater degassing
   ---------------------------------------------------------------------
   Design goals: always drifting, never explosive, cheap every frame.

   Instead of a mutable particle pool that needs per-frame spawn/despawn
   bookkeeping (extra allocations, GC pressure — bad on a kiosk box), each
   puff/speck is a small set of fixed parameters chosen once at startup by
   a seeded RNG. Its position on any given frame is a pure function of
   `ambientTime`, using `life = (ambientTime * speed + offset) % 1` as a
   repeating 0→1 cycle. This gives perfectly smooth, endlessly looping
   motion with zero array mutation — just math — and staggered `offset`
   values keep the puffs from ever appearing to spawn/pop in sync.
   ===================================================================== */

// One soft round gray-white blob, cached once and stamped (scaled + faded)
// for every smoke puff — mirrors the cloud sprite strategy above.
let smokeSprite = null;
function buildSmokeSprite() {
  const w = 180, h = 180;
  smokeSprite = document.createElement('canvas');
  smokeSprite.width = w; smokeSprite.height = h;
  const sctx = smokeSprite.getContext('2d');
  
  // Multi-stop volumetric smoke puff
  const g = sctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(230, 225, 218, 0.90)');
  g.addColorStop(0.35, 'rgba(205, 198, 190, 0.65)');
  g.addColorStop(0.65, 'rgba(180, 174, 166, 0.28)');
  g.addColorStop(1, 'rgba(180, 174, 166, 0)');
  sctx.fillStyle = g;
  sctx.beginPath();
  sctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
  sctx.fill();
}

// Fixed per-puff parameters (seeded — same gentle plume every run).
const SMOKE_PUFFS = (function buildSmokePuffParams() {
  const rand = mulberry32(9001);
  const count = 13;
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      offset: i / count,
      speed: 0.032 + rand() * 0.022,
      driftX: (rand() - 0.5) * 64 + 20,
      swayAmp: 8 + rand() * 10,
      swayFreq: 0.75 + rand() * 1.1,
      swayPhase: rand() * Math.PI * 2,
      startScale: 0.24 + rand() * 0.14,
      endScale: 1.1 + rand() * 0.6,
      riseHeight: 140 + rand() * 95,
      xJitter: (rand() - 0.5) * 14
    });
  }
  return arr;
})();

// Tiny embers/ash flecks that hover very close to the crater mouth
const ASH_PARTICLES = (function buildAshParams() {
  const rand = mulberry32(5150);
  const count = 18;
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      offset: i / count,
      speed: 0.08 + rand() * 0.1,
      driftX: (rand() - 0.5) * 28,
      swayAmp: 4 + rand() * 5,
      swayFreq: 1.2 + rand() * 1.5,
      riseHeight: 30 + rand() * 38,
      xJitter: (rand() - 0.5) * 32,
      radius: 0.8 + rand() * 1.4,
      isEmber: rand() < 0.35
    });
  }
  return arr;
})();

function updateSmoke(dt) { /* stateless — see SMOKE_PUFFS docblock */ }

function drawSmoke(context, dayFactor) {
  if (!smokeSprite) return;
  context.save();
  SMOKE_PUFFS.forEach(p => {
    const life = ((ambientTime * p.speed) + p.offset) % 1;
    const y = CRATER_Y - 8 - life * p.riseHeight;
    const sway = Math.sin(life * Math.PI * 2 * p.swayFreq + p.swayPhase) * p.swayAmp * life;
    const wind = p.driftX * life;
    const x = CRATER_X + p.xJitter + sway + wind;
    const scale = p.startScale + (p.endScale - p.startScale) * life;
    let alpha = Math.min(1, life * 5) * Math.min(1, (1 - life) * 2.2);
    alpha *= 0.55;
    if (alpha <= 0.01) return;
    const size = smokeSprite.width * scale;
    context.globalAlpha = alpha * (0.75 + 0.25 * dayFactor);
    context.drawImage(smokeSprite, x - size / 2, y - size / 2, size, size);
  });
  context.restore();
}

function updateAsh(dt) { /* stateless — see ASH_PARTICLES docblock */ }

function drawAshParticles(context) {
  context.save();
  ASH_PARTICLES.forEach(p => {
    const life = ((ambientTime * p.speed) + p.offset) % 1;
    const y = CRATER_Y - 4 - life * p.riseHeight;
    const x = CRATER_X + p.xJitter + p.driftX * life + Math.sin(life * Math.PI * 2 * p.swayFreq) * p.swayAmp * life;
    const alpha = Math.min(1, life * 5) * Math.min(1, (1 - life) * 3);
    if (alpha <= 0.01) return;
    context.globalAlpha = alpha * 0.7;
    if (p.isEmber) {
      context.fillStyle = life < 0.4 ? '#f59e0b' : '#ef4444';
      context.shadowColor = '#f59e0b';
      context.shadowBlur = 4;
    } else {
      context.fillStyle = life < 0.35 ? '#3f3a35' : '#a8a29e';
      context.shadowBlur = 0;
    }
    context.beginPath();
    context.arc(x, y, p.radius, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

/* ================================================================
   ATMOSPHERE & DEPTH  (art-direction pass)
   ----------------------------------------------------------------
   The scene already has many well-drawn objects; these passes pull
   them into ONE cohesive world. Signature look: a community living
   under the volcano's haze — layered ridgelines receding into
   aerial haze, a tropical lowland treeline, and a soft vignette
   that frames the hand-drawn 2D art without hiding gameplay.
   ================================================================ */

// Distant volcanic ranges behind Pinatubo. Further ridges are lower and
// bluer (aerial perspective), which reads as real depth on the horizon.
// Drawn before the main mountain image, so the peak overdraws their centre.
function drawDistantRanges(context, dayFactor) {
  const horizon = 372;
  const ridges = [
    { baseY: horizon - 8, amp: 40, step: 168, seed: 1.7, col: '#93accb', alpha: 0.26 },
    { baseY: horizon - 3, amp: 26, step: 118, seed: 4.2, col: '#7f96b6', alpha: 0.36 }
  ];
  context.save();
  for (const r of ridges) {
    context.globalAlpha = r.alpha * (0.45 + 0.55 * dayFactor);
    context.fillStyle = lerpColor(r.col, '#1e2c3a', state.skyTransition);
    context.beginPath();
    context.moveTo(0, horizon + 30);
    context.lineTo(0, r.baseY);
    for (let x = 0; x <= W; x += 10) {
      const y = r.baseY
        - Math.abs(Math.sin(x / r.step + r.seed)) * r.amp
        - Math.sin(x / (r.step * 0.36) + r.seed * 2.1) * (r.amp * 0.2);
      context.lineTo(x, y);
    }
    context.lineTo(W, horizon + 30);
    context.closePath();
    context.fill();
  }
  context.restore();
}

// A hazy line of coconut palms along the far edges of the lowland fields —
// a distinctly Philippine-lowland cue. Kept low-contrast (reads as distant)
// and only along the left/right margins so it never crowds the central
// volcano–river axis or the buildings. Fronds sway gently.
function drawHorizonPalms(context) {
  const baseY = 366;
  const trunk = lerpColor('#556848', '#26302a', state.skyTransition);
  const frond = lerpColor('#3f6e46', '#1f3327', state.skyTransition);
  const spots = [26, 58, 92, 448, 482, 514]; // margins only
  context.save();
  context.globalAlpha = 0.5;
  context.lineCap = 'round';
  spots.forEach((x, i) => {
    const h = 20 + (i % 3) * 7;
    const sway = Math.sin(state.time * 0.6 + i * 1.3) * 1.6;
    const tx = x + sway * 1.4, ty = baseY - h;
    context.strokeStyle = trunk; context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x, baseY);
    context.quadraticCurveTo(x + sway, baseY - h * 0.6, tx, ty);
    context.stroke();
    context.strokeStyle = frond; context.lineWidth = 2;
    for (let f = 0; f < 5; f++) {
      const a = -Math.PI / 2 + (f - 2) * 0.52;
      context.beginPath();
      context.moveTo(tx, ty);
      context.quadraticCurveTo(
        tx + Math.cos(a) * 7, ty + Math.sin(a) * 7 - 2,
        tx + Math.cos(a) * 14, ty + Math.sin(a) * 14 + 3);
      context.stroke();
    }
  });
  context.restore();
}

// Aerial-perspective haze band sitting on the mountain-base / field seam.
// Softly lifts the midground off the background so the layers separate.
function drawDepthHaze(context) {
  const df = 1 - state.skyTransition;
  const g = context.createLinearGradient(0, 300, 0, 402);
  g.addColorStop(0,   'rgba(205,223,238,0)');
  g.addColorStop(0.5, `rgba(201,219,235,${0.14 + 0.07 * df})`);
  g.addColorStop(1,   'rgba(201,219,235,0)');
  context.fillStyle = g;
  context.fillRect(0, 300, W, 102);
}

// Unifying vignette: gently darkens the corners to frame the play area and
// tie the many hand-drawn pieces into one cinematic 2D image. Very subtle,
// and drawn under the HUD so nothing readable is dimmed.
function drawSceneVignette(context) {
  const g = context.createRadialGradient(W / 2, H * 0.5, H * 0.30, W / 2, H * 0.5, H * 0.72);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, 'rgba(6,10,18,0.06)');
  g.addColorStop(1, 'rgba(5,9,16,0.30)');
  context.fillStyle = g;
  context.fillRect(0, 0, W, H);
}

function drawVolcanicRockPatches(context, isNight, seed) {
  const rand = mulberry32(seed);
  const count = 28;
  for (let i = 0; i < count; i++) {
    const px = 20 + rand() * 500;
    const upperBias = rand() * rand();
    const py = 165 + upperBias * 270;
    const radius = 12 + rand() * 26;
    const dark = rand() < 0.52;
    context.fillStyle = isNight
      ? (dark ? 'rgba(5,7,11,0.38)' : 'rgba(58,66,80,0.22)')
      : (dark ? 'rgba(24,20,16,0.35)' : 'rgba(92,86,78,0.25)');
    const sides = 6 + Math.floor(rand() * 3);
    context.beginPath();
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      const r = radius * (0.65 + rand() * 0.6);
      const x = px + Math.cos(angle) * r;
      const y = py + Math.sin(angle) * r * 0.7;
      if (s === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
  }
}

/* ---- Paints the full volcano scene once into an offscreen canvas ---- */
function paintMountainScene(context, mode) {
  const isNight = mode === 'night';
  context.clearRect(0, 0, W, H);

  /* ---- 1. Distant Hazy Back Range (Zambales Mountains) ---- */
  const backAnchors = [
    { x: -15, y: 270 }, { x: 55, y: 200 }, { x: 120, y: 235 }, { x: 175, y: 185 },
    { x: 235, y: 160 }, { x: 300, y: 145 }, { x: 355, y: 170 }, { x: 410, y: 195 },
    { x: 465, y: 220 }, { x: 555, y: 270 }
  ];
  context.save();
  traceJaggedRidge(context, backAnchors, 430, BACK_RIDGE_SEED, 6);
  const backGrad = context.createLinearGradient(0, 135, 0, 430);
  if (isNight) {
    backGrad.addColorStop(0, '#1c2432');
    backGrad.addColorStop(1, '#101622');
  } else {
    backGrad.addColorStop(0, '#a5b5c2');
    backGrad.addColorStop(1, '#81909c');
  }
  context.fillStyle = backGrad;
  context.globalAlpha = isNight ? 1 : 0.92;
  context.fill();

  const hazeGrad = context.createLinearGradient(0, 135, 0, 430);
  hazeGrad.addColorStop(0, isNight ? 'rgba(180,200,230,0.14)' : 'rgba(240,246,252,0.48)');
  hazeGrad.addColorStop(1, 'rgba(240,246,252,0)');
  context.fillStyle = hazeGrad;
  context.globalAlpha = 1;
  context.fill();
  context.restore();

  /* ---- 2. Mid-Ground Ridge Layer ---- */
  const midAnchors = [
    { x: -15, y: 305 }, { x: 60, y: 255 }, { x: 130, y: 280 }, { x: 190, y: 230 },
    { x: 250, y: 205 }, { x: 310, y: 190 }, { x: 370, y: 215 }, { x: 430, y: 240 },
    { x: 490, y: 265 }, { x: 555, y: 305 }
  ];
  context.save();
  traceJaggedRidge(context, midAnchors, 470, MID_RIDGE_SEED, 10);
  const midGrad = context.createLinearGradient(0, 165, 0, 470);
  if (isNight) {
    midGrad.addColorStop(0, '#242e3d');
    midGrad.addColorStop(1, '#151b26');
  } else {
    midGrad.addColorStop(0, '#8e9da8');
    midGrad.addColorStop(1, '#6e7b85');
  }
  context.fillStyle = midGrad;
  context.globalAlpha = isNight ? 1 : 0.94;
  context.fill();

  const midHaze = context.createLinearGradient(0, 165, 0, 470);
  midHaze.addColorStop(0, isNight ? 'rgba(165,190,220,0.09)' : 'rgba(235,244,250,0.32)');
  midHaze.addColorStop(1, 'rgba(235,244,250,0)');
  context.fillStyle = midHaze;
  context.globalAlpha = 1;
  context.fill();
  context.restore();

  /* ---- 3. Main Mount Pinatubo Massif ----
     Modelled on the mountain as it actually looks after June 1991: the old
     summit was blown off, leaving a broad ~2.5 km caldera, so the top reads
     as a WIDE, TRUNCATED bowl (not a pointed cone) holding the turquoise
     crater lake. The flanks are pale grey pumice/ash rather than brown
     rock, deeply carved by radial gullies and fine "badland" rills, with
     tropical regrowth creeping back up the lower slopes and pale, flat
     pyroclastic-deposit fans spreading out at the foot of each channel. ---- */
  const RIM_Y = CRATER_Y - 16;   // height of the far (back) caldera rim
  const frontAnchors = [
    { x: -15, y: 350 }, { x: 40, y: 302 }, { x: 86, y: 264 }, { x: 126, y: 270 },
    { x: 164, y: 236 }, { x: 198, y: 212 }, { x: 224, y: 190 },
    { x: 243, y: 172 }, { x: 258, y: RIM_Y + 2 }, { x: 274, y: RIM_Y - 3 },
    { x: CRATER_X, y: RIM_Y + 1 }, { x: 310, y: RIM_Y - 4 }, { x: 328, y: RIM_Y - 1 },
    { x: 346, y: 173 }, { x: 368, y: 190 }, { x: 400, y: 210 }, { x: 436, y: 234 },
    { x: 475, y: 266 }, { x: 555, y: 325 }
  ];

  context.save();
  traceJaggedRidge(context, frontAnchors, 510, FRONT_RIDGE_SEED, 14);
  context.clip();

  // Key lighting: sun from the upper-left. Pale pumice-grey palette —
  // fresh Pinatubo ash is near-white/buff, weathering to mid grey.
  const lightGrad = context.createLinearGradient(0, 130, 540, 430);
  if (isNight) {
    lightGrad.addColorStop(0, '#3a424d');
    lightGrad.addColorStop(0.3, '#2a313b');
    lightGrad.addColorStop(0.55, '#1c222b');
    lightGrad.addColorStop(0.8, '#12171e');
    lightGrad.addColorStop(1, '#0b0e13');
  } else {
    lightGrad.addColorStop(0, '#dcd6ca');
    lightGrad.addColorStop(0.25, '#bab2a5');
    lightGrad.addColorStop(0.5, '#928b7f');
    lightGrad.addColorStop(0.75, '#67615a');
    lightGrad.addColorStop(1, '#3c3833');
  }
  context.fillStyle = lightGrad;
  context.fillRect(0, 130, 540, 390);

  // Fresh ash/pumice cap: the summit area is the palest, bleached
  // near-white by the thick 1991 tephra blanket.
  const capGrad = context.createRadialGradient(CRATER_X, CRATER_Y + 20, 10, CRATER_X, CRATER_Y + 40, 170);
  capGrad.addColorStop(0, isNight ? 'rgba(200,210,225,0.16)' : 'rgba(242,238,228,0.55)');
  capGrad.addColorStop(0.55, isNight ? 'rgba(200,210,225,0.05)' : 'rgba(242,238,228,0.18)');
  capGrad.addColorStop(1, 'rgba(242,238,228,0)');
  context.fillStyle = capGrad;
  context.fillRect(0, 130, 540, 390);

  // Subtle weathered-rock patches (kept muted so the pumice reads pale)
  context.save();
  context.globalAlpha = 0.55;
  drawVolcanicRockPatches(context, isNight, 6060);
  context.restore();

  // Vertical atmospheric depth falloff
  const depthGrad = context.createLinearGradient(0, 145, 0, 510);
  depthGrad.addColorStop(0, isNight ? 'rgba(255,255,255,0.06)' : 'rgba(255,248,230,0.22)');
  depthGrad.addColorStop(0.45, 'rgba(0,0,0,0)');
  depthGrad.addColorStop(1, isNight ? 'rgba(0,0,0,0.38)' : 'rgba(38,26,16,0.26)');
  context.fillStyle = depthGrad;
  context.fillRect(0, 130, 540, 390);

  // Tropical regrowth: three decades on, cogon grass and scrub have crept
  // back up the lower flanks, leaving only the summit and channel floors bare.
  const regrowGrad = context.createLinearGradient(0, 270, 0, 510);
  if (isNight) {
    regrowGrad.addColorStop(0, 'rgba(18,34,26,0)');
    regrowGrad.addColorStop(0.45, 'rgba(18,34,26,0.35)');
    regrowGrad.addColorStop(1, 'rgba(12,26,20,0.6)');
  } else {
    regrowGrad.addColorStop(0, 'rgba(72,104,60,0)');
    regrowGrad.addColorStop(0.45, 'rgba(70,102,58,0.42)');
    regrowGrad.addColorStop(1, 'rgba(54,86,48,0.66)');
  }
  context.fillStyle = regrowGrad;
  context.fillRect(0, 270, 540, 250);

  // Uneven regrowth: patchy scrub clumps, denser lower down
  const veg = mulberry32(555);
  for (let i = 0; i < 64; i++) {
    const vx = 10 + veg() * 520;
    const vy = 300 + veg() * veg() * 200 + 10;
    const vs = 4 + veg() * 7;
    const a = 0.22 + veg() * 0.3;
    context.fillStyle = isNight ? `rgba(16,32,24,${a})` : `rgba(50,80,42,${a})`;
    context.beginPath();
    context.ellipse(vx, vy, vs, vs * 0.55, 0, 0, Math.PI * 2);
    context.fill();
  }

  // Soft ridge/valley striations on the upper flanks (large-scale relief),
  // fading out before the vegetated lower slopes so they never read as bars.
  const ridgeRand = mulberry32(7331);
  for (let i = 0; i < 22; i++) {
    const rx = 15 + ridgeRand() * 510;
    const topY = 154 + (0.08 + ridgeRand() * 0.12) * 270;
    const sway = (ridgeRand() - 0.5) * 28;
    const dark = ridgeRand() > 0.5;
    const sg = context.createLinearGradient(0, topY, 0, 360);
    sg.addColorStop(0, dark ? (isNight ? 'rgba(0,0,0,0.18)' : 'rgba(40,32,24,0.12)')
                            : (isNight ? 'rgba(255,255,255,0.05)' : 'rgba(255,250,236,0.14)'));
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    context.strokeStyle = sg;
    context.lineWidth = 3 + ridgeRand() * 5.5;
    context.beginPath();
    context.moveTo(rx, topY);
    context.quadraticCurveTo(rx + sway, (topY + 360) / 2, rx + sway * 1.6, 360);
    context.stroke();
  }

  // Deep radial erosion gullies — the signature of post-1991 Pinatubo.
  // Each fans out from the caldera rim and widens downslope. Drawn as a
  // single tapered polygon (pale ash floor) with a dark shadowed wall on
  // the right and a thin sunlit lip on the left (sun upper-left), plus a
  // few feeder rills near the head where the slope is most dissected.
  const gullyRand = mulberry32(4455);
  const gullyCount = 11;
  const gullyEnds = [];
  const offsetPoly = (pts, widthAt, sideSign) => {
    // Builds a closed polygon from the centreline out to sideSign*width.
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;
      const w = widthAt(i / (pts.length - 1));
      out.push({ x: pts[i].x + nx * w * sideSign, y: pts[i].y + ny * w * sideSign });
    }
    return out;
  };
  const fillBand = (pts, wL, wR, style) => {
    const left = offsetPoly(pts, wL, -1), right = offsetPoly(pts, wR, 1);
    context.beginPath();
    left.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y));
    for (let i = right.length - 1; i >= 0; i--) context.lineTo(right[i].x, right[i].y);
    context.closePath();
    context.fillStyle = style;
    context.fill();
  };
  for (let g = 0; g < gullyCount; g++) {
    const angle = (Math.PI * 0.06) + (g / (gullyCount - 1)) * (Math.PI * 0.88) + (gullyRand() - 0.5) * 0.16;
    const startR = 56 + gullyRand() * 14;
    const meander = gullyRand() * Math.PI * 2;
    const dx = Math.cos(angle);
    const dy = 0.6 + Math.max(0, Math.sin(angle)) * 0.45;
    const pts = [{
      x: CRATER_X + dx * startR,
      y: CRATER_Y + 14 + Math.sin(angle) * startR * 0.4
    }];
    const steps = 5 + Math.floor(gullyRand() * 3);
    for (let s = 0; s < steps; s++) {
      const prev = pts[pts.length - 1];
      // Gentle sinuous meander so the channels don't read as straight spokes
      const swing = Math.sin(meander + s * 1.4) * 9 + (gullyRand() - 0.5) * 10;
      pts.push({
        x: prev.x + dx * (12 + gullyRand() * 9) + swing,
        y: prev.y + dy * (13 + gullyRand() * 8) + 4
      });
    }
    gullyEnds.push(pts[pts.length - 1]);

    // Pale ash channel floor, tapering from a hairline at the rim
    fillBand(pts, t => 0.6 + t * 3.2, t => 0.6 + t * 3.2,
      isNight ? 'rgba(120,130,145,0.18)' : 'rgba(226,220,208,0.55)');
    // Shadowed right-hand wall
    fillBand(pts, t => -0.2, t => 1.2 + t * 4.2,
      isNight ? 'rgba(0,0,0,0.42)' : 'rgba(30,22,16,0.34)');
    // Sunlit left-hand lip
    fillBand(pts, t => 0.9 + t * 3.6, t => 0.2 + t * 2.4,
      isNight ? 'rgba(255,255,255,0.06)' : 'rgba(255,250,236,0.45)');

    // Feeder rills joining the gully near its head (badland dissection)
    const rills = 2 + Math.floor(gullyRand() * 3);
    context.lineCap = 'butt';
    for (let r = 0; r < rills; r++) {
      const j = 1 + Math.floor(gullyRand() * Math.min(4, steps - 1));
      const side = gullyRand() < 0.5 ? -1 : 1;
      const len = 9 + gullyRand() * 14;
      context.strokeStyle = isNight ? 'rgba(0,0,0,0.3)' : 'rgba(34,26,18,0.24)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(pts[j].x + side * len, pts[j].y - len * 0.9);
      context.quadraticCurveTo(pts[j].x + side * len * 0.4, pts[j].y - len * 0.3, pts[j].x, pts[j].y);
      context.stroke();
    }
  }

  // Pyroclastic-flow deposit fans at the channel mouths: flat, pale,
  // terrace-like aprons of loose ash that the lahars later remobilise.
  const fanRand = mulberry32(9090);
  gullyEnds.forEach((e, i) => {
    const rw = 26 + fanRand() * 18, rh = 10 + fanRand() * 6;
    const fan = context.createRadialGradient(e.x, e.y + 6, 2, e.x, e.y + 6, rw);
    fan.addColorStop(0, isNight ? 'rgba(120,130,145,0.22)' : 'rgba(226,220,208,0.55)');
    fan.addColorStop(0.6, isNight ? 'rgba(120,130,145,0.08)' : 'rgba(226,220,208,0.22)');
    fan.addColorStop(1, 'rgba(226,220,208,0)');
    context.fillStyle = fan;
    context.beginPath();
    context.ellipse(e.x, e.y + 6, rw, rh, 0, 0, Math.PI * 2);
    context.fill();
  });

  // Fine ash speckle (very sparse — pumice is smooth-toned)
  buildSpeckles(mulberry32(2024), 20, 520, 160, 470, 180).forEach(s => {
    context.fillStyle = isNight ? 'rgba(0,0,0,1)' : 'rgba(42,30,20,1)';
    context.globalAlpha = s.alpha * 0.8;
    context.fillRect(s.x, s.y, s.size, s.size);
  });
  context.globalAlpha = 1;

  // Summit caldera with crater lake (drawn last so it sits on top of the flanks)
  paintPinatuboCaldera(context, isNight);

  context.restore(); // end clip

  // Silhouette edge light
  context.save();
  traceJaggedRidge(context, frontAnchors, undefined, FRONT_RIDGE_SEED, 14);
  context.strokeStyle = isNight ? 'rgba(185,200,225,0.12)' : 'rgba(255,248,232,0.5)';
  context.lineWidth = 1.8;
  context.stroke();
  context.restore();
}

/* ---- Summit caldera & Lake Pinatubo ----
   The 1991 eruption collapsed the summit into a wide caldera, now filled
   by a vivid turquoise lake. Seen in the game's slightly raised 2D view,
   we show the far inner cliff wall (banded tephra layers) rising behind
   the water, the lake itself, and a breached notch on the near rim —
   the outlet through which overflow (and the game's lahars) escapes. ---- */
function paintPinatuboCaldera(context, isNight) {
  const cx = CRATER_X, cy = CRATER_Y + 6;
  const rx = 58, ry = 20;
  const rand = mulberry32(3311);

  context.save();

  // Slightly irregular rim outline
  const rimPts = [];
  const sides = 30;
  for (let s = 0; s < sides; s++) {
    const a = (s / sides) * Math.PI * 2;
    const m = 1 + (rand() - 0.5) * 0.14;
    rimPts.push({ x: cx + Math.cos(a) * rx * m, y: cy + Math.sin(a) * ry * m });
  }
  const traceRim = () => {
    context.beginPath();
    rimPts.forEach((p, i) => i ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y));
    context.closePath();
  };

  // Outer rim shadow cast down the near (lower-right) flank
  context.save();
  context.translate(3, 4);
  traceRim();
  context.fillStyle = isNight ? 'rgba(0,0,0,0.35)' : 'rgba(30,22,16,0.28)';
  context.fill();
  context.restore();

  // Inner bowl: far cliff wall (top) grading into shadowed base
  context.save();
  traceRim();
  context.clip();
  const wallGrad = context.createLinearGradient(0, cy - ry, 0, cy + ry);
  if (isNight) {
    wallGrad.addColorStop(0, '#4b535e');
    wallGrad.addColorStop(0.5, '#2a3039');
    wallGrad.addColorStop(1, '#161a21');
  } else {
    wallGrad.addColorStop(0, '#d6cfc1');
    wallGrad.addColorStop(0.5, '#9d9488');
    wallGrad.addColorStop(1, '#5a534b');
  }
  context.fillStyle = wallGrad;
  context.fillRect(cx - rx - 4, cy - ry - 4, rx * 2 + 8, ry * 2 + 8);

  // Banded tephra / old lava layers exposed in the far cliff
  for (let i = 0; i < 4; i++) {
    const t = 0.12 + i * 0.13;
    const ly = cy - ry + ry * 2 * t;
    const spanX = Math.sqrt(Math.max(0, 1 - Math.pow((ly - cy) / ry, 2))) * rx;
    context.strokeStyle = i % 2 ? (isNight ? 'rgba(0,0,0,0.3)' : 'rgba(60,48,36,0.28)')
                                : (isNight ? 'rgba(255,255,255,0.06)' : 'rgba(255,250,238,0.35)');
    context.lineWidth = 1.2;
    context.beginPath();
    context.moveTo(cx - spanX, ly + 1.5);
    context.quadraticCurveTo(cx, ly - 1.5, cx + spanX, ly + 1.5);
    context.stroke();
  }

  // Shadow on the left inner wall (faces away from the sun)
  const sideShade = context.createLinearGradient(cx - rx, 0, cx - rx * 0.3, 0);
  sideShade.addColorStop(0, isNight ? 'rgba(0,0,0,0.5)' : 'rgba(30,22,16,0.4)');
  sideShade.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = sideShade;
  context.fillRect(cx - rx - 4, cy - ry - 4, rx, ry * 2 + 8);

  // Lake Pinatubo — turquoise from suspended volcanic minerals
  const lx = cx, ly = cy + 5, lrx = rx * 0.86, lry = ry * 0.6;
  const lakeGrad = context.createLinearGradient(0, ly - lry, 0, ly + lry);
  if (isNight) {
    lakeGrad.addColorStop(0, '#1f4c58');
    lakeGrad.addColorStop(0.6, '#123541');
    lakeGrad.addColorStop(1, '#0c242d');
  } else {
    lakeGrad.addColorStop(0, '#6fd6d2');
    lakeGrad.addColorStop(0.55, '#2fa7ae');
    lakeGrad.addColorStop(1, '#1d7686');
  }
  context.fillStyle = lakeGrad;
  context.beginPath();
  context.ellipse(lx, ly, lrx, lry, 0, 0, Math.PI * 2);
  context.fill();

  // Shoreline of pale pumice beach
  context.strokeStyle = isNight ? 'rgba(150,165,185,0.22)' : 'rgba(236,230,216,0.6)';
  context.lineWidth = 1.4;
  context.beginPath();
  context.ellipse(lx, ly, lrx + 1, lry + 1, 0, 0, Math.PI * 2);
  context.stroke();

  // Sky reflection / glint
  context.fillStyle = isNight ? 'rgba(200,215,235,0.22)' : 'rgba(255,255,255,0.45)';
  context.beginPath();
  context.ellipse(lx - lrx * 0.35, ly - lry * 0.3, lrx * 0.3, lry * 0.28, -0.2, 0, Math.PI * 2);
  context.fill();
  // Faint ripples
  context.strokeStyle = isNight ? 'rgba(200,215,235,0.1)' : 'rgba(255,255,255,0.25)';
  context.lineWidth = 0.9;
  for (let i = 0; i < 3; i++) {
    const ry2 = ly - lry * 0.15 + i * lry * 0.35;
    context.beginPath();
    context.moveTo(lx - lrx * 0.5 + i * 6, ry2);
    context.quadraticCurveTo(lx - lrx * 0.2 + i * 4, ry2 - 1.2, lx + lrx * 0.15 + i * 5, ry2);
    context.stroke();
  }

  context.restore(); // end rim clip

  // Breach notch on the near rim — the lake's outlet where lahars spill out
  const nx = cx, ny = cy + ry;
  context.fillStyle = isNight ? 'rgba(20,45,54,0.9)' : 'rgba(44,132,142,0.85)';
  context.beginPath();
  context.moveTo(nx - 9, ny - 4);
  context.lineTo(nx + 9, ny - 4);
  context.lineTo(nx + 4, ny + 6);
  context.lineTo(nx - 3, ny + 6);
  context.closePath();
  context.fill();
  // Wet, pale scour channel running down from the notch
  const scour = context.createLinearGradient(0, ny, 0, ny + 46);
  scour.addColorStop(0, isNight ? 'rgba(130,145,160,0.35)' : 'rgba(210,218,214,0.6)');
  scour.addColorStop(1, 'rgba(210,218,214,0)');
  context.fillStyle = scour;
  context.beginPath();
  context.moveTo(nx - 4, ny + 4);
  context.lineTo(nx + 4, ny + 4);
  context.lineTo(nx + 9, ny + 46);
  context.lineTo(nx - 8, ny + 46);
  context.closePath();
  context.fill();
  // Notch walls
  context.strokeStyle = isNight ? 'rgba(0,0,0,0.5)' : 'rgba(30,22,16,0.45)';
  context.lineWidth = 1.6;
  context.beginPath(); context.moveTo(nx + 9, ny - 5); context.lineTo(nx + 5, ny + 8); context.stroke();
  context.strokeStyle = isNight ? 'rgba(255,255,255,0.1)' : 'rgba(255,250,236,0.6)';
  context.beginPath(); context.moveTo(nx - 9, ny - 5); context.lineTo(nx - 4, ny + 8); context.stroke();

  // Rim lip: sunlit upper-left edge, shadowed lower-right edge
  context.lineCap = 'round';
  context.lineWidth = 2.2;
  context.strokeStyle = isNight ? 'rgba(170,185,210,0.28)' : 'rgba(255,250,236,0.85)';
  context.beginPath();
  for (let s = Math.floor(sides * 0.5); s <= Math.floor(sides * 0.93); s++) {
    const p = rimPts[s % sides];
    s === Math.floor(sides * 0.5) ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y);
  }
  context.stroke();
  context.lineWidth = 1.6;
  context.strokeStyle = isNight ? 'rgba(0,0,0,0.45)' : 'rgba(30,22,16,0.42)';
  context.beginPath();
  for (let s = Math.floor(sides * 0.02); s <= Math.floor(sides * 0.42); s++) {
    const p = rimPts[s % sides];
    s === Math.floor(sides * 0.02) ? context.moveTo(p.x, p.y) : context.lineTo(p.x, p.y);
  }
  context.stroke();

  // Small erosion scars around the outer rim (collapse scallops)
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    const px = cx + Math.cos(a) * (rx + 4 + rand() * 10);
    const py = cy + Math.sin(a) * (ry + 3 + rand() * 6);
    context.strokeStyle = isNight ? 'rgba(0,0,0,0.3)' : 'rgba(34,26,18,0.25)';
    context.lineWidth = 1.1;
    context.beginPath();
    context.moveTo(px, py);
    context.lineTo(px + Math.cos(a) * 9 + (rand() - 0.5) * 4, py + Math.sin(a) * 6 + 5 + rand() * 4);
    context.stroke();
  }

  context.restore();
}
let mountainCanvasDay = null, mountainCanvasNight = null;
let isMountainCached = false;

// Builds (or rebuilds, on resize) the two cached lighting states of the volcano.
// This is the only place the expensive gradient/shape painting happens.
function buildMountainCache() {
  if (!mountainCanvasDay) {
    mountainCanvasDay = document.createElement('canvas');
    mountainCanvasNight = document.createElement('canvas');
  }
  [mountainCanvasDay, mountainCanvasNight].forEach(c => { c.width = canvas.width; c.height = canvas.height; });

  const dctx = mountainCanvasDay.getContext('2d');
  const nctx = mountainCanvasNight.getContext('2d');
  dctx.setTransform(RENDER_SX, 0, 0, RENDER_SY, 0, 0);
  nctx.setTransform(RENDER_SX, 0, 0, RENDER_SY, 0, 0);

  paintMountainScene(dctx, 'day');
  paintMountainScene(nctx, 'night');

  if (!cloudSpriteA) buildCloudSprite();
  if (!smokeSprite) buildSmokeSprite();
  isMountainCached = true;
}

/* ---------------- LIVING ENVIRONMENT: PLANTS, GRASS & BIRDS ----------------
   Small ambient-life touches so the pre-storm scene reads as alive rather
   than a static backdrop. All three follow the same "stateless, derived
   from ambientTime" pattern as the smoke/ash/cloud systems above — cheap,
   deterministic, and immune to frame-hitches since there's no per-frame
   accumulation that could drift. ---- */

// Trees/bushes sway from their base using a per-plant fixed phase offset
// (derived from array index) so the whole scene doesn't sway in lockstep
// like a stiff sheet — reads as individual gusts catching each plant.
function drawPlants(context) {
  context.save();
  DECORATIVE_PLANTS.forEach((p, i) => {
    const phase = i * 0.73; // arbitrary spacing, keeps plants out of sync
    const sway = Math.sin(ambientTime * 1.1 + phase) * (p.type === 'tree' ? 0.055 : 0.095);
    context.save();
    context.translate(p.x, p.y);
    context.rotate(sway);
    if (p.type === 'tree') {
      context.fillStyle = '#654321'; context.fillRect(-2, 2, 4, 8);
      context.fillStyle = '#38761d'; context.beginPath(); context.arc(0, -6, p.size, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#4f9d24'; context.beginPath(); context.arc(-2, -8, p.size * 0.8, 0, Math.PI * 2); context.fill();
    } else {
      context.fillStyle = '#274e13'; context.beginPath(); context.arc(-3, 0, p.size, 0, Math.PI * 2); context.fill();
      context.beginPath(); context.arc(3, 1, p.size * 0.9, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#3eb030'; context.beginPath(); context.arc(0, -3, p.size * 0.85, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  });
  context.restore();
}

// Sparse scattered grass tufts across the town's green field. Fixed seeded
// layout (built once) so the field doesn't relayout every frame — only the
// sway angle changes, driven by ambientTime.
const GRASS_TUFTS = (function buildGrassTufts() {
  const rand = mulberry32(2266);
  const arr = [];
  const count = 70;
  for (let i = 0; i < count; i++) {
    arr.push({
      x: 20 + rand() * 500,
      y: 520 + rand() * 410,
      height: 5 + rand() * 6,
      phase: rand() * Math.PI * 2,
      speed: 0.9 + rand() * 0.6,
      tone: rand() < 0.5 ? '#3f5636' : '#5a7548'
    });
  }
  return arr;
})();

function drawGrassTufts(context) {
  const cfg = townGround().tufts;
  context.save();
  context.lineCap = 'round';
  /* Density, colour and height follow the town: Bacolor's buried ground
     supports only sparse dry growth, Porac's farmland is thick and green,
     Angeles is mostly built over. */
  GRASS_TUFTS.slice(0, cfg.count).forEach((g, gi) => {
    g = { ...g,
          tone: cfg.tones[gi % cfg.tones.length],
          height: cfg.height + (g.height - 5) * 0.6 };
    const sway = Math.sin(ambientTime * g.speed + g.phase) * 3.2;
    context.strokeStyle = g.tone;
    context.lineWidth = 1.6;
    context.beginPath();
    context.moveTo(g.x - 3, g.y);
    context.quadraticCurveTo(g.x + sway, g.y - g.height * 0.6, g.x + sway * 1.4, g.y - g.height);
    context.stroke();
    context.beginPath();
    context.moveTo(g.x + 3, g.y);
    context.quadraticCurveTo(g.x + sway * 0.8, g.y - g.height * 0.55, g.x + sway * 1.1, g.y - g.height * 0.95);
    context.stroke();
  });
  context.restore();
}

// Birds: lazy loop-de-loop flight before the storm, then a single one-shot
// panic-flee animation the instant rain begins (state.birdsFleeing +
// state.birdsFleeStartAmbient are set in the rainPanel click handler).
const BIRDS = (function buildBirds() {
  const rand = mulberry32(4004);
  const count = 4;
  const arr = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      baseY: 90 + rand() * 90,
      speed: 10 + rand() * 6,
      ampY: 10 + rand() * 14,
      freq: 0.4 + rand() * 0.3,
      phase: rand() * Math.PI * 2,
      offsetStart: rand() * W,
      scale: 0.8 + rand() * 0.5
    });
  }
  return arr;
})();

function drawBirdShape(context, x, y, scale, wingPhase, alpha) {
  context.save();
  context.globalAlpha = alpha;
  context.translate(x, y);
  context.scale(scale, scale);
  const flap = Math.sin(wingPhase) * 6;
  context.strokeStyle = 'rgba(50,45,40,0.75)';
  context.lineWidth = 1.6;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(-8, 0); context.quadraticCurveTo(-3, -flap, 0, 0);
  context.quadraticCurveTo(3, -flap, 8, 0);
  context.stroke();
  context.restore();
}

function drawBirds(context) {
  if (state.gameOver) return;
  if (!state.birdsFleeing) {
    if (state.raining) return; // safety fallback — flee wasn't triggered, just hide
    BIRDS.forEach(b => {
      const x = ((ambientTime * b.speed + b.offsetStart) % (W + 40)) - 20;
      const y = b.baseY + Math.sin(ambientTime * b.freq + b.phase) * b.ampY;
      drawBirdShape(context, x, y, b.scale, ambientTime * 6 + b.phase, 0.8);
    });
  } else {
    const elapsed = ambientTime - state.birdsFleeStartAmbient;
    if (elapsed > 2.6) return; // long gone — stop drawing entirely
    BIRDS.forEach((b, i) => {
      const launchX = ((state.birdsFleeStartAmbient * b.speed + b.offsetStart) % (W + 40)) - 20;
      const launchY = b.baseY + Math.sin(state.birdsFleeStartAmbient * b.freq + b.phase) * b.ampY;
      const x = launchX + elapsed * (140 + i * 18);
      const y = launchY - elapsed * 130;
      const alpha = Math.max(0, 0.8 - elapsed / 2.2);
      drawBirdShape(context, x, y, b.scale, ambientTime * 11 + b.phase, alpha);
    });
  }
}

// Bridge traffic (Angeles only): a handful of small cars looping back and
// forth across the bridge deck before the storm, exactly like the birds'
// lazy pre-storm loop above. The instant the storm starts, every car
// "guns it" straight off the nearest edge of the bridge and fades out —
// same one-shot flee pattern as drawBirds(), just horizontal instead of
// vertical. Purely decorative: no interaction with budget/defenses/damage.
// Shared half-width for the bridge deck, used by both drawBridge() and
// drawCars() so the traffic always matches the deck's actual span. Set
// wide enough that the deck bleeds off both edges of the 540px-wide
// screen, reading as a bridge that crosses the whole town rather than a
// short span floating in the middle.
const BRIDGE_SPAN_HALF = 320;
const BRIDGE_ROAD_HALF = 20;

// Philippine vehicle archetypes for the Abacan Bridge (Side-Profile View)
const JEEPNEY_COLORS = ['#dc2626', '#0284c7', '#16a34a', '#ea580c', '#7c3aed', '#d97706'];
const CAR_COLORS = ['#f8fafc', '#64748b', '#2563eb', '#dc2626', '#059669', '#d97706'];

// 2 Lanes in Side-Elevation View:
// - Far Lane (Westbound, dir = 1): Higher on bridge deck, slightly behind
// - Near Lane (Eastbound, dir = -1): Lower on bridge deck, in foreground
const BRIDGE_LANE_CONFIGS = [
  { dir: 1,  laneYOffset: -9, type: 'jeepney', speed: 50 },
  { dir: 1,  laneYOffset: -9, type: 'sedan',   speed: 64 },
  { dir: 1,  laneYOffset: -9, type: 'van',     speed: 56 },
  { dir: -1, laneYOffset: -2, type: 'jeepney', speed: 48 },
  { dir: -1, laneYOffset: -2, type: 'tricycle',speed: 40 },
  { dir: -1, laneYOffset: -2, type: 'sedan',   speed: 60 }
];

const BRIDGE_CARS = (function buildBridgeCars() {
  const rand = mulberry32(6161);
  const arr = [];
  BRIDGE_LANE_CONFIGS.forEach((cfg) => {
    arr.push({
      dir: cfg.dir,
      laneYOffset: cfg.laneYOffset,
      type: cfg.type,
      speed: cfg.speed + (rand() - 0.5) * 12,
      offsetStart: rand() * 850,
      color: cfg.type === 'jeepney' ? JEEPNEY_COLORS[Math.floor(rand() * JEEPNEY_COLORS.length)] : CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)]
    });
  });
  return arr;
})();

// Helper to draw a detailed side-view wheel with tire and hub
function drawWheel(context, x, y, r) {
  // Black rubber tire
  context.fillStyle = '#0f172a';
  context.beginPath();
  context.arc(x, y, r, 0, Math.PI * 2);
  context.fill();
  // Silver rim
  context.fillStyle = '#cbd5e1';
  context.beginPath();
  context.arc(x, y, r * 0.55, 0, Math.PI * 2);
  context.fill();
  // Center lug cap
  context.fillStyle = '#334155';
  context.beginPath();
  context.arc(x, y, r * 0.25, 0, Math.PI * 2);
  context.fill();
}

function drawDetailedVehicle(context, x, y, dir, type, color, alpha) {
  context.save();
  context.globalAlpha = alpha;
  context.translate(x, y);
  context.scale(dir, 1); // dir = 1 faces right, dir = -1 faces left

  // Drop shadow beneath tires on the road surface
  context.fillStyle = 'rgba(0, 0, 0, 0.4)';
  context.beginPath();
  context.ellipse(0, 0.5, 17, 2.2, 0, 0, Math.PI * 2);
  context.fill();

  // Headlight beam projection in night / stormy weather
  if (state.skyTransition > 0.25 || state.raining) {
    const beamAlpha = Math.min(0.45, (state.skyTransition * 0.4 + (state.raining ? 0.22 : 0)));
    const beamGrad = context.createRadialGradient(18, -6, 2, 58, -6, 32);
    beamGrad.addColorStop(0, `rgba(254, 240, 138, ${beamAlpha})`);
    beamGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    context.fillStyle = beamGrad;
    context.beginPath();
    context.moveTo(17, -7);
    context.lineTo(60, -18);
    context.lineTo(60, 6);
    context.lineTo(17, -4);
    context.closePath();
    context.fill();
  }

  if (type === 'jeepney') {
    // ═════════════════════════════════════════════════════════════════════════
    // 🇵🇭 PHILIPPINE JEEPNEY (SIDE VIEW)
    // ═════════════════════════════════════════════════════════════════════════
    // Undercarriage beam
    context.fillStyle = '#1e293b';
    context.fillRect(-17, -4.5, 34, 2);

    // Wheels (Front & Rear)
    drawWheel(context, 10, -3.5, 3.8);
    drawWheel(context, -11, -3.5, 3.8);

    // Front Hood & Engine Compartment (Chrome / Stainless Steel)
    context.fillStyle = '#e2e8f0';
    context.beginPath();
    context.moveTo(5, -4.5);
    context.lineTo(17, -4.5);
    context.lineTo(17.5, -9);
    context.lineTo(5, -9.5);
    context.closePath();
    context.fill();

    // Front Chrome Bumper & Horseshoe Grill
    context.fillStyle = '#cbd5e1';
    context.fillRect(17, -6.5, 2.2, 4);
    context.fillStyle = '#94a3b8';
    context.fillRect(16, -9, 1.5, 3);

    // Main Passenger Cabin Lower Body (Vibrant Color)
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(-17, -4.5);
    context.lineTo(6, -4.5);
    context.lineTo(6, -9.5);
    context.lineTo(-17, -9.5);
    context.closePath();
    context.fill();

    // Side Decorative Geometric Accent Stripe
    context.fillStyle = '#fef08a';
    context.fillRect(-16, -7.5, 21, 1.5);
    context.fillStyle = '#ffffff';
    context.fillRect(-16, -5.8, 21, 0.8);

    // Open-Air Passenger Window Section (Dark Interior with Chrome Railings)
    context.fillStyle = '#0f172a';
    context.fillRect(-15, -14, 18, 4.5);

    // Driver & Passenger Silhouettes
    context.fillStyle = '#d97706';
    context.beginPath(); context.arc(3, -11.5, 1.8, 0, Math.PI * 2); context.fill(); // Driver
    context.fillStyle = '#64748b';
    context.beginPath(); context.arc(-4, -11.5, 1.6, 0, Math.PI * 2); context.fill(); // Passenger 1
    context.beginPath(); context.arc(-10, -11.5, 1.6, 0, Math.PI * 2); context.fill(); // Passenger 2

    // Chrome Passenger Safety Handrails
    context.strokeStyle = '#e2e8f0';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-15, -10.5);
    context.lineTo(3, -10.5);
    context.stroke();

    // Angled Windshield & Driver Visor Cap
    context.fillStyle = '#38bdf8';
    context.beginPath();
    context.moveTo(5, -9.5);
    context.lineTo(1.5, -14);
    context.lineTo(5, -14);
    context.closePath();
    context.fill();

    context.fillStyle = '#e2e8f0';
    context.fillRect(1, -14.5, 6.5, 1.2); // Visor

    // Extended Corrugated Jeepney Roof
    context.fillStyle = color;
    roundRectCtx(context, -17, -16, 23, 2.2, 1);
    context.fill();

    // Silver Top Roof Luggage Rack
    context.strokeStyle = '#94a3b8';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-15, -16.2);
    context.lineTo(4, -16.2);
    context.stroke();
    [-12, -4, 2].forEach(rx => {
      context.beginPath(); context.moveTo(rx, -16); context.lineTo(rx, -17.2); context.stroke();
    });

    // Rear Boarding Step
    context.fillStyle = '#475569';
    context.fillRect(-19, -5.5, 2.5, 1.5);

    // Lights (Bright Front Headlight & Red Rear Taillight)
    context.fillStyle = '#fef08a';
    context.beginPath(); context.arc(17.5, -6.5, 1.5, 0, Math.PI * 2); context.fill();
    context.fillStyle = '#ef4444';
    context.fillRect(-17.5, -6.5, 1.2, 2.2);

  } else if (type === 'tricycle') {
    // ═════════════════════════════════════════════════════════════════════════
    // 🇵🇭 PHILIPPINE MOTORIZED TRICYCLE (SIDE VIEW)
    // ═════════════════════════════════════════════════════════════════════════
    // Wheels (Motorcycle front & rear)
    drawWheel(context, 10, -3.2, 3.2);
    drawWheel(context, -6, -3.2, 3.2);

    // Motorcycle Engine & Exhaust Pipe
    context.fillStyle = '#334155';
    context.fillRect(-3, -5, 8, 3);
    context.strokeStyle = '#94a3b8';
    context.lineWidth = 1.2;
    context.beginPath(); context.moveTo(-2, -4); context.lineTo(-8, -4); context.stroke();

    // Sidecar Passenger Cab Body (Vibrant Color)
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(-10, -4.5);
    context.lineTo(8, -4.5);
    context.lineTo(8, -8);
    context.lineTo(4, -13);
    context.lineTo(-9, -13);
    context.lineTo(-10, -8);
    context.closePath();
    context.fill();

    // Sidecar Windshield & Side Window
    context.fillStyle = '#38bdf8';
    context.beginPath();
    context.moveTo(7, -8);
    context.lineTo(3.8, -12.5);
    context.lineTo(0, -12.5);
    context.lineTo(0, -8);
    context.closePath();
    context.fill();

    // Driver Silhouette (Helmet & Torso)
    context.fillStyle = '#0284c7'; // Blue shirt
    context.fillRect(-1, -9, 4, 4);
    context.fillStyle = '#f59e0b'; // Yellow helmet
    context.beginPath(); context.arc(1, -11, 2, 0, Math.PI * 2); context.fill();

    // Motorcycle Handlebars & Headlight
    context.strokeStyle = '#cbd5e1';
    context.lineWidth = 1.2;
    context.beginPath(); context.moveTo(7, -5); context.lineTo(5, -9); context.stroke();
    context.fillStyle = '#fef08a';
    context.beginPath(); context.arc(9.5, -6.5, 1.4, 0, Math.PI * 2); context.fill();

    // Sidecar Curved Roof
    context.fillStyle = '#1e293b';
    roundRectCtx(context, -10, -14, 15, 1.8, 0.8);
    context.fill();

    // Rear Taillight
    context.fillStyle = '#ef4444';
    context.fillRect(-10.2, -6, 1, 2);

  } else if (type === 'van') {
    // ═════════════════════════════════════════════════════════════════════════
    // 🚐 UV EXPRESS / DELIVERY VAN (SIDE VIEW)
    // ═════════════════════════════════════════════════════════════════════════
    context.fillStyle = '#1e293b';
    context.fillRect(-15, -4.5, 30, 2);

    // Wheels
    drawWheel(context, 9, -3.5, 3.6);
    drawWheel(context, -9, -3.5, 3.6);

    // Aerodynamic Van Body
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(-15, -4.5);
    context.lineTo(14, -4.5);
    context.lineTo(14.5, -7.5);
    context.lineTo(9.5, -14);
    context.lineTo(-14, -14);
    context.lineTo(-15, -10);
    context.closePath();
    context.fill();

    // Tinted Windows (Front windshield, sliding door glass, rear quarter)
    context.fillStyle = '#0f172a';
    // Front windshield
    context.beginPath();
    context.moveTo(8.5, -8);
    context.lineTo(13, -8);
    context.lineTo(9, -13);
    context.lineTo(5.5, -13);
    context.closePath();
    context.fill();
    // Middle window
    context.fillRect(-1.5, -13, 6, 5);
    // Rear window
    context.fillRect(-8.5, -13, 6, 5);
    // Dark Tint Glass reflections
    context.fillStyle = 'rgba(56, 189, 248, 0.5)';
    context.fillRect(6, -12.5, 2.5, 4);

    // Sliding door seam line
    context.strokeStyle = 'rgba(0, 0, 0, 0.25)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(5, -4.5); context.lineTo(5, -13.5);
    context.stroke();

    // Headlight & Taillight
    context.fillStyle = '#fef08a';
    context.fillRect(14, -7.5, 1.5, 2.2);
    context.fillStyle = '#ef4444';
    context.fillRect(-15.2, -8, 1.2, 3);

  } else {
    // ═════════════════════════════════════════════════════════════════════════
    // 🚗 CITY SEDAN / TAXI (SIDE VIEW)
    // ═════════════════════════════════════════════════════════════════════════
    context.fillStyle = '#1e293b';
    context.fillRect(-14, -4.5, 28, 2);

    // Wheels
    drawWheel(context, 8.5, -3.5, 3.5);
    drawWheel(context, -8.5, -3.5, 3.5);

    // 3-Box Sedan Body (Hood, Roof, Trunk)
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(-14, -4.5);
    context.lineTo(14, -4.5);
    context.lineTo(14, -7);
    context.lineTo(7, -7.5);
    context.lineTo(4, -12.5);
    context.lineTo(-5, -12.5);
    context.lineTo(-8, -7.5);
    context.lineTo(-14, -7);
    context.closePath();
    context.fill();

    // Side Windows with Black B-Pillar
    context.fillStyle = '#0f172a';
    context.beginPath();
    context.moveTo(6, -7.5);
    context.lineTo(3.5, -11.8);
    context.lineTo(-4.5, -11.8);
    context.lineTo(-7, -7.5);
    context.closePath();
    context.fill();

    // Glass Reflection
    context.fillStyle = 'rgba(56, 189, 248, 0.6)';
    context.fillRect(-0.5, -11.2, 3.5, 3.2);
    // B-Pillar
    context.fillStyle = '#0f172a';
    context.fillRect(-1, -12, 1.5, 4.5);

    // Headlight & Taillight
    context.fillStyle = '#fef08a';
    context.fillRect(13.5, -6.8, 1.5, 2);
    context.fillStyle = '#ef4444';
    context.fillRect(-14.2, -6.8, 1.2, 2);
  }

  context.restore();
}

/* =====================================================================
   AMBIENT VILLAGERS  —  the town before the storm
   ---------------------------------------------------------------------
   Before the player taps to start, each municipality lives: children walk
   to school, churchgoers head to Mass, shoppers come back from the wet
   market with their groceries, tourists photograph the landmarks,
   tricycles run their routes, someone sweeps the yard, kids play.

   Each person is a JOURNEY, not a fidget in place: they walk from a home
   point to a real destination on this map (the actual church, school and
   market coordinates), spend a while there doing the thing they came for,
   then walk home. Position is a pure function of ambientTime — a person
   is `(t % cycle)` along their route — so there is no per-frame state, no
   pathfinding, and no contact with gameplay, damage or collision.

   The instant the rain starts everyone evacuates toward high ground, the
   same one-shot flee the birds and bridge traffic already use.
   ===================================================================== */

// act drives what they carry and what they do at the far end:
//   'school'  schoolkid with a backpack; disappears inside on arrival
//   'church'  churchgoer, some with a veil; stands still at the steps
//   'market'  shopper — walks there empty-handed, returns with groceries
//   'photo'   tourist; raises a camera at the destination, flash and all
//   'sweep'   stationary, sweeping with a walis
//   'work'    stationary, working a field with a hoe
//   'play'    stationary, hopping/chasing
//   'sit'     stationary on a bench
// `out`/`back` are the walk legs, `dwell` the pause at each end (seconds).
const TOWN_VILLAGERS = {
  bacolor: [
    // Mass at San Guillermo (270,775). They stop at the steps just below
    // the facade and go inside, rather than walking through the wall.
    { act: 'church', from: { x: 180, y: 820 }, to: { x: 256, y: 792 }, spd: 15, dwell: 8,
      shirt: '#e8eaf6', skin: '#c68642', veil: true, fromDoor: false, toDoor: true },
    { act: 'church', from: { x: 360, y: 816 }, to: { x: 286, y: 792 }, spd: 13, dwell: 9, phase: 3,
      shirt: '#fce7f3', skin: '#8d5524', veil: true, toDoor: true },
    { act: 'church', from: { x: 316, y: 846 }, to: { x: 276, y: 794 }, spd: 12, dwell: 7, phase: 6,
      shirt: '#dbeafe', skin: '#c68642', toDoor: true },
    // Schoolchildren to the school (440,640) — in at the door, out again
    { act: 'school', from: { x: 330, y: 690 }, to: { x: 428, y: 658 }, spd: 17, dwell: 10,
      shirt: '#ffffff', skin: '#c68642', small: true, toDoor: true },
    { act: 'school', from: { x: 346, y: 698 }, to: { x: 448, y: 662 }, spd: 17, dwell: 10, phase: 0.6,
      shirt: '#ffffff', skin: '#8d5524', small: true, toDoor: true },
    // Visitor photographing the half-buried church from the plaza
    { act: 'photo', from: { x: 200, y: 700 }, to: { x: 236, y: 732 }, spd: 11, dwell: 9, phase: 2,
      shirt: '#fed7aa', skin: '#c68642', hat: true },
    // Sweeping ash off the yard
    { act: 'sweep', at: { x: 152, y: 690 }, shirt: '#bfdbfe', skin: '#8d5524', hat: true },
    { act: 'sweep', at: { x: 496, y: 776 }, shirt: '#fef3c7', skin: '#c68642' },
    // Kids playing, and someone resting by the Soto monument
    { act: 'play', at: { x: 106, y: 604 }, shirt: '#fecaca', skin: '#c68642', small: true },
    { act: 'play', at: { x: 124, y: 610 }, shirt: '#bbf7d0', skin: '#8d5524', small: true, phase: 1.1 },
    { act: 'sit', at: { x: 128, y: 898 }, shirt: '#ddd6fe', skin: '#8d5524' }
  ],
  porac: [
    // Down to the wet market (383,955) and back with the groceries. They
    // enter at the stall front on the market's west side.
    { act: 'market', from: { x: 170, y: 900 }, to: { x: 300, y: 902 }, spd: 14, dwell: 7,
      shirt: '#bfdbfe', skin: '#c68642', toDoor: true },
    { act: 'market', from: { x: 110, y: 900 }, to: { x: 296, y: 900 }, spd: 12, dwell: 8, phase: 4,
      shirt: '#fbcfe8', skin: '#8d5524', toDoor: true },
    // Schoolchildren to the school (400,690), approaching from the north
    // so they never have to cross the creek.
    { act: 'school', from: { x: 330, y: 672 }, to: { x: 394, y: 702 }, spd: 16, dwell: 10,
      shirt: '#ffffff', skin: '#8d5524', small: true, toDoor: true },
    { act: 'school', from: { x: 306, y: 662 }, to: { x: 404, y: 700 }, spd: 16, dwell: 10, phase: 0.7,
      shirt: '#ffffff', skin: '#c68642', small: true, toDoor: true },
    // Churchgoer to the church (130,590)
    { act: 'church', from: { x: 210, y: 640 }, to: { x: 146, y: 608 }, spd: 12, dwell: 8, phase: 2,
      shirt: '#ede9fe', skin: '#c68642', veil: true, toDoor: true },
    // Tourist photographing the Babo Robot (383,801)
    { act: 'photo', from: { x: 300, y: 800 }, to: { x: 348, y: 806 }, spd: 11, dwell: 9, phase: 5,
      shirt: '#fed7aa', skin: '#c68642' },
    // Farmers on the foot-slope fields
    { act: 'work', at: { x: 118, y: 648 }, shirt: '#d9f99d', skin: '#8d5524', hat: true },
    { act: 'work', at: { x: 176, y: 668 }, shirt: '#fef08a', skin: '#c68642', hat: true, phase: 1.4 },
    { act: 'work', at: { x: 296, y: 622 }, shirt: '#bbf7d0', skin: '#8d5524', hat: true, phase: 0.8 },
    // Hauling water up from the creek — ON THE BRIDGE, the only crossing.
    { act: 'carry', from: { x: 270, y: 800 }, to: { x: 270, y: 712 }, spd: 9, dwell: 4,
      shirt: '#e0f2fe', skin: '#c68642' },
    // Aeta children outside the cogon huts, and a vendor sweeping
    { act: 'play', at: { x: 468, y: 884 }, shirt: '#fed7aa', skin: '#6b4423', small: true },
    { act: 'play', at: { x: 470, y: 896 }, shirt: '#fecaca', skin: '#6b4423', small: true, phase: 1.3 },
    { act: 'sweep', at: { x: 96, y: 906 }, shirt: '#e9d5ff', skin: '#8d5524' }
  ],
  angeles: [
    // The church, university and museum are now stacked in the bottom-left
    // column at x=86. Everyone approaches from the OPEN side (to the right,
    // between the landmarks and the x=198 houses); the river and the map
    // edge are on the far sides, so no one crosses water to reach them.
    // Students to Holy Angel University (186,876), which now stands right
    // beside the church. Approach from below, stopping at the door.
    { act: 'school', from: { x: 252, y: 922 }, to: { x: 206, y: 902 }, spd: 16, dwell: 9,
      shirt: '#ffffff', skin: '#c68642', toDoor: true },
    { act: 'school', from: { x: 240, y: 936 }, to: { x: 198, y: 906 }, spd: 16, dwell: 9, phase: 0.8,
      shirt: '#ffffff', skin: '#8d5524', toDoor: true },
    // Mass at the Holy Rosary church (86,876)
    { act: 'church', from: { x: 172, y: 868 }, to: { x: 124, y: 872 }, spd: 13, dwell: 9,
      shirt: '#fce7f3', skin: '#c68642', veil: true, toDoor: true },
    { act: 'church', from: { x: 166, y: 856 }, to: { x: 122, y: 868 }, spd: 12, dwell: 8, phase: 3.5,
      shirt: '#e8eaf6', skin: '#8d5524', toDoor: true },
    // Visitors photographing the museum (86,952)
    { act: 'photo', from: { x: 172, y: 940 }, to: { x: 128, y: 946 }, spd: 11, dwell: 9, phase: 1.5,
      shirt: '#cffafe', skin: '#c68642' },
    // Crossing the Abacan bridge on foot with the shopping — the bridge is
    // the ONLY way over the river, for people as much as for vehicles.
    { act: 'market', from: { x: 60, y: 762 }, to: { x: 186, y: 772 }, spd: 15, dwell: 5, phase: 2.5,
      shirt: '#dbeafe', skin: '#c68642' },
    // Students on the north bank near the bridge approach
    { act: 'photo', from: { x: 424, y: 796 }, to: { x: 396, y: 800 }, spd: 11, dwell: 9, phase: 6,
      shirt: '#ffe4e6', skin: '#8d5524' },
    { act: 'sweep', at: { x: 466, y: 802 }, shirt: '#fed7aa', skin: '#c68642' },
    { act: 'play', at: { x: 176, y: 892 }, shirt: '#bbf7d0', skin: '#c68642', small: true },
    { act: 'sit', at: { x: 196, y: 756 }, shirt: '#fef3c7', skin: '#c68642' }
  ]
};

/* Tricycle routes are POLYLINES, not straight lines, so they can follow a
   bank and turn onto a bridge. Nothing may ford the river: in Porac both
   routes detour to the creek bridge at x=270 and cross there (in separate
   lanes), and in Angeles both run along the Abacan bridge deck, which is
   the only crossing on the map. Every waypoint sits on ground verified to
   be free of water and buildings. */
const TOWN_TRIKES = {
  // Bacolor has no river; these two lanes are open the full width.
  bacolor: [
    { path: [{ x: -40, y: 684 }, { x: 580, y: 680 }], spd: 46, body: '#ef4444' },
    { path: [{ x: 580, y: 826 }, { x: -40, y: 822 }], spd: 38, body: '#0ea5e9', phase: 5 }
  ],
  porac: [
    /* Lane note: these were routed down x=258 and along y=894-900, which
       clears the house BOXES on the centreline but not once the vehicle's
       own ~36x32 body is counted — the sprite was being clipped by the
       y=870 and y=950 house rows, and since buildings are drawn after the
       traffic they painted over it. Both lanes now sit in corridors wide
       enough for the whole vehicle: the bridge columns at x=272/290, and a
       southern run at y=800 that clears the house rows above and below. */
    // North bank -> onto the creek bridge -> south bank (southbound lane)
    { path: [{ x: -40, y: 666 }, { x: 272, y: 666 }, { x: 272, y: 800 }, { x: -40, y: 800 }],
      spd: 40, body: '#22c55e' },
    // The reverse trip, in the other bridge lane
    { path: [{ x: -40, y: 806 }, { x: 290, y: 806 }, { x: 290, y: 676 }, { x: -40, y: 672 }],
      spd: 34, body: '#f59e0b', phase: 6 }
  ],
  angeles: [
    { path: [{ x: -40, y: 696 }, { x: 580, y: 696 }], spd: 48, body: '#f59e0b' },
    { path: [{ x: 580, y: 714 }, { x: -40, y: 714 }], spd: 40, body: '#8b5cf6', phase: 7 }
  ]
};

/* Where a journeying villager is right now.
   The cycle is: walk out -> dwell -> walk back -> dwell, so a person is
   only ever a function of the clock. `carrying` is true on the return leg
   of a market trip (they have their groceries), and `arrived` is true
   while they are at the far end doing what they came to do. */
function villagerJourney(p, t) {
  if (!p.from || !p.to) {
    return { x: p.at.x, y: p.at.y, facing: 1, arrived: true, carrying: false, moving: false, alpha: 1 };
  }
  const dx = p.to.x - p.from.x, dy = p.to.y - p.from.y;
  const dist = Math.hypot(dx, dy) || 1;
  const leg = dist / (p.spd || 14);
  const dwell = p.dwell || 5;
  const cycle = (leg + dwell) * 2;
  const u = ((t + (p.phase || 0) * 3) % cycle + cycle) % cycle;

  // Door fades: a person walks IN through a doorway and disappears, then
  // reappears out of it later. `alpha` does that work — 0 means they are
  // inside the building. FADE is the time spent in the doorway itself.
  const FADE = 0.5;
  let f, arrived = false, moving = true, carrying = false, alpha = 1;
  if (u < leg) {                       // outbound
    f = u / leg;
    if (p.fromDoor) alpha = Math.min(1, u / FADE);              // stepping out of home
  } else if (u < leg + dwell) {        // at the destination
    f = 1; arrived = true; moving = false;
    if (p.toDoor) alpha = Math.max(0, 1 - (u - leg) / FADE);    // going inside
  } else if (u < leg * 2 + dwell) {    // heading home
    f = 1 - (u - leg - dwell) / leg;
    carrying = p.act === 'market';
    if (p.toDoor) alpha = Math.min(1, (u - leg - dwell) / FADE);// coming back out
  } else {                             // home again
    f = 0; moving = false;
    carrying = p.act === 'market';
    if (p.fromDoor) alpha = Math.max(0, 1 - (u - leg * 2 - dwell) / FADE);
  }
  const x = p.from.x + dx * f, y = p.from.y + dy * f;
  // Face the way they are travelling; hold the last facing while stopped.
  const dir = (u < leg + dwell) ? Math.sign(dx) : -Math.sign(dx);
  return { x, y, facing: dir === 0 ? 1 : dir, arrived, carrying, moving, alpha, f, u, leg, dwell };
}

// A small flat-shaded figure in the same style as the buildings: solid
// shapes, one light direction, no gradients.
function drawPerson(context, x, y, p, opts) {
  const { swing = 0, lean = 0, alpha = 1, panic = false, facing = 1, carrying = false, raiseCam = false } = opts || {};
  const s = p.small ? 0.74 : 1;
  const h = 18 * s;
  context.save();
  context.globalAlpha = alpha;
  context.translate(x, y);
  context.fillStyle = 'rgba(28,36,20,0.26)';
  context.beginPath(); context.ellipse(1, 1, 5.2 * s, 2.1 * s, 0, 0, Math.PI * 2); context.fill();
  context.scale(facing, 1);
  context.rotate(lean);

  /* Legs now bend at the knee. They were straight lines pivoting from the
     hip, which reads as a scissor rather than a stride: the giveaway is
     that a straight leg swung forward would have to pass through the
     ground. A knee that flexes on the forward swing and straightens as the
     foot plants fixes that, and it is only one extra point per leg. */
  const legSwing = Math.sin(swing) * (panic ? 4.2 : 2.6) * s;
  const hipY = -h * 0.42;
  context.strokeStyle = '#3f3d56'; context.lineWidth = 2.2 * s; context.lineCap = 'round';
  context.lineJoin = 'round';
  const drawLeg = (phase) => {
    const sw = Math.sin(swing + phase) * (panic ? 4.2 : 2.6) * s;
    // Knee flexes most when the leg is swinging through, least when planted.
    const lift = Math.max(0, Math.cos(swing + phase)) * (panic ? 2.6 : 1.5) * s;
    const kneeX = sw * 0.55;
    const kneeY = hipY * 0.45 - lift * 0.25;
    const footY = -Math.max(0, lift) * 0.9;
    context.beginPath();
    context.moveTo(0, hipY);
    context.lineTo(kneeX, kneeY);
    context.lineTo(sw, footY);
    context.stroke();
  };
  drawLeg(0);
  drawLeg(Math.PI);

  // Backpack, worn on the back — drawn before the body so it sits behind
  if (p.act === 'school') {
    context.fillStyle = p.small ? '#ef4444' : '#1d4ed8';
    context.beginPath();
    context.roundRect ? context.roundRect(-5.6 * s, -h * 0.76, 3.4 * s, h * 0.34, 1.4)
                      : context.rect(-5.6 * s, -h * 0.76, 3.4 * s, h * 0.34);
    context.fill();
  }

  context.fillStyle = p.shirt || '#e0e7ff';
  context.beginPath();
  context.moveTo(-3.1 * s, -h * 0.42);
  context.lineTo(3.1 * s, -h * 0.42);
  context.lineTo(2.6 * s, -h * 0.78);
  context.lineTo(-2.6 * s, -h * 0.78);
  context.closePath(); context.fill();
  context.strokeStyle = 'rgba(40,35,30,0.28)'; context.lineWidth = 0.8; context.stroke();

  const armSwing = Math.sin(swing + Math.PI) * (panic ? 4 : 2.4) * s;
  context.strokeStyle = p.skin || '#c68642'; context.lineWidth = 1.9 * s;
  context.beginPath();
  if (panic) {
    context.moveTo(-2.6 * s, -h * 0.72); context.lineTo(-5 * s, -h * 1.02);
    context.moveTo(2.6 * s, -h * 0.72); context.lineTo(5 * s, -h * 1.02);
  } else if (raiseCam) {
    // Both hands up holding a camera at eye level
    context.moveTo(-2.6 * s, -h * 0.72); context.lineTo(-2.2 * s, -h * 0.92);
    context.moveTo(2.6 * s, -h * 0.72); context.lineTo(2.2 * s, -h * 0.92);
  } else if (carrying || p.act === 'carry') {
    context.moveTo(-2.6 * s, -h * 0.7); context.lineTo(-4.2 * s, -h * 0.44);
    context.moveTo(2.6 * s, -h * 0.7); context.lineTo(4.2 * s, -h * 0.44);
  } else {
    /* Arms now hinge at the elbow and swing fore-and-aft close to the
       torso. Drawn as a single straight segment from shoulder to hand they
       splayed outward like wings at mid-stride, because the only thing
       changing was the hand's horizontal offset. */
    const armA = armSwing * 0.55, armB = -armSwing * 0.55;
    const shY = -h * 0.72;
    context.moveTo(-2.4 * s, shY);
    context.lineTo(-2.5 * s + armA * 0.5, -h * 0.58);
    context.lineTo(-2.2 * s + armA, -h * 0.44);
    context.moveTo(2.4 * s, shY);
    context.lineTo(2.5 * s + armB * 0.5, -h * 0.58);
    context.lineTo(2.2 * s + armB, -h * 0.44);
  }
  context.stroke();

  /* The head counter-bobs against the body's rise and fall. Walking people
     keep their heads remarkably level — letting it ride the full bob made
     everyone look like they were bouncing. It also leads very slightly in
     the direction of travel. */
  /* Counter-bob kept small. At 0.7 the head visibly sank into the shoulders
     on the up-beat — the body only rises 1.4px, so anything close to that
     detaches the head instead of steadying it. */
  const headBob = Math.abs(Math.sin(swing)) * 0.22 * s;
  const headLead = Math.sin(swing) * 0.22 * s;
  context.save();
  context.translate(headLead, headBob);
  context.fillStyle = p.skin || '#c68642';
  context.beginPath(); context.arc(0, -h * 0.9, 3.1 * s, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#2b1f14';
  context.beginPath(); context.arc(0, -h * 0.95, 3.1 * s, Math.PI * 1.05, Math.PI * 1.95); context.fill();
  context.restore();
  // Lace veil for churchgoers
  if (p.veil) {
    context.fillStyle = 'rgba(255,255,255,0.82)';
    context.beginPath();
    context.moveTo(-3.4 * s, -h * 0.94);
    context.quadraticCurveTo(0, -h * 1.12, 3.4 * s, -h * 0.94);
    context.lineTo(3 * s, -h * 0.72); context.lineTo(-3 * s, -h * 0.72);
    context.closePath(); context.fill();
  }
  if (p.hat) {
    context.fillStyle = '#d6b46a'; context.strokeStyle = '#8a6d30'; context.lineWidth = 0.8;
    context.beginPath();
    context.ellipse(0, -h * 1.02, 5.4 * s, 2.1 * s, 0, 0, Math.PI * 2);
    context.fill(); context.stroke();
  }
  context.restore();
}

// Whatever the person is holding or using, drawn in world space so it is
// not mirrored with the body.
function drawVillagerProp(context, x, y, p, j, swing, alpha) {
  const s = p.small ? 0.74 : 1;
  const face = j.facing;
  context.save();
  context.globalAlpha = alpha;
  context.translate(x, y);

  if (p.act === 'sweep') {
    const a = 0.5 + Math.sin(swing) * 0.35;
    context.save();
    context.translate(4.5 * s, -9 * s); context.rotate(a);
    context.strokeStyle = '#a9784a'; context.lineWidth = 1.6; context.lineCap = 'round';
    context.beginPath(); context.moveTo(0, 0); context.lineTo(0, 10 * s); context.stroke();
    context.strokeStyle = '#c9a227'; context.lineWidth = 0.9;
    for (let i = -2; i <= 2; i++) { context.beginPath(); context.moveTo(0, 10 * s); context.lineTo(i * 1.6, 14.5 * s); context.stroke(); }
    context.restore();
    // Small swept pile of ash
    context.fillStyle = 'rgba(150,140,124,0.55)';
    context.beginPath(); context.ellipse(11 * s, 0, 5 * s, 1.8 * s, 0, 0, Math.PI * 2); context.fill();
  } else if (p.act === 'work') {
    const a = -0.6 + Math.sin(swing) * 0.5;
    context.save();
    context.translate(5 * s, -8 * s); context.rotate(a);
    context.strokeStyle = '#8a5a2b'; context.lineWidth = 1.7; context.lineCap = 'round';
    context.beginPath(); context.moveTo(0, 0); context.lineTo(0, 11 * s); context.stroke();
    context.fillStyle = '#9aa3ab'; context.fillRect(-2.6 * s, 10.5 * s, 5.2 * s, 2.2 * s);
    context.restore();
  } else if (p.act === 'carry') {
    context.fillStyle = '#3b82f6'; context.strokeStyle = '#1e40af'; context.lineWidth = 0.8;
    [-5.2, 5.2].forEach(dx => { context.beginPath(); context.rect(dx * s - 2 * s, -8 * s, 4 * s, 5 * s); context.fill(); context.stroke(); });
  } else if (p.act === 'market' && j.carrying) {
    // Groceries: a woven bayong on one arm and a plastic bag on the other
    context.fillStyle = '#b98b4e'; context.strokeStyle = '#7d5a2b'; context.lineWidth = 0.8;
    context.beginPath(); context.rect(face * 4.6 * s - 2.4 * s, -7.4 * s, 4.8 * s, 5.4 * s); context.fill(); context.stroke();
    context.strokeStyle = '#7d5a2b'; context.lineWidth = 0.9;
    context.beginPath(); context.arc(face * 4.6 * s, -7.4 * s, 2.2 * s, Math.PI, 0); context.stroke();
    // Leafy greens poking out
    context.strokeStyle = '#4d9a55'; context.lineWidth = 1.1;
    context.beginPath(); context.moveTo(face * 4.6 * s, -7.6 * s); context.lineTo(face * 5.6 * s, -10.4 * s); context.stroke();
    context.fillStyle = 'rgba(240,244,248,0.85)';
    context.beginPath(); context.ellipse(-face * 4.6 * s, -5.6 * s, 2.3 * s, 3 * s, 0, 0, Math.PI * 2); context.fill();
  } else if (p.act === 'photo' && j.arrived) {
    // Camera up at eye level, with an occasional flash
    context.fillStyle = '#334155';
    context.fillRect(face * 1.4 * s - 2.6 * s, -17.4 * s, 5.2 * s, 3.4 * s);
    context.fillStyle = '#0ea5e9';
    context.beginPath(); context.arc(face * 1.4 * s, -15.7 * s, 1.1 * s, 0, Math.PI * 2); context.fill();
    const flash = Math.max(0, Math.sin(ambientTime * 1.7 + (p.phase || 0)) - 0.93) / 0.07;
    if (flash > 0) {
      context.fillStyle = `rgba(255,255,240,${flash * 0.85})`;
      context.beginPath(); context.arc(face * 3.4 * s, -16.6 * s, 4.5 * s * flash, 0, Math.PI * 2); context.fill();
    }
  } else if (p.act === 'sit') {
    context.fillStyle = '#8a6136'; context.fillRect(-7 * s, -3 * s, 14 * s, 2.4 * s);
    context.fillStyle = '#6b4a28';
    context.fillRect(-6 * s, -1 * s, 1.6 * s, 2 * s);
    context.fillRect(4.4 * s, -1 * s, 1.6 * s, 2 * s);
  }
  context.restore();
}

// Motorcycle-and-sidecar, seen from the side, with a driver and a fare.
function drawTricycle(context, x, y, dir, travel, alpha, body, rot = 0) {
  context.save();
  context.globalAlpha = alpha;
  context.translate(x, y);
  if (rot) context.rotate(rot);
  context.scale(dir, 1);
  const bob = Math.sin(travel * 14) * 0.4;
  context.translate(0, bob);

  context.fillStyle = 'rgba(28,36,20,0.28)';
  context.beginPath(); context.ellipse(0, 4, 17, 3.4, 0, 0, Math.PI * 2); context.fill();

  // Sidecar body with its roof
  context.fillStyle = body || '#ef4444';
  context.beginPath();
  context.moveTo(-15, 2); context.lineTo(-15, -8); context.lineTo(-2, -8); context.lineTo(-2, 2);
  context.closePath(); context.fill();
  context.strokeStyle = 'rgba(30,25,20,0.4)'; context.lineWidth = 1; context.stroke();
  context.fillStyle = 'rgba(255,255,255,0.35)';
  context.fillRect(-13.5, -6.5, 4, 3.5);
  // Roof
  context.fillStyle = '#e2e8f0';
  context.fillRect(-16.5, -15, 15.5, 2.2);
  context.strokeStyle = '#94a3b8'; context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(-15, -12.8); context.lineTo(-15, -8);
  context.moveTo(-2.5, -12.8); context.lineTo(-2.5, -8);
  context.stroke();
  // Passenger inside the sidecar
  context.fillStyle = '#c68642';
  context.beginPath(); context.arc(-8.5, -11, 2.4, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#2b1f14';
  context.beginPath(); context.arc(-8.5, -11.5, 2.4, Math.PI * 1.05, Math.PI * 1.95); context.fill();
  context.fillStyle = '#f8fafc';
  context.fillRect(-10.6, -9, 4.2, 3);

  // Motorcycle frame
  context.strokeStyle = '#334155'; context.lineWidth = 2.4; context.lineCap = 'round';
  context.beginPath();
  context.moveTo(2, 0); context.lineTo(7, -5); context.lineTo(12, -6);
  context.stroke();
  context.fillStyle = '#475569';
  context.fillRect(3, -7, 7, 4);
  // Driver leaning forward
  context.fillStyle = '#1e3a8a';
  context.beginPath();
  context.moveTo(4, -7); context.lineTo(9, -7); context.lineTo(8, -13); context.lineTo(4.5, -13);
  context.closePath(); context.fill();
  context.fillStyle = '#c68642';
  context.beginPath(); context.arc(7, -15, 2.5, 0, Math.PI * 2); context.fill();
  context.fillStyle = '#dc2626';   // helmet
  context.beginPath(); context.arc(7, -15.4, 2.7, Math.PI, 0); context.fill();
  context.strokeStyle = '#c68642'; context.lineWidth = 1.4; context.lineCap = 'round';
  context.beginPath(); context.moveTo(8, -12); context.lineTo(11.6, -7.4); context.stroke();

  // Wheels. Kept as dark tyres with a small hub and two faint spokes:
  // a bright hub with three full-width spokes read as a white asterisk at
  // this size rather than a wheel.
  const spin = travel * 9;
  [[-11, 2.2, 3.4], [10.5, 0.5, 3.6], [1.5, 1.4, 3.2]].forEach(([wx, wy, wr]) => {
    context.fillStyle = '#1f2937';
    context.beginPath(); context.arc(wx, wy, wr, 0, Math.PI * 2); context.fill();
    context.strokeStyle = '#4b5563'; context.lineWidth = 0.8;
    context.beginPath(); context.arc(wx, wy, wr - 0.6, 0, Math.PI * 2); context.stroke();
    context.strokeStyle = 'rgba(203,213,225,0.45)'; context.lineWidth = 0.6;
    for (let k = 0; k < 2; k++) {
      const a = spin + k * (Math.PI / 2);
      context.beginPath();
      context.moveTo(wx - Math.cos(a) * wr * 0.7, wy - Math.sin(a) * wr * 0.7);
      context.lineTo(wx + Math.cos(a) * wr * 0.7, wy + Math.sin(a) * wr * 0.7);
      context.stroke();
    }
    context.fillStyle = '#9ca3af';
    context.beginPath(); context.arc(wx, wy, wr * 0.22, 0, Math.PI * 2); context.fill();
  });
  context.restore();
}

// Walks a polyline route and returns the point `d` pixels along it, plus
// the heading there. Returns null once the route has been run out, so a
// tricycle simply leaves the map at the far end and re-enters later.
function trikeAt(path, d) {
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= acc + seg) {
      const f = seg === 0 ? 0 : (d - acc) / seg;
      const dx = b.x - a.x, dy = b.y - a.y;
      // Always side-on. Rotating the sprite a quarter turn on the vertical
      // bridge leg made the tricycle look like it had tipped over, so it
      // keeps its profile and simply carries the last heading it had.
      return {
        x: a.x + dx * f, y: a.y + dy * f,
        dir: Math.abs(dx) > 1.5 ? (dx > 0 ? 1 : -1) : null,
        rot: 0
      };
    }
    acc += seg;
  }
  return null;
}
function trikeLength(path) {
  let t = 0;
  for (let i = 0; i < path.length - 1; i++) t += Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
  return t;
}

function drawTricycles(context) {
  const list = TOWN_TRIKES[gameSettings.town];
  if (!list || !list.length || state.gameOver) return;
  const fleeing = state.villagersFleeing;
  const elapsed = fleeing ? ambientTime - (state.villagersFleeStartAmbient || 0) : 0;
  if (fleeing && elapsed > 3.4) return;
  if (!fleeing && state.raining) return;

  list.forEach((tr, i) => {
    const path = tr.path;
    const total = trikeLength(path);
    // Fleeing tricycles floor it down the rest of their route.
    const t0 = fleeing ? state.villagersFleeStartAmbient : ambientTime;
    const base = ((t0 + (tr.phase || 0) * 4) * tr.spd) % (total + 160)
                 + (fleeing ? elapsed * tr.spd * 3.2 : 0);
    const pt = trikeAt(path, base);
    if (!pt) return;
    if (pt.dir !== null) tr._dir = pt.dir;      // hold heading through turns
    const alpha = fleeing ? Math.max(0, 1 - elapsed / 2.6) : 1;
    drawTricycle(context, pt.x, pt.y, tr._dir || 1, base * 0.06, alpha, tr.body, 0);
  });
}

function drawVillagers(context) {
  if (state.gameOver) return;
  const list = TOWN_VILLAGERS[gameSettings.town];
  if (!list || !list.length) return;
  const fleeing = state.villagersFleeing;

  if (!fleeing) {
    if (state.raining) return;
    list.forEach((p, i) => {
      const j = villagerJourney(p, ambientTime);
      let x = j.x, y = j.y, swing = 0, lean = 0;
      let alpha = j.alpha;   // 0 while they are inside a building
      const raiseCam = p.act === 'photo' && j.arrived;

      if (j.moving) {
        // Stride rate scales with how fast this person actually walks, and
        // each has their own phase, so a group no longer marches in step.
        const cadence = 0.55 + (p.spd || 14) * 0.045;
        swing = ambientTime * cadence * 9 + i * 1.7;
        // Small vertical bob, twice per stride, as weight shifts foot to foot.
        y -= Math.abs(Math.sin(swing)) * 1.4;
        lean = Math.sin(swing) * 0.03;
      } else if (j.arrived && !j.moving && p.act !== 'sit' && p.act !== 'play'
                 && p.act !== 'sweep' && p.act !== 'work' && p.act !== 'photo') {
        /* Standing still used to mean completely frozen, which made a
           waiting villager look like a dropped sprite. They now breathe,
           shift their weight from foot to foot on a slow cycle, and
           occasionally glance around — small enough to read as life
           rather than as fidgeting. Each person is offset by their own
           index so a group never moves in unison. */
        const idle = ambientTime * 0.9 + i * 2.3;
        y -= (Math.sin(idle * 1.7) * 0.25 + 0.25);        // breathing
        lean = Math.sin(idle * 0.42) * 0.035;             // weight shift
        // A brief glance every few seconds, not a constant sway.
        const glance = Math.sin(idle * 0.31 + i);
        if (glance > 0.93) swing = (glance - 0.93) * 6;
      } else if (p.act === 'sweep' || p.act === 'work') {
        swing = ambientTime * 3.4 + i;
        lean = (p.act === 'work' ? 0.16 : 0.07) + Math.sin(swing) * 0.03;
      } else if (p.act === 'play') {
        y -= Math.abs(Math.sin(ambientTime * 3.6 + i * 2 + (p.phase || 0))) * 5;
        swing = ambientTime * 8 + i;
      } else if (p.act === 'sit') {
        y -= 3;
        lean = Math.sin(ambientTime * 1.1 + i) * 0.02;
      } else {
        // Standing at the church, the market stall, a viewpoint: a slight
        // sway so they never look frozen.
        lean = Math.sin(ambientTime * 1.3 + i) * 0.025;
      }
      if (alpha <= 0.02) return;

      if (p.act === 'sit') drawVillagerProp(context, x, y, p, j, swing, alpha);
      drawPerson(context, x, y, p, { swing, lean, alpha, facing: j.facing, carrying: j.carrying, raiseCam });
      if (p.act !== 'sit') drawVillagerProp(context, x, y, p, j, swing, alpha);
    });
    return;
  }

  // Storm warning: everyone drops what they are doing and runs for high
  // ground, staggered so they don't all react on the same frame.
  /* ---- EVACUATION ----
     Rebuilt. The old version had everyone bolt on the same frame at the
     same quadratic speed while drifting UPWARD five pixels a second, which
     read as the whole village levitating off-screen, and they faded out in
     the middle of the map rather than actually leaving.

     Now it plays in two beats, which is what makes a crowd reaction read:
       1. STARTLE — they stop, turn to face the volcano and recoil slightly.
          Staggered per person, so the alarm visibly spreads through the
          village instead of everyone reacting at once.
       2. BOLT — they turn and run for the nearer edge, easing up to speed
          rather than teleporting into it, and only fade once they are
          actually at the edge of the stage. */
  const elapsed = ambientTime - (state.villagersFleeStartAmbient || 0);
  if (elapsed > 5) return;
  list.forEach((p, i) => {
    const j = villagerJourney(p, state.villagersFleeStartAmbient);
    const dir = j.x < W / 2 ? -1 : 1;              // head for the nearer edge
    // The alarm spreads: each person reacts a beat after the last.
    const react = 0.1 + ((i * 7) % 11) * 0.075;
    const e = elapsed - react;

    if (e <= 0) {
      // Still going about their business, hasn't noticed yet.
      const jr = villagerJourney(p, ambientTime);
      drawPerson(context, jr.x, jr.y, p, { swing: 0, lean: 0, alpha: 1, facing: jr.facing });
      return;
    }

    if (e < 0.34) {
      /* Startle: frozen mid-step, turned toward the volcano, leaning away
         from it. This quarter-second of hesitation is what sells the panic
         that follows — without it they just slide off the screen. */
      const k = e / 0.34;
      drawPerson(context, j.x, j.y - Math.sin(k * Math.PI) * 1.6, p, {
        swing: 0, lean: dir * 0.1 * k, alpha: 1, facing: -dir, panic: true
      });
      return;
    }

    const r = e - 0.34;
    /* Everyone runs at their own pace — children quicker, adults heavier.
       Base speed is set from the worst case rather than picked by eye: a
       villager starting mid-map has ~270px to cover, and at the old 52px/s
       the slowest took 5.5s against a 5s cutoff, so they popped out of
       existence still running. 78px/s clears it in 3.8s. */
    const spd = 78 + ((i * 13) % 5) * 11 + (p.small ? 18 : 0);
    const accel = Math.min(1, r / 0.5);            // eases up to speed
    const run = spd * r * accel;
    const x = j.x + dir * run;
    // Vertical motion is now a running bob, not a drift: they stay on the
    // ground instead of floating away.
    const bob = Math.abs(Math.sin(r * 17 + i)) * 2.4;
    const y = j.y - bob;

    // Fade only at the very edge of the stage, so they leave rather than
    // evaporating in the middle of the town.
    const toEdge = dir < 0 ? x + 24 : (W - x) + 24;
    const alpha = Math.max(0, Math.min(1, toEdge / 64));
    if (alpha <= 0.01) return;

    // A puff of dust kicked up as they take off.
    if (r < 0.06 && state.dust && state.dust.length < 40) {
      state.dust.push({ kind: 'dust', x: j.x, y: j.y + 2,
        vx: -dir * (10 + Math.random() * 14), vy: -(4 + Math.random() * 8),
        r: 3 + Math.random() * 3, life: 0, max: 0.5 + Math.random() * 0.3 });
    }

    drawPerson(context, x, y, p, {
      swing: r * 26 + i, lean: dir * 0.2, alpha, panic: true, facing: dir
    });
  });
}

function drawCars(context) {
  if (gameSettings.town !== 'angeles' || !state.bridge || state.bridge.lost || state.gameOver) return;
  const b = state.bridge;
  const spanHalf = BRIDGE_SPAN_HALF;
  const leftX = b.x - spanHalf - 30, rightX = b.x + spanHalf + 30;
  const roadLen = rightX - leftX;

  if (!state.carsFleeing) {
    if (state.raining) return;
    BRIDGE_CARS.forEach(c => {
      const travel = (ambientTime * c.speed + c.offsetStart) % roadLen;
      const x = c.dir === 1 ? (leftX + travel) : (rightX - travel);
      const y = b.y + c.laneYOffset;
      drawDetailedVehicle(context, x, y, c.dir, c.type, c.color, 0.98);
    });
  } else {
    const elapsed = ambientTime - state.carsFleeStartAmbient;
    if (elapsed > 2.4) return;
    BRIDGE_CARS.forEach(c => {
      const launchTravel = (state.carsFleeStartAmbient * c.speed + c.offsetStart) % roadLen;
      const launchX = c.dir === 1 ? (leftX + launchTravel) : (rightX - launchTravel);
      const x = launchX + c.dir * elapsed * (c.speed * 3.6);
      const y = b.y + c.laneYOffset;
      const alpha = Math.max(0, 0.98 - elapsed / 2.0);
      drawDetailedVehicle(context, x, y, c.dir, c.type, c.color, alpha);
    });
  }
}

/* ---------------- FLOW CONTROLLER POPUPS ---------------- */
function showObjectiveSelection() {
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('objectiveCard').style.display = 'block';
  // Storm length is derived, not written into the markup, so it stays true
  // if STORM_DUR or GAME_SPEED is ever retuned.
  const waveInfoEl = document.getElementById('moWaveInfo');
  if (waveInfoEl) {
    waveInfoEl.textContent = `${WAVE_ORDER.length} storms, ${Math.round(STORM_DUR / GAME_SPEED)} seconds each`;
  }
  document.getElementById('townCard').style.display = 'none';
  document.getElementById('infoCard').style.display = 'none';
  document.getElementById('endCard').style.display = 'none';
  const nameEl = document.getElementById('nameCard');
  if (nameEl) nameEl.style.display = 'none';
  const lbEl = document.getElementById('leaderboardCard');
  if (lbEl) lbEl.style.display = 'none';
}

function showTownSelection() {
  document.getElementById('objectiveCard').style.display = 'none';
  document.getElementById('townCard').style.display = 'block';
  document.getElementById('infoCard').style.display = 'none';
  const nameEl = document.getElementById('nameCard');
  if (nameEl) nameEl.style.display = 'none';
  const lbEl = document.getElementById('leaderboardCard');
  if (lbEl) lbEl.style.display = 'none';

  document.querySelectorAll('.town-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.town === gameSettings.town);
  });
}

function showTownInfo() {
  const townData = TOWN_MAPS[gameSettings.town];
  if (!townData) return;

  document.getElementById('townCard').style.display = 'none';
  document.getElementById('infoCard').style.display = 'block';
  
  document.getElementById('infoCardTitle').innerHTML = uiIcon('pin') + ` Profile: ${townData.name}`;
  document.getElementById('infoCardText').textContent = townData.infoText;

  /* ---- Mission conditions, per town ----
     How long a storm lasts and how many homes may be lost both need to be
     stated, and the loss limit is NOT a fixed number: it scales with the
     size of the town (see the defeat check in simulate()), so Angeles can
     afford to lose more than Porac. Reading it from the same formula keeps
     this description true if that balance is ever retuned. */
  const objEl = document.getElementById('townObjective');
  if (objEl) {
    // Total = homes PLUS every named landmark, matching both the defeat rule
    // and the "x / y standing" counter shown during play. Counted from the
    // town data because loadTownMap() has not run yet at this point.
    const homes = (townData.houses || []).length;
    let landmarks = (townData.props || []).length;
    ['churchPos', 'schoolPos', 'robotPos', 'monumentPos', 'bridgePos']
      .forEach(k => { if (townData[k]) landmarks++; });
    if (typeof townData.riverBridgeAt === 'number') landmarks++;
    const buildings = homes + landmarks;
    const loseAt = townLoseThreshold(buildings);
    const secs = Math.round(STORM_DUR / GAME_SPEED);
    objEl.innerHTML =
      `<div class="obj-chip"><span class="obj-num">${WAVE_ORDER.length} storms</span>` +
        `<span class="obj-lbl">${secs} seconds each</span></div>` +
      `<div class="obj-chip"><span class="obj-num">${buildings}</span>` +
        `<span class="obj-lbl">buildings (${homes} homes + ${landmarks} landmarks)</span></div>` +
      `<div class="obj-chip danger"><span class="obj-num">${loseAt} lost</span>` +
        `<span class="obj-lbl">and the town falls</span></div>`;
  }
}

function loadTownMap() {
  const currentTown = gameSettings.town || 'bacolor';
  const targetMap = TOWN_MAPS[currentTown];

  // Each house cycles through a set of distinct Filipino house archetypes
  // (see drawHouse/HOUSE_STYLES) by index, combined with its own wall
  // color, so a town full of houses reads as a varied neighborhood
  // rather than the same box repeated with different paint.
  // Each town draws from its own mix of archetypes (TOWN_MAPS[...].houseStyles)
  // so Angeles reads as a city, Porac as an upland barangay and Bacolor as
  // the lahar-raised town; towns without a mix cycle through every style.
  const styleMix = targetMap.houseStyles || HOUSE_STYLES.map((_, i) => i);
  state.houses = targetMap.houses.map((h, i) => ({ ...h, id: i, hp: 100, lost: false, shakeT: 0, style: styleMix[i % styleMix.length] }));

  if (targetMap.churchPos) {
    state.church = { x: targetMap.churchPos.x, y: targetMap.churchPos.y, hp: 100, lost: false, shakeT: 0 };
  } else {
    state.church = null;
  }

  if (targetMap.schoolPos) {
    state.school = { x: targetMap.schoolPos.x, y: targetMap.schoolPos.y, hp: 100, lost: false, shakeT: 0 };
  } else {
    state.school = null;
  }
  
  if (targetMap.robotPos) {
    state.robot = { x: targetMap.robotPos.x, y: targetMap.robotPos.y, hp: 100, lost: false, shakeT: 0 };
  } else {
    state.robot = null;
  }

  if (targetMap.monumentPos) {
    state.monument = { x: targetMap.monumentPos.x, y: targetMap.monumentPos.y, hp: 100, lost: false, shakeT: 0 };
  } else {
    state.monument = null;
  }

  if (targetMap.bridgePos) {
    state.bridge = { x: targetMap.bridgePos.x, y: targetMap.bridgePos.y, hp: 100, lost: false, shakeT: 0 };
  } else {
    state.bridge = null;
  }

  // Local-landmark props (municipal hall, wet market, town signs, museum,
  // university...) are live structures too: each gets its own hp, damage
  // stages and HP bar, exactly like the church or the robot.
  state.props = (targetMap.props || []).map((p, i) => ({
    ...p, id: i, hp: 100, lost: false, shakeT: 0
  }));

  // Porac's creek crossing is a real structure too: it takes lahar damage,
  // shows a health bar and collapses in stages like every other building.
  // Its position is derived from the creek geometry so it always sits on
  // the water, whatever the channel does.
  state.creekBridge = null;
  if (typeof targetMap.riverBridgeAt === 'number') {
    const geo = getRiverGeometry(currentTown);
    if (geo && geo.horizontal) {
      const st = stationAtT(geo, targetMap.riverBridgeAt);
      state.creekBridge = {
        x: st.px, y: st.py, halfW: st.halfW,
        hp: 100, lost: false, shakeT: 0
      };
    }
  }
  
  DECORATIVE_PLANTS.length = 0;
  targetMap.plants.forEach(p => DECORATIVE_PLANTS.push(p));

  isStaticRendered = false; 
  // Fresh map: forget which HP bars had already faded in, or a structure
  // that was damaged last run would show its bar fully lit from frame one.
  for (const k in hpBarShown) delete hpBarShown[k];
  // Fresh map: forget any previous town's losses so the first draw of the
  // new panel doesn't read as a brand-new destruction event.
  prevLostKeys = new Set();
  isFirstDotRefresh = true;
  refreshStatusDots();
}

// Tracks which structures were already lost the last time the panel was
// drawn, so a NEW loss can be singled out and announced instead of quietly
// turning one more dot red in a long row.
let prevLostKeys = new Set();
// Suppresses the alarm when the panel is first built / rebuilt for a new
// town, so setting up a map never fires a false alert.
let isFirstDotRefresh = true;

/* Every damageable structure in the town: ordinary homes AND the named
   landmarks. The defeat rule, the "x / y standing" HUD counter and the
   pre-game conditions strip all read this one list. They used to disagree:
   the HUD counted landmarks but the defeat check only looked at
   state.houses, so losing the church or the university cost you nothing. */
/* ============================================================
   TOWN HAZARDS — what the lahar actually did in each place
   ------------------------------------------------------------
   The three municipalities were hit in genuinely different ways
   in 1991 and the years of lahars that followed, so each map now
   carries its own hazard on top of the shared flow:

   PORAC — sits high on the volcano's slopes, on the Pasig-Potrero.
     Proximal lahars there were BOULDER-LADEN: metre-scale rocks
     rafted along in the flow, battering whatever they struck.
     -> Boulders ride the channels and hit structures for burst damage.

   BACOLOR — the town lahar buried. Repeated flows raised the ground
     level several metres; San Guillermo Church stands sunk to half
     its height to this day.
     -> A rising burial line creeps up the map. Anything below it is
        slowly swallowed, whether or not a channel reaches it.

   ANGELES — the Abacan River cut through the city, and the 1991
     lahars destroyed the Abacan bridge and ate away the channel
     banks, collapsing what stood on the edge.
     -> The banks periodically give way, taking the nearest
        structure with them.
   ============================================================ */
const TOWN_HAZARDS = {
  porac: {
    key: 'boulders',
    name: 'Falling boulders',
    brief: 'The mud is carrying rocks as big as houses. Put a DIKE in their path — it catches them. Sandbags only soften the hit.'
  },
  bacolor: {
    key: 'burial',
    name: 'The ground is rising',
    brief: 'Mud is piling up and swallowing the town from below. Walls cannot stop it — only TREES on the slopes above will slow it down.'
  },
  angeles: {
    key: 'bridgeScour',
    name: 'The bridge is breaking',
    brief: 'The mud is washing away the ground under the bridge, just as it did in 1991. Build barriers ABOVE the bridge to protect it.'
  }
};
function townHazard() { return TOWN_HAZARDS[gameSettings.town] || null; }

function allStructures() {
  const list = state.houses.slice();
  [state.church, state.school, state.robot, state.monument,
   state.bridge, state.creekBridge].forEach(o => { if (o) list.push(o); });
  (state.props || []).forEach(p => list.push(p));
  return list;
}
// Structures that may be lost before the campaign counts as a failure.
function townLoseThreshold(totalStructures) {
  /* ceil, not round. With round(), a 17-structure town was held to 4 losses
     (23.5%) while 29-structure Angeles got 8 (27.6%) — the small maps were
     quietly stricter for no reason but rounding, and the town hazards ate
     what little margin they had. ceil() applies the same ~26% ceiling to
     every map. Doing nothing still loses everywhere, because a first wave
     played with no tools at all is an automatic defeat regardless. */
  return Math.max(3, Math.ceil(totalStructures * 0.26));
}

function refreshStatusDots() {
  const w = document.getElementById('houseDots'); w.innerHTML = '';
  // Landmark dots live in their own row; the house integrity bar is added
  // beneath it once every structure has been counted.
  const lmRow = document.createElement('div');
  lmRow.className = 'lm-row';
  w.appendChild(lmRow);
  let total = 0, standing = 0;
  const lostKeys = new Set();
  let firstNewDot = null;

  // Adds a dot and flags it as "just lost" if this is the first refresh in
  // which that particular structure is down.
  const addDot = (el, key, isLost, color) => {
    // Identity colour, matching this structure's health bar in the scene.
    // Only applied while it is standing: `.landmark-dot.lost` turns the dot
    // red from CSS, and an inline background would override that (which is
    // exactly why the robot/monument/bridge dots used to stay blue/purple/
    // yellow after being destroyed instead of going red).
    if (color && !isLost) el.style.background = color;
    if (isLost) {
      lostKeys.add(key);
      if (!prevLostKeys.has(key)) {
        el.classList.add('just-lost');
        if (!firstNewDot) firstNewDot = el;
      }
    }
    lmRow.appendChild(el);
    total++; if (!isLost) standing++;
  };

  if (state.church) {
    const cDot = document.createElement('div');
    cDot.className = 'landmark-dot' + (state.church.lost ? ' lost' : '');
    cDot.title = "Local Church";
    addDot(cDot, 'church', state.church.lost, landmarkColor('church'));
  }

  if (state.school) {
    const sDot = document.createElement('div');
    sDot.className = 'school-dot' + (state.school.lost ? ' lost' : '');
    sDot.title = "Local School";
    addDot(sDot, 'school', state.school.lost, landmarkColor('school'));
  }

  if (state.robot) {
    const rDot = document.createElement('div');
    rDot.className = 'landmark-dot' + (state.robot.lost ? ' lost' : '');
    rDot.title = "Babo Robot Landmark";
    addDot(rDot, 'robot', state.robot.lost, landmarkColor('robot'));
  }

  if (state.monument) {
    const mDot = document.createElement('div');
    mDot.className = 'landmark-dot' + (state.monument.lost ? ' lost' : '');
    mDot.title = "Juan Crisostomo Soto Monument";
    addDot(mDot, 'monument', state.monument.lost, landmarkColor('monument'));
  }

  if (state.bridge) {
    const bDot = document.createElement('div');
    bDot.className = 'landmark-dot' + (state.bridge.lost ? ' lost' : '');
    bDot.title = "Bridge";
    addDot(bDot, 'bridge', state.bridge.lost, landmarkColor('bridge'));
  }

  if (state.creekBridge) {
    const cbDot = document.createElement('div');
    cbDot.className = 'landmark-dot' + (state.creekBridge.lost ? ' lost' : '');
    cbDot.title = 'Creek Bridge';
    addDot(cbDot, 'creekBridge', state.creekBridge.lost, landmarkColor('creekBridge'));
  }

  (state.props || []).forEach((p, i) => {
    const pDot = document.createElement('div');
    pDot.className = 'landmark-dot' + (p.lost ? ' lost' : '');
    pDot.title = p.label || 'Local landmark';
    addDot(pDot, 'prop' + i, p.lost, landmarkColor('prop', i));
  });

  // Ordinary houses are summarised by one integrity bar instead of one dot
  // each: a 17-dot row could not fit the panel and scrolled out of sight.
  // Landmarks above keep their individual dots — losing a named building is
  // a distinct event the player should be able to see.
  let houseStanding = 0;
  state.houses.forEach((h, i) => {
    if (h.lost) lostKeys.add('house' + i); else houseStanding++;
    total++; if (!h.lost) standing++;
  });

  // At-a-glance summary — the dot row alone gets hard to read once a
  // town has 15-20+ structures and starts scrolling, so this gives an
  // immediate "how are we doing" number without needing to scan it.
  // Village integrity bar: one tick per house, filled by how many still
  // stand. Reads instantly at kiosk distance, where counting dots does not.
  const houseTotal = state.houses.length;
  if (houseTotal > 0) {
    const frac = houseStanding / houseTotal;
    const bar = document.createElement('div');
    bar.className = 'village-bar';
    bar.title = `${houseStanding} of ${houseTotal} homes standing`;
    const fill = document.createElement('div');
    fill.className = 'village-bar-fill' + (frac <= 0.34 ? ' danger' : (frac <= 0.67 ? ' caution' : ''));
    fill.style.width = (frac * 100) + '%';
    bar.appendChild(fill);
    const ticks = document.createElement('div');
    ticks.className = 'village-bar-ticks';
    for (let i = 0; i < houseTotal; i++) ticks.appendChild(document.createElement('span'));
    bar.appendChild(ticks);
    w.appendChild(bar);
  }
  if (lmRow.childElementCount === 0) lmRow.remove();

  const counterEl = document.getElementById('goalCounter');
  if (counterEl) {
    counterEl.innerHTML = `${standing} / ${total} <span class="gc-sub">standing</span>`;
    counterEl.classList.toggle('warning', total > 0 && standing / total <= 0.6);
  }
  // Panel state drives the heading colour, so it only alarms when the town
  // is actually in trouble.
  const goalPanel = document.getElementById('goalPanel');
  if (goalPanel) {
    const f = total > 0 ? standing / total : 1;
    goalPanel.classList.toggle('safe', f > 0.85);
    goalPanel.classList.toggle('caution', f <= 0.85 && f > 0.6);
    goalPanel.classList.toggle('danger', f <= 0.6);
  }

  // ---- Announce a new loss on the panel itself ----
  // Without this the panel is easy to miss during a storm: one more small
  // dot goes red somewhere in a scrolling row. Now the panel flashes red,
  // the lost dot bursts, a "−1" floats up, and the row auto-scrolls so the
  // dot that just died is actually visible.
  const newLosses = lostKeys.size - prevLostKeys.size;
  if (newLosses > 0 && prevLostKeys.size >= 0) {
    const panel = document.getElementById('goalPanel');
    if (panel && !isFirstDotRefresh) {
      panel.classList.remove('alarm');
      void panel.offsetWidth;            // restart the animation
      panel.classList.add('alarm');
      setTimeout(() => panel.classList.remove('alarm'), 1300);

      // Clear any still-fading number first, so rapid successive losses
      // don't stack overlapping figures on top of each other.
      panel.querySelectorAll('.loss-pop').forEach(el => el.remove());
      const pop = document.createElement('span');
      pop.className = 'loss-pop';
      pop.textContent = `−${newLosses}`;
      panel.appendChild(pop);
      setTimeout(() => pop.remove(), 1400);

      if (counterEl) {
        counterEl.classList.remove('counter-hit');
        void counterEl.offsetWidth;
        counterEl.classList.add('counter-hit');
        setTimeout(() => counterEl.classList.remove('counter-hit'), 700);
      }
    }
    // The dot strip no longer scrolls: landmark dots always fit on one
    // line and the houses are summarised by the integrity bar, so a
    // newly-lost dot is already on screen and needs nothing scrolled.
  }

  prevLostKeys = lostKeys;
  isFirstDotRefresh = false;
}

/* ---------------- DIFFICULTY SETTING HOOKS ---------------- */
function loadDifficulty() {
  const diff = gameSettings.difficulty || 'easy';
  const settings = DIFFICULTY_SETTINGS[diff];
  
  state.budget = settings.startBudget;
  state.budgetMax = settings.maxBudget;
  state.passiveIncome = settings.passiveIncome;
  pathSpeedMultipliers = [...settings.speedMultipliers];
  
  updateBudgetUI();
}

/* ---------------- TOOLBOX UI ---------------- */
const toolboxEl = document.getElementById('toolbox');
const containerEl = document.getElementById('toolItemsContainer');
const toggleEl = document.getElementById('toolboxToggle');

if (toggleEl) {
  toggleEl.addEventListener('click', () => {
    toolboxEl.classList.toggle('collapsed');
  });
}

// Toolbox card icons — the same silhouettes as the in-scene sprites
// (drawItemShape), so the card a player taps clearly matches the thing
// that lands on the map.
function toolIconSVG(type) {
  switch (type) {
    case 'sandbag': return `<svg viewBox="0 0 40 40" class="tool-icon">
      <ellipse cx="20" cy="33" rx="15" ry="3" fill="rgba(0,0,0,.18)"/>
      <g stroke="#8f6d33" stroke-width="1.4">
        <ellipse cx="10" cy="28" rx="7" ry="4.6" fill="#c9a45c"/>
        <ellipse cx="20" cy="29" rx="7" ry="4.6" fill="#c9a45c"/>
        <ellipse cx="30" cy="28" rx="7" ry="4.6" fill="#c9a45c"/>
        <ellipse cx="15" cy="21" rx="6.6" ry="4.4" fill="#d9b56b"/>
        <ellipse cx="25" cy="21" rx="6.6" ry="4.4" fill="#d9b56b"/>
        <ellipse cx="20" cy="14" rx="6.2" ry="4.2" fill="#e0bd7c"/>
      </g>
      <g stroke="rgba(120,88,36,.45)" stroke-width=".8">
        <path d="M15 10.5v7M20 10v8M25 10.5v7M10 24.5v7M20 25.5v7M30 24.5v7"/>
      </g></svg>`;
    case 'shovel':  return `<svg viewBox="0 0 40 40" class="tool-icon">
      <ellipse cx="21" cy="34" rx="11" ry="3.5" fill="#6b4a28"/>
      <path d="M16 7h8" stroke="#6f4a26" stroke-width="2.4" fill="none"/>
      <path d="M15 7q5-6 10 0" stroke="#6f4a26" stroke-width="2.4" fill="none"/>
      <rect x="17.5" y="7" width="5" height="18" fill="#a9784a" stroke="#6f4a26" stroke-width="1.2"/>
      <path d="M12 25h16q1 8-8 11-9-3-8-11z" fill="#b9c2c9" stroke="#6d777f" stroke-width="1.4"/>
      <ellipse cx="16.5" cy="30" rx="2" ry="4" fill="rgba(255,255,255,.5)"/></svg>`;
    case 'tree':    return `<svg viewBox="0 0 40 40" class="tool-icon">
      <ellipse cx="21" cy="36" rx="11" ry="3" fill="rgba(30,40,20,.22)"/>
      <path d="M17.5 36q1.5-9 1.5-14h2q0 5 1.5 14z" fill="#7a5230"/>
      <path d="M20 22l-6-4M20 24l6-4" stroke="#6b4526" stroke-width="2" stroke-linecap="round"/>
      <circle cx="11" cy="19" r="7" fill="#2f6b34"/><circle cx="29" cy="19" r="6.8" fill="#2f6b34"/>
      <circle cx="17" cy="22" r="7.4" fill="#37793c"/><circle cx="25" cy="13" r="7.6" fill="#3f8a46"/>
      <circle cx="15" cy="12" r="8" fill="#4d9a55"/><circle cx="10" cy="8" r="4.6" fill="#63b768"/>
      <ellipse cx="13" cy="9" rx="4.5" ry="3" fill="rgba(190,232,150,.45)"/></svg>`;
    case 'dam':     return `<svg viewBox="0 0 40 40" class="tool-icon">
      <ellipse cx="20" cy="34" rx="17" ry="3" fill="rgba(30,26,18,.25)"/>
      <g fill="#8a8378" stroke="#4f4a42" stroke-width=".8">
        <ellipse cx="7" cy="31" rx="3.4" ry="2.6"/><ellipse cx="15" cy="32" rx="3.2" ry="2.4"/>
        <ellipse cx="24" cy="31.5" rx="3.4" ry="2.6"/><ellipse cx="32" cy="32" rx="3.2" ry="2.4"/>
      </g>
      <path d="M5 31 L8 13 L32 13 L35 31 Z" fill="#c9c2b6" stroke="#6f695e" stroke-width="1.8"/>
      <g fill="#a9a196"><path d="M12 31l.6-18h3l.6 18z"/><path d="M23 31l-.6-18h3l.6 18z"/></g>
      <g fill="#4a453d"><ellipse cx="11" cy="26" rx="1.4" ry="1.1"/><ellipse cx="20" cy="26" rx="1.4" ry="1.1"/><ellipse cx="29" cy="26" rx="1.4" ry="1.1"/></g>
      <rect x="6" y="8" width="28" height="5" fill="#e3ded2" stroke="#6f695e" stroke-width="1.3"/>
      <g fill="#e0a531"><rect x="8" y="9" width="4" height="3"/><rect x="16" y="9" width="4" height="3"/><rect x="24" y="9" width="4" height="3"/></g></svg>`;
  }
}

// One-line job description shown on each toolbox card, so a player knows
// what a tool is FOR before spending on it (the Defense Report then shows
// what it actually did).
// Each line names the tool's ONE distinct job, in the same words the
// info-card legend uses, so the card, the legend and the end-of-round
// Defense Report all describe a tool the same way.
const TOOL_BLURBS = {
  sandbag: 'Soaks hits for what\'s behind it',
  shovel:  'Bends the channel away',
  tree:    'Plant above the town — weakens every flow',
  dam:     'Walls off and ponds the flow'
};

function buildToolbox() {
  // Rebuilding the cards drops any armed selection, so clear the tap state too.
  selectedTool = null;
  dragPreviewPos = null;
  containerEl.innerHTML = '';
  Object.entries(TOOL_DEFS).forEach(([key, def]) => {
    const item = document.createElement('div');
    item.className = 'tool-item'; item.dataset.type = key;
    // Card = icon + name + price only. The one-line job description used to
    // be printed here too, but at this panel width it wrapped to three lines,
    // collided with the icon and the price, and pushed the fourth tool below
    // the fold. It now lives in the tooltip and in the toast shown when the
    // tool is armed, where there is room for it.
    item.innerHTML =
      `${toolIconSVG(key)}` +
      `<div class="tool-text">` +
        `<div class="tool-name">${def.name}</div>` +
        `<div class="tool-price">${formatPeso(def.price)}</div>` +
      `</div>`;
    item.title = `${def.name} — ${TOOL_BLURBS[key] || ''}`;
    containerEl.appendChild(item);
    attachDragHandlers(item, key);
  });
  refreshToolboxAfford();
}

function refreshToolboxAfford() {
  // Tools are unavailable before the storm starts as well as when they're
  // unaffordable, so the toolbox visibly reflects that the player has to
  // begin the wave before deploying anything.
  const locked = !state.running || state.gameOver;
  containerEl.querySelectorAll('.tool-item').forEach(item => {
    item.classList.toggle('disabled', locked || TOOL_DEFS[item.dataset.type].price > state.budget);
  });
}

/* ---------------- TAP-TO-PLACE ---------------- */
// Placement is tap-to-arm then tap-to-place (no dragging). Tap a tool card to
// arm it, tap the map to drop it there, tap the armed card again to cancel.
// dragPreviewPos is the in-scene ghost/ring drawn every frame by
// drawDragPreview() — it follows the cursor on desktop hover and jumps to the
// tap point on touch.
const dragGhost = document.getElementById('dragGhost'); // legacy element, now hidden/unused
let dragPreviewPos = null;
let selectedTool = null;   // the currently armed tool type, or null

function attachDragHandlers(el, type) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (el.classList.contains('disabled')) { playSound('error'); return; }
    if (selectedTool === type) deselectTool();
    else selectTool(type);
  });
}

function selectTool(type) {
  selectedTool = type;
  containerEl.querySelectorAll('.tool-item').forEach(i => {
    const on = i.dataset.type === type;
    i.classList.toggle('armed', on);
    i.style.borderColor = on ? '#22c55e' : '';
    i.style.boxShadow = on ? '0 0 0 3px rgba(34,197,94,0.55), 0 6px 16px rgba(0,0,0,.22)' : '';
  });
  showToast(`${TOOL_DEFS[type].name} — ${TOOL_BLURBS[type]}. Tap the map to place it.`, 1800);
}

function deselectTool() {
  selectedTool = null;
  dragPreviewPos = null;
  containerEl.querySelectorAll('.tool-item').forEach(i => {
    i.classList.remove('armed'); i.style.borderColor = ''; i.style.boxShadow = '';
  });
}

// Desktop hover preview: while a tool is armed, show its ghost/ring under the
// cursor. (Touch devices have no hover, so the preview simply appears on the
// placing tap.)
wrap.addEventListener('pointermove', (e) => {
  if (!selectedTool) return;
  if (e.target !== canvas && e.target !== document.getElementById('dropLayer')) { dragPreviewPos = null; return; }
  const rect = wrap.getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width * W;
  const y = (e.clientY - rect.top) / rect.height * H;
  dragPreviewPos = { x, y, valid: y >= GRASS_MIN_Y, type: selectedTool };
});
wrap.addEventListener('pointerleave', () => { if (selectedTool) dragPreviewPos = null; });

function tryPlaceItem(type, x, y) {
  const def = TOOL_DEFS[type];
  // Defenses can only be deployed once the storm is running — during the
  // pre-storm briefing there is nothing to defend against yet.
  if (!state.running || state.gameOver) {
    playSound('error');
    showToast("Start the storm first — defenses can only be deployed once the lahar is coming!", 2400);
    return;
  }
  if (def.price > state.budget) {
    playSound('error'); showToast("Not enough budget!"); return;
  }
  if (y < GRASS_MIN_Y) {
    playSound('error'); showToast("Place defenses on the grass, not the volcano or sky!"); return;
  }
  
  playSound('place-' + type);   // each tool has its own voice
  state.budget -= def.price;

  const item = {
    type, x, y,
    hp: def.kind === 'area' ? Infinity : 100,
    strength: def.strength,
    radius: def.radius,
    fxT: 0,          // >0 while the tool is visibly doing something (effect glow)
    engaged: false   // set by rebuildFlowGeometry when mud is running past it
  };
  // Trees mature from a sapling over TREE_GROW_TIME; sandbags heap up a mud
  // bank as the flow presses on them.
  if (type === 'tree') item.plantT = ambientTime;
  if (type === 'sandbag') item.bank = 0;

  // ---- Diversion tools lock in their push direction at drop time ----
  // Which way the mud gets shoved depends on which side of the nearest
  // channel the player planted the tool: drop it between the flow and a
  // house and the flow is pushed to the far side. Storing the channel
  // normal here also lets the renderer draw the diversion arrow.
  if (def.deflectStrength) {
    const info = nearestFlowInfo(x, y);
    if (info) {
      item.divertSide = info.divertSide;
      item.divertNX = info.nx * info.divertSide;
      item.divertNY = info.ny * info.divertSide;
      item.divertDist = info.dist;
    } else {
      item.divertSide = 1; item.divertNX = 1; item.divertNY = 0; item.divertDist = Infinity;
    }
    if (item.divertDist > def.deflectRange) {
      showToast(`${def.name} placed, but no lahar channel is within reach to divert.`, 2200);
    }
  }

  state.placedItems.push(item);
  state.toolsPlacedTotal++;

  /* Trees pay off globally rather than where they stand, so the payoff has
     to be stated or the purchase feels like it did nothing. */
  if (type === 'tree') {
    if (y > SLOPE_COVER_LINE) {
      showToast('Too low down — trees only help on the slopes ABOVE the town.', 2600);
    } else {
      const projected = Math.min(MAX_SLOPE_COVER, slopeCover() + TREE_COVER_EACH);
      showToast(projected >= MAX_SLOPE_COVER - 0.001
        ? uiIcon('tree') + ' The slopes are fully covered — the mud is now as weak as it gets.'
        : uiIcon('tree') + ` Tree planted — the mud gets ${Math.round(projected * 100)}% weaker once it grows.`, 2400);
    }
  }

  // Rebuild immediately (not on the next simulate tick) so the diverted /
  // dike-bent channel is visible during the pre-storm prep phase too, when
  // the simulation isn't running yet.
  if (def.deflectStrength || def.cutsFlow) { flowGeomDirty = true; rebuildFlowGeometry(); }

  // Ripples are stateless/derived (see drawRipples in the RENDERING
  // section) — only the moment of creation is stored, on the
  // always-advancing ambient clock, mirroring the smoke/ash puff pattern
  // used elsewhere. No per-frame mutation bookkeeping needed.
  state.ripples.push({ x, y, startTime: ambientTime });

  // ---- Rapid-deployment combo: placing several defenses within
  // COMBO_WINDOW seconds of each other rewards a small, escalating budget
  // bonus (capped so it can't be farmed into infinite money). Uses
  // ambientTime rather than state.time because placement is also allowed
  // during the pre-storm prep phase, when state.time is still frozen at 0.
  const COMBO_WINDOW = 3.5;
  if (ambientTime - state.lastPlacementTime < COMBO_WINDOW) {
    state.comboCount++;
  } else {
    state.comboCount = 1;
  }
  state.lastPlacementTime = ambientTime;
  state.maxCombo = Math.max(state.maxCombo, state.comboCount);

  if (state.comboCount >= 2) {
    const bonus = Math.min(60_000, state.comboCount * 8_000);
    state.budget = Math.min(state.budgetMax, state.budget + bonus);
    showToast(uiIcon('bolt') + ` ${state.comboCount}x Combo! +${formatPeso(bonus)} rapid-deploy bonus`, 1300);
    flashBudgetBoost();
  }

  updateBudgetUI();
  refreshToolboxAfford();
}

/* ---------------- HUD / TOAST ---------------- */
const toastEl = document.getElementById('toast');

function showToast(msg, dur = 1600) {
  /* innerHTML rather than textContent so a toast can carry a drawn icon.
     Every string passed in is authored in this file — no player input ever
     reaches here, so there is nothing to escape. */
  toastEl.innerHTML = msg; 
  toastEl.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toastEl.classList.remove('show'), dur);
}

function updateBudgetUI() {
  const budgetAmtEl = document.getElementById('budgetAmount');
  if (budgetAmtEl) budgetAmtEl.textContent = formatPeso(state.budget);
  
  const budgetBarFillEl = document.getElementById('budgetBarFill');
  if (budgetBarFillEl) {
    const pct = Math.max(0, state.budget / state.budgetMax * 100);
    budgetBarFillEl.style.width = pct + '%';
    if (budgetAmtEl) budgetAmtEl.classList.toggle('low', pct < 20);
    budgetBarFillEl.style.background = pct < 20 ? 'var(--budget-red)' : 'var(--budget-green)';
  }
}

// Retriggers the CSS "boost" pulse animation on the budget number — called
// whenever a combo bonus lands, so the reward reads as a distinct event
// rather than the number just silently ticking upward.
function flashBudgetBoost() {
  const el = document.getElementById('budgetAmount');
  if (!el) return;
  el.classList.remove('boost');
  void el.offsetWidth; // force reflow so the animation can replay
  el.classList.add('boost');
}

document.getElementById('rainPanel').addEventListener('click', () => {
  if (state.gameOver || state.raining) return;
  
  laharRainTrack.play().catch(err => console.log("Audio blocked: ", err));
  
  playSound('storm');
  // Warm the recorded effects up front so the first impact is not silent.
  loadSfx('house_destroyed');
  loadSfx('rock_crash');
  state.raining = true; state.running = true;
  // Name the local hazard once, so the player knows what is coming and why
  // this town plays differently from the others.
  const hz0 = townHazard();
  if (hz0 && !state.hazardAnnounced) {
    state.hazardAnnounced = true;
    setTimeout(() => showToast('⚠ ' + hz0.name + ' — ' + hz0.brief, 5200), 900);
  }

  // Defenses become available now that the storm is underway — un-grey the
  // toolbox (tryPlaceItem blocks placement until this point).
  refreshToolboxAfford();
  showToast("Storm underway — deploy your defenses!", 2000);

  // Birds scatter the instant the storm begins — see drawBirds() below for
  // the two-mode (lazy pre-storm loop vs. one-shot flee) animation.
  state.birdsFleeing = true;
  state.birdsFleeStartAmbient = ambientTime;

  // Bridge traffic (Angeles) flees the instant the storm begins too — see
  // drawCars() for the matching two-mode (lazy loop vs. one-shot flee)
  // animation. Harmless to set on other towns since drawCars() no-ops
  // whenever there's no bridge for the current town.
  state.carsFleeing = true;
  state.carsFleeStartAmbient = ambientTime;

  // Residents evacuate the moment the siren sounds — the real-world
  // response to a lahar warning, and the reason the town is empty for the
  // rest of the wave. See drawVillagers().
  state.villagersFleeing = true;
  state.villagersFleeStartAmbient = ambientTime;

  document.getElementById('rainPanel').classList.add('active');
  document.getElementById('rainStatus').textContent = 'Storm Active';
  showToast("Storm begun! Defend the village!");
});

/* ---------------- SIMULATION ENGINE ---------------- */
/* Pace of play. A round is three 75-second storms plus drain and prep time,
   which ran close to five minutes — long for a walk-up museum exhibit where
   visitors play standing. At 1.5 a storm lasts ~50 real seconds and a full
   three-wave campaign lands under three minutes, without changing any of the
   underlying numbers. */
const GAME_SPEED = 1.5;

const STORM_DUR = 75;

function simulate(dt) {
  if (!state.running || state.gameOver) return;
  state.time += dt;

  // ---- Keep the diverted channel geometry current ----
  // Placement/destruction sets flowGeomDirty for an immediate rebuild;
  // otherwise diversion tools are re-evaluated ~4x a second so their bend
  // can ease off as they erode, without paying for it every frame.
  flowGeomTimer += dt;
  if (flowGeomDirty || (flowGeomTimer > 0.25 && (hasActiveDeflectors() || flowGeomSettling))) rebuildFlowGeometry();

  // Effect-glow timers on tools that did something this frame (see
  // drawToolEffects) — purely visual feedback, no gameplay value read.
  state.placedItems.forEach(it => {
    if (it.fxT > 0) it.fxT = Math.max(0, it.fxT - dt);
    // Sandbag mud-bank slowly slumps back when the front isn't pressing on it
    // (the block branch re-heaps it faster while in contact).
    if (it.type === 'sandbag' && it.bank > 0) it.bank = Math.max(0, it.bank - dt * 0.5);
  });

  // Per-channel dike accumulation bookkeeping (mud piling up behind a full
  // block, and the surge released when the block breaks).
  if (!state.damPools || state.damPools.length !== channelPaths.length) {
    state.damPools = new Array(channelPaths.length).fill(0);
    state.damCapped = new Array(channelPaths.length).fill(false);
    state.damRelease = new Array(channelPaths.length).fill(0);
    // Severed-downstream fade: when a dike cuts channel the lahar already
    // flowed through, the stranded mud downstream fades away in place instead
    // of the flow reversing. severFade 1 = normal, ramps to 0 as it dries up.
    state.severFade = new Array(channelPaths.length).fill(1);
    state.severT = new Array(channelPaths.length).fill(1);
  }
  if (!state.brSeverFade || state.brSeverFade.length !== branchPaths.length) {
    state.brSeverFade = new Array(branchPaths.length).fill(1);
    state.brSeverT = new Array(branchPaths.length).fill(1);
  }
  // After a sever the head re-forms at the dike and is faded back in
  // (0 -> 1) rather than popping into view. Kept in its own guard so it is
  // always present regardless of how the other per-channel arrays were
  // initialised (the fresh-wave state already carries damPools).
  if (!state.headReveal || state.headReveal.length !== channelPaths.length) {
    state.headReveal = new Array(channelPaths.length).fill(1);
  }
  if (!state.brHeadReveal || state.brHeadReveal.length !== branchPaths.length) {
    state.brHeadReveal = new Array(branchPaths.length).fill(1);
  }
  for (let i = 0; i < state.headReveal.length; i++) state.headReveal[i] = Math.min(1, state.headReveal[i] + dt / 0.6);
  for (let i = 0; i < state.brHeadReveal.length; i++) state.brHeadReveal[i] = Math.min(1, state.brHeadReveal[i] + dt / 0.6);

  state.budget = Math.min(state.budgetMax, state.budget + state.passiveIncome * dt);
  updateBudgetUI(); refreshToolboxAfford();

  /* ---- Falling sun collectibles: spawn during gameplay, drift down the
     screen with a gentle sway. Player taps them to earn bonus pesos.
     Spawn rate varies: roughly one sun every 8-18 seconds. Each sun lives
     for 7-12 seconds before fading; uncollected suns simply disappear. ---- */
  state.sunSpawnTimer -= dt;
  if (state.sunSpawnTimer <= 0 && !state.stormOver && !state.gameOver) {
    state.sunSpawnTimer = 8 + Math.random() * 10;
    // Value tiers: ₱50K (common), ₱100K (uncommon), ₱200K (rare golden)
    const roll = Math.random();
    const value = roll < 0.55 ? 50_000 : (roll < 0.85 ? 100_000 : 200_000);
    state.fallingSuns.push({
      x: 55 + Math.random() * 430,
      y: -44,
      vy: 48 + Math.random() * 32,
      swayAmp:  14 + Math.random() * 18,
      swayFreq:  0.7 + Math.random() * 0.7,
      swayPhase: Math.random() * Math.PI * 2,
      value,
      age: 0,
      maxAge: 7 + Math.random() * 5,
      pulsePhase: Math.random() * Math.PI * 2,
      collected: false,
      // Collect-pop: tiny scale+alpha burst after tap
      popT: 0,
    });
  }

  // Update falling suns
  state.fallingSuns.forEach(s => {
    s.age += dt;
    s.y  += s.vy * dt;
    s.x  += Math.sin(s.age * s.swayFreq + s.swayPhase) * s.swayAmp * dt;
    if (s.popT > 0) s.popT -= dt * 3.5;
  });
  state.fallingSuns = state.fallingSuns.filter(s => s.age < s.maxAge && s.y < H + 60);

  if (state.screenShake > 0) {
    state.screenShake -= dt * 12; 
    if (state.screenShake < 0) state.screenShake = 0;
  }

  if (state.raining) {
    state.stormTime += dt;
    state.rainAmount = Math.min(100, state.stormTime * 2);
    state.skyTransition = Math.min(1, state.skyTransition + dt * 0.4); 
  }
  
  let stormIntensity = 0;
  if (state.stormTime > 0) {
    const t = Math.min(1, state.stormTime / STORM_DUR);
    stormIntensity = Math.sin(Math.PI * t);
    if (t >= 1) state.stormOver = true;
  }
  if (state.raining) state.rainAmount = stormIntensity * 100;

  let drainMultiplier = 1;
  state.placedItems.forEach(item => { if (item.type === 'tree' && !item.dead) drainMultiplier += 0.05; });

  const targetVol = state.rainAmount;
  const lagRate = targetVol > state.laharVolume ? 0.5 : (0.35 * drainMultiplier);
  state.laharVolume = Math.max(0, Math.min(100, state.laharVolume + (targetVol - state.laharVolume) * dt * lagRate));

  const driveSpd = (state.laharVolume / 100) * 0.075;
  // Lahars are one-way gravity flows: when the rain eases the front STALLS
  // and the ribbon thins with volume, but progress never runs backwards
  // (a receding front reads as mud climbing back up the mountain).
  const recedeSpd = 0;

  for (let i = 0; i < channelPaths.length; i++) {
    const path = channelPaths[i];
    const totalLen = CHANNEL_LENS[i];
    const prog = Math.min(0.999, state.laharProgresses[i]);
    const front = pointAtProgress(path, prog, totalLen);
    // Where the front WOULD be if nothing had bent this channel. A shovel
    // that has successfully shoved the mud sideways would otherwise push
    // itself out of its own contact radius and stop working, so contact is
    // tested against whichever of the two fronts is nearer.
    const baseFront = basePaths[i] ? pointAtProgress(basePaths[i], prog, BASE_LENS[i] || totalLen) : front;
    let res = 0;          // blocking resistance — cuts into the flow's damage/advance via (1 - res)
    let treeRes = 0;      // tree resistance accumulates separately so it can be capped
    let divertFactor = 0; // fraction of THIS channel's speed diverted away — strongest single shovel wins, doesn't stack

    state.placedItems.forEach(item => {
      if (item.hp <= 0 || item.dead) return;
      const def = TOOL_DEFS[item.type];
      const dist = Math.min(
        Math.hypot(item.x - front.x, item.y - front.y),
        Math.hypot(item.x - baseFront.x, item.y - baseFront.y)
      );
      if (dist >= item.radius) return;

      if (def.mechanic === 'slow') {
        // Trees: a GROWING drag field. A freshly planted sapling barely slows
        // the mud; as it matures (treeGrow -> 1) it chokes the flow much
        // harder. Permanent (never washed away). Capped below so even a full
        // grove only crawls the flow, never fully stops it.
        treeRes += item.strength * treeGrow(item);
        item.slowT = (item.slowT || 0) + dt * treeGrow(item);
        item.fxT = 0.35;
      } else if (def.mechanic === 'divert') {
        // Shovels: contribute NO blocking resistance. The real work is
        // geometric — the dug cut bends this channel sideways (see the
        // FLOW DEFLECTION ENGINE). On top of that, mud running through a
        // fresh cut loses speed, which is this term. Wears down from
        // fixed manual fatigue, not from the lahar's force.
        divertFactor = Math.max(divertFactor, def.divertPercent);
        item.hp -= dt * def.fatigueRate;
        item.steerT = (item.steerT || 0) + dt;
        item.fxT = 0.35;
      } else if (def.cutsFlow) {
        // Dike: cuts the channel via the flowCutCap ceiling and erodes in the
        // dedicated dike-wear pass below — nothing to add per-front here.
      } else {
        // Sandbag: strong local slowdown at the front (stacks into a wall).
        // Its erosion and mud-banking are handled in the dedicated sandbag
        // pass below, which keeps battering it the whole time mud is flowing
        // past — not only in the instant the leading front is touching it.
        const hpFrac = Math.max(0, item.hp / 100);
        res += (item.strength / 100) * hpFrac;
        item.fxT = 0.35;
      }
    });

    res += Math.min(MAX_TREE_RES, treeRes);

    const prevProg = state.laharProgresses[i];

    // ---- Dike interaction (coverage-based) ----
    // Look only at the first dike line the front is about to hit. A line that
    // spans the width fully cuts the flow (hard cap + accumulation); a line
    // with an open gap only throttles it (the geometry engine bends the
    // channel toward that gap so the mud routes around the open side).
    // Classify the dike lines on this channel relative to the current front:
    //  - the NEAREST line AHEAD of the front decides whether it can advance
    //    (full coverage = stop at it; partial = leak through, slowed);
    //  - a full line BEHIND the front (on channel the lahar already flowed
    //    through) SEVERS the flow: the stranded mud downstream drains back to
    //    that dike and is held there.
    const bands_i = dikeBandsForPath(path, totalLen);
    let aheadCap = 1, behindCap = -1, leadCov = 0, sawAhead = false;
    for (let bi = 0; bi < bands_i.length; bi++) {
      const bd = bands_i[bi];
      const isFull = bd.coverage >= DIKE_CAP_COVERAGE;
      if (bd.t >= prevProg - 0.02) {
        if (!sawAhead) { sawAhead = true; if (isFull) aheadCap = bd.t; else leadCov = bd.coverage; }
      } else if (isFull) {
        behindCap = Math.max(behindCap, bd.t);        // nearest full line behind the front
      }
    }
    if (aheadCap >= 1 && leadCov > 0) res += leadCov * 0.9;  // squeeze-through slowdown at a gap ahead

    const slopeMul = getSlopeFactor(path, prevProg, totalLen);
    const currentSpeedMultiplier = pathSpeedMultipliers[i] * slopeMul * (1 - Math.min(0.85, divertFactor));
    let nextProg = Math.max(0, Math.min(1, prevProg + (driveSpd * currentSpeedMultiplier * (1 - Math.min(0.98, res)) - recedeSpd) * dt));

    let capped = false, headSnapped = false;
    if (aheadCap < 1) {
      // Full dike ahead: the mud stops at its front edge. It only starts
      // piling up once the front has actually REACHED the dike — not the
      // moment the dike is placed somewhere downstream. A line counts as
      // "ahead" from 0.02 behind the front, so the cap is never allowed to
      // pull the head back to it — the head just holds where it is.
      nextProg = Math.min(nextProg, Math.max(aheadCap, prevProg));
      capped = nextProg >= aheadCap - 0.012;
    } else if (leadCov === 0 && behindCap >= 0) {
      // Full dike on already-flooded channel: sever it WITHOUT reversing the
      // flow. The head stays put and the stranded mud downstream dries up and
      // fades away in place (see the width taper in computeLaharSamples). Once
      // it has fully vanished, the head sits at the dike and is held there.
      capped = true;
      state.severT[i] = behindCap;
      state.severFade[i] = Math.max(0, state.severFade[i] - dt / DIKE_FADE_TIME);
      nextProg = prevProg;                         // freeze — never recede
      if (state.severFade[i] <= 0) {
        // Dried up: the stranded mud has faded to nothing, so the head is
        // re-formed at the dike and faded back in (see headReveal) — the
        // only case where the stored progress is allowed to decrease.
        nextProg = behindCap; headSnapped = true;
        state.headReveal[i] = 0;
        state.severFade[i] = 1; state.severT[i] = 1;  // ahead-cap logic holds it from here on
      }
    }
    // Not severing this frame (e.g. the dike ahead, or it broke mid-fade):
    // restore the downstream mud so it isn't left half-faded.
    if (!(aheadCap >= 1 && leadCov === 0 && behindCap >= 0) && state.severFade[i] < 1) {
      state.severFade[i] = 1; state.severT[i] = 1;
    }

    // Accumulation behind a full block, and the surge it releases on breach.
    if (state.damCapped[i] && !capped && state.damPools[i] > 0.08) {
      state.damRelease[i] = Math.max(state.damRelease[i], state.damPools[i]);
    }
    state.damCapped[i] = capped;
    state.damPools[i] = Math.max(0, Math.min(1,
      state.damPools[i] + (capped ? 0.5 : -0.7) * (0.3 + state.laharVolume / 100) * dt));
    if (state.damRelease[i] > 0.001) {
      // Held-back mud drains out through the broken section as a brief surge.
      nextProg = Math.min(1, nextProg + state.damRelease[i] * 0.9 * dt);
      state.damRelease[i] = Math.max(0, state.damRelease[i] - dt * 0.7);
      state.damPools[i] = Math.max(0, state.damPools[i] - dt * 0.9);
    }
    // Safeguard: whatever the interactions above did, the head may only
    // ever move downstream (the faded-out sever case handled above is the
    // sole sanctioned exception).
    if (!headSnapped) nextProg = Math.max(prevProg, nextProg);
    state.laharProgresses[i] = nextProg;
  }

  // ---- Small branch trickles (see generateBranchPaths()) ----
  // Each branch only starts advancing once its parent channel's front has
  // actually reached the point it splits off from, then it flows on its
  // own — slower than a main channel and much easier for a lone sandbag
  // to choke off, since it's "just a small flow of lahar".
  if (!state.branchProgresses || state.branchProgresses.length !== branchPaths.length) {
    state.branchProgresses = new Array(branchPaths.length).fill(0);
  }
  for (let i = 0; i < branchPaths.length; i++) {
    const br = branchPaths[i];
    const parentProgress = state.laharProgresses[br.parentChannel] || 0;
    if (parentProgress < br.originT) continue;   // parent hasn't reached the split yet: hold, never drain back

    const brProg = Math.min(0.999, state.branchProgresses[i]);
    const front = pointAtProgress(br.path, brProg, br.len);
    // Same "test against the undeflected front too" trick as the main
    // channels, so a shovel that has pushed a trickle aside stays engaged.
    const baseFront = br.basePath ? pointAtProgress(br.basePath, brProg, pathLength(br.basePath)) : front;
    let res = 0, treeRes = 0, divertFactor = 0;

    state.placedItems.forEach(item => {
      if (item.hp <= 0 || item.dead) return;
      const def = TOOL_DEFS[item.type];
      const dist = Math.min(
        Math.hypot(item.x - front.x, item.y - front.y),
        Math.hypot(item.x - baseFront.x, item.y - baseFront.y)
      );
      if (dist >= item.radius) return;
      if (def.mechanic === 'slow') {
        treeRes += item.strength;
        item.fxT = 0.35;
      } else if (def.mechanic === 'divert') {
        divertFactor = Math.max(divertFactor, def.divertPercent);
        item.hp -= dt * def.fatigueRate;
        item.steerT = (item.steerT || 0) + dt;
        item.fxT = 0.35;
      } else if (def.cutsFlow) {
        // Dike: handled by the cap + dedicated dike-wear pass (see below).
      } else {
        // Same hp-scaled block as the main channels, but a small flow wears
        // point defenses down more gently than a full-size channel would.
        const hpFrac = Math.max(0, item.hp / 100);
        res += (item.strength / 100) * hpFrac;
        item.hp -= dt * def.wearMultiplier * (state.laharVolume / 100) * 0.5;
        item.fxT = 0.35;
      }
    });

    res += Math.min(MAX_TREE_RES, treeRes);

    const prevBr = state.branchProgresses[i];
    // A trickle is narrow, so a single well-placed dike easily spans it.
    // Same ahead-blocks / behind-severs logic as the main channels.
    const bbands = dikeBandsForPath(br.path, br.len);
    let brAhead = 1, brBehind = -1, brCov = 0, brSaw = false;
    for (let bi = 0; bi < bbands.length; bi++) {
      const bd = bbands[bi];
      const isFull = bd.coverage >= 0.55;
      if (bd.t >= prevBr - 0.02) {
        if (!brSaw) { brSaw = true; if (isFull) brAhead = bd.t; else brCov = bd.coverage; }
      } else if (isFull) {
        brBehind = Math.max(brBehind, bd.t);
      }
    }
    if (brAhead >= 1 && brCov > 0) res += brCov * 0.9;

    const branchSpeedMultiplier = BRANCH_SPEED * (1 - Math.min(0.85, divertFactor));
    let nextBr = Math.max(0, Math.min(1, prevBr + (driveSpd * branchSpeedMultiplier * (1 - Math.min(0.98, res)) - recedeSpd) * dt));
    let brSnapped = false;
    if (brAhead < 1) {
      nextBr = Math.min(nextBr, Math.max(brAhead, prevBr));   // hold at the dike, never pulled back to it
    } else if (brCov === 0 && brBehind >= 0) {
      // Sever an already-flowed branch: freeze it and fade the stranded
      // trickle away in place (no reverse); once it is gone the head
      // re-forms at the dike and fades back in.
      state.brSeverT[i] = brBehind;
      state.brSeverFade[i] = Math.max(0, state.brSeverFade[i] - dt / DIKE_FADE_TIME);
      nextBr = prevBr;
      if (state.brSeverFade[i] <= 0) {
        nextBr = brBehind; brSnapped = true; state.brHeadReveal[i] = 0;
        state.brSeverFade[i] = 1; state.brSeverT[i] = 1;
      }
    }
    if (!(brAhead >= 1 && brCov === 0 && brBehind >= 0) && state.brSeverFade[i] < 1) {
      state.brSeverFade[i] = 1; state.brSeverT[i] = 1;
    }
    if (!brSnapped) nextBr = Math.max(prevBr, nextBr);        // safeguard: downstream only
    state.branchProgresses[i] = nextBr;
  }

  state.placedItems.forEach(item => {
    if (item.dead || item.hp <= 0) return;
    const def = TOOL_DEFS[item.type];
    if (!def || !def.cutsFlow) return;
    const reach = def.cutReach || def.radius;
    let damming = false;
    for (let i = 0; i < channelPaths.length && !damming; i++) {
      const info = progressOfNearestPoint(channelPaths[i], CHANNEL_LENS[i], item.x, item.y);
      if (info.dist <= reach && state.laharProgresses[i] >= info.t - 0.012) damming = true;
    }
    for (let i = 0; i < branchPaths.length && !damming; i++) {
      const bp = branchPaths[i];
      const info = progressOfNearestPoint(bp.path, bp.len, item.x, item.y);
      if (info.dist <= reach && (state.branchProgresses[i] || 0) >= info.t - 0.012) damming = true;
    }
    if (damming && state.laharVolume > 0.5) {
      item.hp -= dt * def.wearMultiplier * (state.laharVolume / 100);
      item.heldT = (item.heldT || 0) + dt;
      item.fxT = 0.35;
      if ((item.heldT || 0) > 1 && ambientTime - (item.heldTextT || 0) > 2.4) {
        item.heldTextT = ambientTime;
        spawnImpactText(item.x, item.y - 26, 'HOLDING', '#ffd47a');
      }
    }
  });

  // Sandbag erosion + mud-banking: a sandbag is battered the whole time the
  // lahar is flowing past its spot (not just when the leading front happens to
  // be touching it), so it heaps up a visible bank and eventually bursts.
  state.placedItems.forEach(item => {
    if (item.dead || item.hp <= 0 || item.type !== 'sandbag') return;
    const def = TOOL_DEFS[item.type];
    const corridor = item.radius + 6;
    let inFlow = false;
    for (let i = 0; i < channelPaths.length && !inFlow; i++) {
      if (state.laharProgresses[i] <= 0) continue;
      const traveledLen = state.laharProgresses[i] * CHANNEL_LENS[i];
      if (distToTraveledPath(channelPaths[i], traveledLen, item.x, item.y) < corridor) inFlow = true;
    }
    if (inFlow && state.laharVolume > 0.5) {
      item.hp -= dt * def.wearMultiplier * (state.laharVolume / 100);
      item.bank = Math.min(1, (item.bank || 0) + dt * 1.4);
      item.fxT = 0.35;
    }
  });

  state.placedItems.forEach(item => {
    if (item.hp <= 0 && item.hp !== Infinity && !item.dead) {
      item.dead = true; playSound('error');
      // A destroyed diversion tool stops bending the flow — the channel
      // must be rebuilt so the mud visibly falls back to its old course.
      if (TOOL_DEFS[item.type].deflectStrength || TOOL_DEFS[item.type].cutsFlow) flowGeomDirty = true;
      const def = TOOL_DEFS[item.type];
      let msg = `${def.name} washed away!`;
      if (def.mechanic === 'divert') msg = `${def.name} worn out!`;
      // A breached dike releases the flow it was holding back.
      if (def.cutsFlow) msg = `Dike breached — the lahar breaks through!`;
      // A sandbag that had mud heaped against it BURSTS when it fails —
      // the banked mud sprays out and the wall is gone.
      if (item.type === 'sandbag' && (item.bank || 0) > 0.15) {
        msg = 'Sandbag burst!';
        state.screenShake = Math.max(state.screenShake, 4);
        const n = 8 + Math.round((item.bank || 0) * 8);
        for (let k = 0; k < n; k++) {
          spawnSplash(item.x + (Math.random() - 0.5) * 34, item.y - 4 + (Math.random() - 0.5) * 18);
        }
      }
      showToast(msg);
    }
  });

  // (distToTraveledPath now lives at module scope, next to the flow
  //  deflection engine, so the tool code can reuse it — same behaviour:
  //  shortest distance from a point to the stretch of channel the flow
  //  has already covered, which is what makes every building along a
  //  channel's route take damage, not just ones near the fanned-out end.)

  // Sums contact damage across every channel whose already-traveled path
  // (not just its current leading tip) passes close enough to (x, y).
  // A modest fixed-width corridor applies at any progress once the flow
  // has reached that stretch, and widens further near the front once the
  // channel starts fanning out past SPREAD_START — so buildings get
  // "run over" the moment the mud reaches them, and take heavier splash
  // damage if the fanned-out front itself later sweeps back near them.
  const BASE_CORRIDOR = 34; // px — always-on contact width along any already-flooded stretch
  /* ---- BALANCE ----
     The outer inundation band used to reach 92px beyond the corridor and
     bite at 30% strength. At peak volume that put almost every house in
     town under lethal damage AT ONCE, so no amount of building could keep
     up and even a perfectly played Easy wave lost ~10 of 24 houses.
     The band is now a slow chip: it damages and scares, but on its own it
     will not level a house inside one storm. The CORE corridor is still
     lethal, so the player's job is to defend the channel lines — which is
     the decision the game is actually about. */
  const FLOOD_REACH = 72;    // px of extra reach at peak volume
  const FLOOD_WEIGHT = 0.13; // outer band chips; the core corridor kills
  function laharContactDamage(x, y, dt, baseRate) {
    let dmg = 0;
    for (let i = 0; i < channelPaths.length; i++) {
      let progress = state.laharProgresses[i];
      if (progress <= 0) continue;
      // Severed downstream mud is drying up and deals no new damage — only the
      // held stretch up to the dike still batters anything in its path.
      if (state.severFade && state.severFade[i] < 1 && state.severT[i] < progress) progress = state.severT[i];
      const { overFactor, radius: spreadRadius } = getChannelSpread(progress);
      const corridorRadius = BASE_CORRIDOR + overFactor * Math.max(0, spreadRadius - BASE_CORRIDOR);
      // Outer inundation band. The core corridor above only widens in the
      // last stretch of a channel, so a building sitting mid-map more than
      // ~34px off the line could never be touched, however violent the
      // storm got — and with channels laid out randomly each run, that left
      // some structures permanently safe. A swollen lahar really does flood
      // a far wider corridor, so reach now scales with laharVolume.
      // Deliberately kept as a SEPARATE weak band rather than just widening
      // the core: buildings close to the channel keep exactly the damage
      // curve they had, while distant ones take a slow trickle instead of
      // nothing at all.
      const floodRadius = corridorRadius + (state.laharVolume / 100) * FLOOD_REACH;
      const traveledLen = progress * CHANNEL_LENS[i];
      const dist = distToTraveledPath(channelPaths[i], traveledLen, x, y);
      if (dist < floodRadius) {
        const core = Math.max(0, 1 - dist / corridorRadius);
        const outer = Math.max(0, 1 - dist / floodRadius) * FLOOD_WEIGHT;
        const contact = Math.max(core, outer);
        // Even before the flow fans out, a passing channel still batters
        // anything sitting right in its line — overFactor only adds
        // extra intensity once it's actively spreading.
        const intensityFactor = 0.5 + 0.5 * Math.max(overFactor, contact > 0.6 ? 0.4 : 0);
        dmg += contact * intensityFactor * dt * baseRate * CONTACT_DAMAGE_SCALE * (state.laharVolume / 100);
        // Splash kickup where the flow is actively battering a structure —
        // throttled by probability so it reads as intermittent splashes
        // rather than a constant particle firehose.
        if (contact > 0.35 && Math.random() < 0.12) {
          spawnSplash(x + (Math.random() - 0.5) * 22, y - 6 + (Math.random() - 0.5) * 10);
        }
      }
    }
    // Reforested slopes shed less material, so every flow bites less hard.
    return dmg * (1 - slopeCover());
  }

  const maxProgress = Math.max(...state.laharProgresses);
  if (maxProgress > 0) {
    state.houses.forEach(h => {
      if (h.lost) return;
      // Barriers standing between the mud and this house soak part of the
      // hit (and take the wear for it) — see applyBarrierShield().
      const dmg = applyBarrierShield(h.x, h.y, laharContactDamage(h.x, h.y, dt, 7), dt);
      if (dmg > 0) {
        h.hp -= dmg;
        if (h.hp <= 0) { 
          h.hp = 0; h.lost = true; h.shakeT = 1;
          playSfx('house_destroyed');
          
          state.screenShake = 10; 
          playSound('error'); refreshStatusDots(); showToast("House lost!"); 
          spawnImpactBurst(h.x, h.y - 8);
        }
      }
    });

    if (state.school && !state.school.lost) {
      const schoolDmg = applyBarrierShield(state.school.x, state.school.y, laharContactDamage(state.school.x, state.school.y, dt, 6.5), dt);
      state.school.hp -= schoolDmg;
      if (state.school.hp <= 0) {
        state.school.hp = 0; state.school.lost = true; state.school.shakeT = 1.2;
        state.screenShake = 14;
        playSound('error'); refreshStatusDots(); showToast("School lost!");
        spawnImpactBurst(state.school.x, state.school.y - 8);
      }
    }

    if (state.robot && !state.robot.lost) {
      const robotDmg = applyBarrierShield(state.robot.x, state.robot.y, laharContactDamage(state.robot.x, state.robot.y, dt, 5), dt);
      state.robot.hp -= robotDmg;
      if (state.robot.hp <= 0) {
        state.robot.hp = 0; state.robot.lost = true; state.robot.shakeT = 1.5;
        state.screenShake = 15;
        playSound('error'); refreshStatusDots(); showToast("Babo Robot fell!");
        spawnImpactBurst(state.robot.x, state.robot.y - 8);
      }
    }

    if (state.monument && !state.monument.lost) {
      const monumentDmg = applyBarrierShield(state.monument.x, state.monument.y, laharContactDamage(state.monument.x, state.monument.y, dt, 5), dt);
      state.monument.hp -= monumentDmg;
      if (state.monument.hp <= 0) {
        state.monument.hp = 0; state.monument.lost = true; state.monument.shakeT = 1.5;
        state.screenShake = 15;
        playSound('error'); refreshStatusDots(); showToast("Soto Monument fell!");
        spawnImpactBurst(state.monument.x, state.monument.y - 8);
      }
    }

    if (state.church && !state.church.lost) {
      const churchDmg = applyBarrierShield(state.church.x, state.church.y, laharContactDamage(state.church.x, state.church.y, dt, 6), dt);
      state.church.hp -= churchDmg;
      if (state.church.hp <= 0) {
        state.church.hp = 0; state.church.lost = true; state.church.shakeT = 1.5;
        state.screenShake = 18; 
        playSound('error'); refreshStatusDots();
        spawnImpactBurst(state.church.x, state.church.y - 8);
      }
    }

    // Landmark props take lahar damage on the same terms as the other
    // structures — shielded by nearby barriers, and lost at 0 hp.
    if (state.props) {
      state.props.forEach(p => {
        if (p.lost) return;
        const reach = Math.max(4, Math.min(8, p.w / 20));
        const dmg = applyBarrierShield(p.x, p.y, laharContactDamage(p.x, p.y, dt, reach), dt);
        p.hp -= dmg;
        if (p.hp <= 0) {
          p.hp = 0; p.lost = true; p.shakeT = 1.5;
          state.screenShake = Math.max(state.screenShake, 12);
          playSound('error'); refreshStatusDots();
          showToast(`${p.label || 'Landmark'} destroyed!`);
          spawnImpactBurst(p.x, p.y - 10);
        } else if (dmg > 0) {
          p.shakeT = Math.max(p.shakeT, 0.25);
        }
      });
    }

    if (state.creekBridge && !state.creekBridge.lost) {
      const cb = state.creekBridge;
      const cbDmg = applyBarrierShield(cb.x, cb.y, laharContactDamage(cb.x, cb.y, dt, 5.5), dt);
      cb.hp -= cbDmg;
      if (cb.hp <= 0) {
        cb.hp = 0; cb.lost = true; cb.shakeT = 1.5;
        state.screenShake = Math.max(state.screenShake, 12);
        playSound('error'); refreshStatusDots();
        showToast('Creek bridge collapsed!');
        spawnImpactBurst(cb.x, cb.y);
      } else if (cbDmg > 0) {
        cb.shakeT = Math.max(cb.shakeT, 0.25);
      }
    }

    if (state.bridge && !state.bridge.lost) {
      const bridgeDmg = applyBarrierShield(state.bridge.x, state.bridge.y, laharContactDamage(state.bridge.x, state.bridge.y, dt, 5.5), dt);
      state.bridge.hp -= bridgeDmg;
      if (state.bridge.hp <= 0) {
        state.bridge.hp = 0; state.bridge.lost = true; state.bridge.shakeT = 1.6;
        state.screenShake = 16;
        playSound('error'); refreshStatusDots(); showToast("Bridge collapsed!");
        spawnImpactBurst(state.bridge.x, state.bridge.y - 8);
      }
    }
  } else if (maxProgress < 0.55) {
    state.houses.forEach(h => { if (!h.lost && h.hp < 100) h.hp = Math.min(100, h.hp + dt * 3); });
    if (state.school && !state.school.lost && state.school.hp < 100) state.school.hp = Math.min(100, state.school.hp + dt * 2.5);
    if (state.church && !state.church.lost && state.church.hp < 100) state.church.hp = Math.min(100, state.church.hp + dt * 2);
    if (state.robot && !state.robot.lost && state.robot.hp < 100) state.robot.hp = Math.min(100, state.robot.hp + dt * 2);
    if (state.monument && !state.monument.lost && state.monument.hp < 100) state.monument.hp = Math.min(100, state.monument.hp + dt * 2);
    if (state.bridge && !state.bridge.lost && state.bridge.hp < 100) state.bridge.hp = Math.min(100, state.bridge.hp + dt * 2);
  }

  // ---- Branch trickle damage ----
  // Branches don't fan out like a main channel — they're already a thin
  // stream heading straight at one target, so once a branch's front gets
  // close to its destination it just applies light, steady contact
  // damage directly (no getChannelSpread() radius math needed).
  for (let i = 0; i < branchPaths.length; i++) {
    let progress = state.branchProgresses ? state.branchProgresses[i] : 0;
    // A severed trickle that's fading away stops damaging its target.
    if (state.brSeverFade && state.brSeverFade[i] < 1 && state.brSeverT[i] < progress) progress = state.brSeverT[i];
    if (progress < BRANCH_DAMAGE_START) continue;
    const contact = Math.min(1, (progress - BRANCH_DAMAGE_START) / (1 - BRANCH_DAMAGE_START));

    // A branch aims straight at one building, so its damage is progress-
    // based rather than corridor-based. Diversion tools are therefore
    // applied here as an aim penalty: endOffset is how far the deflected
    // branch mouth now misses its target by, and past BRANCH_MISS_PX the
    // trickle is running past the building instead of into it.
    const brRec = branchPaths[i];
    const aim = Math.max(0, 1 - (brRec.endOffset || 0) / BRANCH_MISS_PX);
    if (aim < 0.35 && !brRec.divertAnnounced && state.laharVolume > 10) {
      brRec.divertAnnounced = true;
      showToast("Trickle diverted away from the building!");
    }

    let dmg = contact * dt * 4.5 * (state.laharVolume / 100) * aim;
    if (dmg <= 0) continue;

    const b = branchPaths[i].target;
    const ref = b.ref;
    if (ref.lost) continue;
    dmg = applyBarrierShield(b.x, b.y, dmg, dt);
    if (dmg <= 0) continue;
    ref.hp -= dmg;
    if (ref.hp <= 0) {
      ref.hp = 0; ref.lost = true; ref.shakeT = 1;
      state.screenShake = Math.max(state.screenShake, 8);
      playSound('error'); refreshStatusDots();
      if (b.type === 'house') showToast("House lost!");
      else if (b.label) showToast(b.label);
      spawnImpactBurst(ref.x, ref.y - 8);
    }
  }

  if (state.houses.every(h => h.lost)) {
    endGame(false, `Lahar overwhelmed ${TOWN_MAPS[gameSettings.town].name}. All houses were lost.`);
    return;
  }

  if (state.stormOver) {
    state.postStormTimer += dt;
  }

  // End the round as soon as the lahar has actually stopped moving
  // (volume drained back to ~0 once the storm has passed) rather than
  // always waiting out the full 60s postStormTimer — a dead flow means
  // no further damage is coming, so there's nothing left to play for.
  const laharHasStopped = state.stormOver && state.laharVolume <= 0.5;

  if (state.stormOver && (state.postStormTimer >= 60 || laharHasStopped)) {
    /* A first wave played with no defenses at all is a loss, always.
       Damage alone could not guarantee this: the channels are randomly
       generated, so on a lucky layout the Easy flow misses enough
       buildings that a completely passive player scraped through (Bacolor
       finished 3 lost against a threshold of 4). For a walk-up exhibit the
       lesson has to be certain, not probabilistic — if you never deploy
       anything, the town is not defended and the run ends here. */
    if (state.waveIndex === 0 && state.toolsPlacedTotal === 0) {
      endGame(false, `No defenses were deployed, so the lahar ran straight through ${TOWN_MAPS[gameSettings.town].name}. Tap a tool, then tap the ground to build — you can only do it once the storm has started.`);
      return;
    }

    // Counts EVERY structure, landmarks included — losing the church or the
    // university is a real loss for the town, and the HUD already counted
    // them, so the rule now matches what the player is shown.
    const all = allStructures();
    const lostCount = all.filter(o => o.lost).length;
    // Tolerance scales with the size of the town, so a 29-structure city is
    // not held to the same absolute limit as an 11-structure barangay.
    const loseAt = townLoseThreshold(all.length);
    if (lostCount >= loseAt) {
      endGame(false, `The storm passed, but ${lostCount} buildings in ${TOWN_MAPS[gameSettings.town].name} were lost across the campaign. The village could not be saved.`);
    } else if (state.waveIndex < WAVE_ORDER.length - 1) {
      // This wave is survived, but more waves remain — hand off to the
      // prep-countdown transition instead of ending the game here.
      beginWaveTransition(state.waveIndex + 1);
    } else {
      endGame(true, `Your defenses held through all three waves! Only ${lostCount} house${lostCount === 1 ? '' : 's'} lost across ${TOWN_MAPS[gameSettings.town].name} — the village is saved!`);
    }
  }

  if (Math.random() < 0.5 + state.laharVolume / 100) {
    const trackIndex = Math.floor(Math.random() * channelPaths.length);
    const prog = state.laharProgresses[trackIndex];
    // Bias spawns toward the front, where the mud is churning hardest
    const spawnT = Math.random() < 0.55 ? prog * (0.82 + Math.random() * 0.18) : Math.random() * prog;
    const p = pointAtProgress(channelPaths[trackIndex], spawnT, CHANNEL_LENS[trackIndex]);
    const speed = 22 + Math.random() * 30 + state.laharVolume * 0.3;
    const scatter = (Math.random() - 0.5) * 0.9;
    state.flowParticles.push({
      x: p.x + (Math.random() - 0.5) * 14, y: p.y + (Math.random() - 0.5) * 10,
      life: 1, angle: p.angle + scatter, light: Math.random() < 0.35,
      vx: Math.cos(p.angle + scatter) * speed, vy: Math.sin(p.angle + scatter) * speed,
      drag: 1.6 + Math.random() * 1.4
    });
  }
  state.flowParticles.forEach(p => {
    p.life -= dt * 0.9;
    if (p.vx !== undefined) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k; p.vy *= k;
    }
  });
  state.flowParticles = state.flowParticles.filter(p => p.life > 0);

  // ---- Floating debris (rocks & ash clumps) carried within the flow ----
  // Adds visual danger/mass to the lahar without touching any resistance,
  // damage, or budget math above — purely a decorative particle layer
  // spawned along whatever length of channel has already been reached.
  if (state.raining) {
    const debrisChance = 0.05 + state.laharVolume / 600;
    if (Math.random() < debrisChance) {
      const trackIndex = Math.floor(Math.random() * channelPaths.length);
      if (state.laharProgresses[trackIndex] > 0.06) {
        const p = pointAtProgress(channelPaths[trackIndex], Math.random() * state.laharProgresses[trackIndex], CHANNEL_LENS[trackIndex]);
        const isAsh = Math.random() < 0.35;
        // Each rock gets its own irregular silhouette (6 randomized vertex
        // radii, generated once at spawn) instead of every rock reusing
        // the same fixed hexagon shape — reads as genuinely jagged debris
        // rather than a stamped icon.
        const vertJitter = isAsh ? null : Array.from({ length: 6 }, () => 0.62 + Math.random() * 0.65);
        state.debris.push({
          x: p.x + (Math.random() - 0.5) * 22,
          y: p.y + (Math.random() - 0.5) * 14,
          angle: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 2.2,
          size: isAsh ? 3 + Math.random() * 3.5 : 4 + Math.random() * 6.5,
          type: isAsh ? 'ash' : 'rock',
          vertJitter,
          vy: 9 + Math.random() * 7,
          drift: (Math.random() - 0.5) * 6,
          life: 1
        });
      }
    }
  }
  state.debris.forEach(p => {
    p.y += p.vy * dt;
    p.x += p.drift * dt;
    p.angle += p.rotSpeed * dt;
    p.life -= dt * 0.22;
  });
  state.debris = state.debris.filter(p => p.life > 0);
  if (state.debris.length > 36) state.debris.splice(0, state.debris.length - 36);

  // ---- Splash droplets: short-lived ballistic arcs kicked up wherever
  // the flow is currently battering a structure (spawned from inside
  // laharContactDamage above). ----
  state.splashes.forEach(p => {
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt * 1.4;
  });
  state.splashes = state.splashes.filter(p => p.life > 0);

  if (state.raining) {
    const profile = DIFFICULTY_SETTINGS[gameSettings.difficulty];
    // Rain density follows render quality, so a struggling kiosk sheds
    // particle work as well as pixels.
    const spawnCount = Math.floor(profile.rainIntensity * (state.rainAmount / 25) * renderQuality);
    for (let s = 0; s < spawnCount; s++) {
      state.particles.push({
        x: Math.random() * W, 
        y: Math.random() * -20, 
        vy: 420 + Math.random() * 140 
      });
    }

    if (gameSettings.difficulty === 'hard' && Math.random() < 0.012 && state.lightningFlash <= 0) {
      state.lightningFlash = 0.35; 
      state.screenShake = 12;      
      
      let curX = 100 + Math.random() * (W - 200);
      let curY = 0;
      state.lightningPath = [{x: curX, y: curY}];
      
      while (curY < 300) {
        curX += (Math.random() - 0.5) * 45;
        curY += 15 + Math.random() * 25;
        state.lightningPath.push({x: curX, y: curY});
        
        if (Math.random() < 0.2) {
          state.lightningPath.push({x: curX + (Math.random() - 0.5) * 30, y: curY + 15});
          state.lightningPath.push({x: curX, y: curY});
        }
      }
    }
  }

  // Collapse dust and debris advance with the sim clock.
  updateCollapseDust(dt);
  updateLaharEmbers(dt);
  updateTownHazard(dt);

  state.particles.forEach(p => { 
    p.y += p.vy * dt; 
    p.x -= 1.5; 
    if (p.x < 0) p.x = W;
  });
  state.particles = state.particles.filter(p => p.y < H);

  if (state.lightningFlash > 0) {
    state.lightningFlash -= dt;
    if (state.lightningFlash <= 0) state.lightningPath = []; 
  }
}

// Kicks up a small burst of mud-water droplets at (x, y), arcing outward
// and falling under a fixed synthetic gravity. Called from
// laharContactDamage whenever the flow is making strong contact with a
// building — purely cosmetic, no gameplay values are read or written.
function spawnSplash(x, y) {
  const count = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const speed = 45 + Math.random() * 75;
    state.splashes.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 230,
      life: 1,
      size: 2 + Math.random() * 2.5
    });
  }
}

// Bigger one-shot debris/splash burst fired at the moment a structure is
// lost — layers on top of the existing screenShake + sound cue to sell the
// hit, reusing the existing splash particle system instead of adding a
// whole new rendering path.
/* A building coming down: a rolling dust cloud plus tumbling debris.
   This used to be three mud splashes, which read as a small impact rather
   than a structure being destroyed — the most important event in the game
   passed almost unnoticed. */
function spawnImpactBurst(x, y, size = 1) {
  for (let i = 0; i < 3; i++) spawnSplash(x + (Math.random() - 0.5) * 20, y + (Math.random() - 0.5) * 10);
  if (!state.dust) state.dust = [];
  for (let i = 0; i < 15; i++) {              // dust: billows out and up
    const a = Math.random() * Math.PI * 2;
    state.dust.push({ kind: 'dust',
      x: x + (Math.random() - 0.5) * 24 * size, y: y - Math.random() * 12,
      vx: Math.cos(a) * (16 + Math.random() * 38) * size,
      vy: -(16 + Math.random() * 44) * size,
      r: (5 + Math.random() * 10) * size,
      life: 0, max: 0.9 + Math.random() * 0.9 });
  }
  for (let i = 0; i < 9; i++) {               // debris: arcs and falls back
    state.dust.push({ kind: 'chunk',
      x, y: y - 4,
      vx: (Math.random() - 0.5) * 160 * size,
      vy: -(60 + Math.random() * 130) * size,
      r: (1.7 + Math.random() * 2.7) * size,
      rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 12,
      life: 0, max: 0.7 + Math.random() * 0.6 });
  }
}

/* Drives whichever hazard this town carries. Runs only while a storm is
   actually flowing, so the map is calm between waves. */
/* Embers and steam lifting off the hottest stretches of the flow.
   Deliberately cheap for a kiosk: it reuses the existing collapse-dust
   array and its update/draw loop rather than adding a second particle
   system, spawns at most a couple of particles per second, and hard-caps
   the total so a long storm can never accumulate work. */
const EMBER_CAP = 26;
let emberTimer = 0;
function updateLaharEmbers(dt) {
  const intensity = state.laharVolume / 100;
  if (!state.running || intensity < 0.25) return;
  if (!state.dust) state.dust = [];
  emberTimer -= dt;
  if (emberTimer > 0) return;
  emberTimer = 0.16 + Math.random() * 0.2;
  if (state.dust.length > EMBER_CAP) return;

  // Pick a point on a live channel, biased toward the hot middle of the run.
  const live = [];
  for (let i = 0; i < channelPaths.length; i++) {
    if ((state.laharProgresses[i] || 0) > 0.1) live.push(i);
  }
  if (!live.length) return;
  const ci = live[(Math.random() * live.length) | 0];
  const prog = state.laharProgresses[ci];
  const t = Math.max(0.04, prog * (0.25 + Math.random() * 0.7));
  const pt = pointAtProgress(channelPaths[ci], t, CHANNEL_LENS[ci]);
  if (!pt) return;
  const jitter = (Math.random() - 0.5) * 16;

  if (Math.random() < 0.62) {
    // Ember: small, bright, rises and fades fast.
    state.dust.push({
      kind: 'ember',
      x: pt.x + jitter, y: pt.y,
      vx: (Math.random() - 0.5) * 16,
      vy: -(20 + Math.random() * 34),
      r: 1.1 + Math.random() * 1.5,
      life: 0, max: 0.7 + Math.random() * 0.7
    });
  } else {
    // Steam: dark, slow, expands — where hot material meets wet ground.
    state.dust.push({
      kind: 'steam',
      x: pt.x + jitter * 1.4, y: pt.y,
      vx: (Math.random() - 0.5) * 10,
      vy: -(9 + Math.random() * 14),
      r: 4 + Math.random() * 7,
      life: 0, max: 1.5 + Math.random() * 1.1
    });
  }
}

function updateTownHazard(dt) {
  const hz = townHazard();
  if (!hz || !state.running || state.gameOver) return;
  const vol = state.laharVolume / 100;
  if (vol <= 0.05) return;

  if (hz.key === 'boulders') {
    // --- PORAC: rocks rafted along in the flow ---
    state.hazardTimer -= dt;
    if (state.hazardTimer <= 0) {
      state.hazardTimer = 2.8 + Math.random() * 3.0;   // tuned: see BALANCE note below
      /* Only channels that are well underway can carry a boulder, and it
         enters at the HEAD of the reach rather than beside the flow front.
         Spawning it next to the front (as the first version did) gave the
         player no warning and left no room upstream to intercept it — the
         dike counter was unusable in practice. Entering at the top means
         the rock is visible for several seconds and any dike along the
         channel gets a chance to catch it. */
      const live = [];
      for (let i = 0; i < channelPaths.length; i++) {
        if ((state.laharProgresses[i] || 0) > 0.45) live.push(i);
      }
      if (live.length) {
        const ch = live[(Math.random() * live.length) | 0];
        /* Bigger and much slower than the first pass. A boulder is the one
           hazard the player can physically react to, so it has to be legible
           at a glance and give real time to respond. */
        state.boulders.push({
          ch, t: 0.06 + Math.random() * 0.10,
          spd: 0.026 + Math.random() * 0.022,     // roughly half the old speed
          r: 10 + Math.random() * 7,              // roughly double the old size
          rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 3.5,
          hit: false, caught: false, warn: 0
        });
      }
    }
    for (const b of state.boulders) {
      b.t += b.spd * dt;
      b.rot += b.spin * dt;
      // A boulder never outruns the flow front that is carrying it.
      b.t = Math.min(b.t, state.laharProgresses[b.ch] || 0);
      const p = pointAtProgress(channelPaths[b.ch], b.t, CHANNEL_LENS[b.ch]);
      if (!p) continue;
      b.x = p.x; b.y = p.y;
      /* A dike is a rock barrier, so it does what a real one does: it traps
         the boulder. This is the counter-play — read the channel, wall it,
         and the rock stops there instead of reaching your houses. */
      if (!b.hit && !b.caught) {
        for (const it of state.placedItems) {
          if (it.dead || it.type !== 'dam') continue;
          if (Math.hypot(it.x - b.x, it.y - b.y) < 34 + b.r) {
            b.caught = true;
            it.hp = Math.max(0, it.hp - 16);      // the dike wears taking the hit
            state.screenShake = Math.max(state.screenShake, 4);
            spawnImpactBurst(b.x, b.y, 0.6);
            playBoulderCatchSound();
            showToast('Dike caught a boulder!', 1200);
            break;
          }
        }
      }
      if (!b.hit && !b.caught) {
        for (const o of allStructures()) {
          if (o.lost) continue;
          if (Math.hypot(o.x - b.x, o.y - b.y) < 26 + b.r) {
            // A direct strike: a real, visible chunk of damage.
            /* BALANCE: at full strength (14 + r*1.6 ≈ 22-30) the hazards
               roughly doubled campaign losses and made every town
               unwinnable even with the channels sealed. They are tuned to
               add pressure and character, not to decide the run. */
            const dmg = (7 + b.r * 0.8) * (1 - slopeCover());
            o.hp = Math.max(0, o.hp - applyBarrierShield(o.x, o.y, dmg, 1));
            b.hit = true;
            o.shakeT = 1;
            state.screenShake = Math.max(state.screenShake, 6);
            spawnImpactBurst(b.x, b.y, 0.8);
            playSfx('rock_crash', playBoulderSmashSound);   // recorded, synth fallback
            if (o.hp <= 0) {
              o.lost = true; refreshStatusDots();
              // The crash already sounded on impact; the collapse follows it.
              setTimeout(() => playSfx('house_destroyed'), 180);
              showToast('Boulder strike — ' + (o.label || 'a house') + ' destroyed!', 1600);
            }
            break;
          }
        }
      }
    }
    state.boulders = state.boulders.filter(b => b.t < 0.995 && !b.hit && !b.caught);

  } else if (hz.key === 'burial') {
    /* --- BACOLOR: the ground itself rises ---
       Aggradation, not impact. The line climbs with the volume of mud that
       has come down, and everything behind it is being buried. */
    /* How far up the map the deposit climbs. Bacolor's houses sit low and
       spread, so a line that reached ~790 put almost the whole town under
       it at once and the map became unwinnable however well it was played.
       Capped lower: the mud takes the lowest streets, not the town. */
    const target = 960 - (960 - 545) * Math.min(1, vol * 0.20);
    state.burialLevel = state.burialLevel
      ? state.burialLevel + (Math.min(state.burialLevel, target) - state.burialLevel) * dt * 0.35
      : 958;
    for (const o of allStructures()) {
      if (o.lost || o.y < state.burialLevel) continue;
      // Slow, relentless, and it ignores barriers — you cannot wall out a
      // rising ground level, only outlast it.
      /* Damage scales with DEPTH, not merely with being past the line: a
         building the mud has just reached is barely touched, one long
         submerged is being crushed. That is how aggradation actually works,
         and it makes the hazard self-limiting — the line has to keep
         climbing to keep hurting, instead of every structure below it
         taking a flat rate the moment it is crossed.

         It deliberately ignores barriers — you cannot wall out a rising
         ground level. Reforested slopes DO reduce it, which is the one real
         defence against aggradation, and the historically true one. */
      const depth = Math.min(1, (o.y - state.burialLevel) / 130);
      /* Slope cover counts DOUBLE against burial. Aggradation is a sediment
         problem, so the tool that reduces sediment at source is the answer —
         and it needs to be worth the money, or the hazard has no counter at
         all. A fully reforested catchment cuts the burial rate to ~16%. */
      const treeGuard = Math.max(0, 1 - slopeCover() * 2);
      o.hp = Math.max(0, o.hp - 1.15 * depth * dt * CONTACT_DAMAGE_SCALE * treeGuard);
      if (o.hp <= 0) {
        o.lost = true; o.shakeT = 1; refreshStatusDots();
        playSfx('house_destroyed');
        spawnImpactBurst(o.x, o.y - 6, 0.7);
        showToast('Buried — ' + (o.label || 'a house') + ' is gone.', 1500);
      }
    }

  } else if (hz.key === 'bridgeScour') {
    /* --- ANGELES: pier scour on the Abacan bridge ---
       The 1991 lahars down the Abacan destroyed this crossing, and it is by
       far the most visible thing on the Angeles map: a full-width deck with
       traffic running over it. Attacking it directly gives the player a
       hazard they cannot miss, unlike the bank collapses that happened off
       at the edges of the screen.

       The counter is spatial and readable: barriers placed in the channel
       UPSTREAM of the bridge take the force before it reaches the piers. */
    const br = state.bridge;
    if (!br || br.lost) return;
    // Only bites while mud is actually passing beneath the deck.
    let underway = 0;
    for (let i = 0; i < channelPaths.length; i++) {
      const prog = state.laharProgresses[i] || 0;
      if (prog <= 0) continue;
      const p = pointAtProgress(channelPaths[i], prog, CHANNEL_LENS[i]);
      if (p && p.y > br.y - 40) underway++;
    }
    if (!underway) return;

    // Shielding: anything built in the channel above the bridge absorbs it.
    let shield = 0;
    for (const it of state.placedItems) {
      if (it.dead) continue;
      const above = br.y - it.y;                       // upstream of the deck
      if (above > 8 && above < 190 && Math.abs(it.x - br.x) < 300) {
        shield += (it.type === 'dam' ? 0.3 : it.type === 'sandbag' ? 0.12 : 0.08);
      }
    }
    shield = Math.min(0.78, shield);

    const rate = 1.9 * vol * (1 - shield) * (1 - slopeCover());
    const before = br.hp;
    br.hp = Math.max(0, br.hp - rate * dt * CONTACT_DAMAGE_SCALE);

    // Staged warnings, so the failure is never a surprise.
    state.bridgeWarn = state.bridgeWarn || {};
    const warnAt = (limit, msg) => {
      if (before > limit && br.hp <= limit && !state.bridgeWarn[limit]) {
        state.bridgeWarn[limit] = true;
        showToast(msg, 2600);
        state.screenShake = Math.max(state.screenShake, 5);
      }
    };
    warnAt(70, '⚠ The ground under the bridge is washing away — build above it!');
    warnAt(40, '⚠ The bridge is about to collapse!');

    if (br.hp <= 0 && !br.lost) {
      br.lost = true;
      br.shakeT = 1;
      state.screenShake = Math.max(state.screenShake, 16);
      // A span going down is a big event: dust and debris the width of it.
      for (let i = -2; i <= 2; i++) spawnImpactBurst(br.x + i * 46, br.y + 6, 1.35);
      playSound('place-dam');
      refreshStatusDots();
      showToast('The Abacan bridge has collapsed into the river!', 3200);
    }
  }
}

function updateCollapseDust(dt) {
  const d = state.dust;
  if (!d || !d.length) return;
  for (const p of d) {
    p.life += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'chunk') { p.vy += 300 * dt; p.rot += p.spin * dt; }
    else if (p.kind === 'ember') {
      // Rises, slows, drifts. No gravity: hot gas carries it upward.
      p.vy += 14 * dt;
      p.vx += Math.sin(p.life * 6 + p.x) * 7 * dt;
    } else if (p.kind === 'steam') {
      p.vy += 3 * dt;
      p.vx *= (1 - dt * 0.7);
      p.r += 9 * dt;
    }
    else { p.vy += 10 * dt; p.vx *= (1 - dt * 1.3); p.r += 15 * dt; }
  }
  state.dust = d.filter(p => p.life < p.max);
}

/* Shows what the trees are buying. Without this the slope-cover bonus is
   invisible arithmetic and the tool feels dead again — the player has to
   SEE the number climb as each sapling matures. Also marks the planting
   line while a tree is armed, so the rule is discoverable. */
function drawSlopeCoverHUD(context) {
  const cover = slopeCover();
  const arming = selectedTool === 'tree';
  if (cover <= 0.001 && !arming) return;

  if (arming) {
    // Dashed line showing where trees start counting as slope cover.
    context.save();
    context.setLineDash([9, 7]);
    context.strokeStyle = 'rgba(122, 200, 120, 0.85)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(10, SLOPE_COVER_LINE);
    context.lineTo(W - 10, SLOPE_COVER_LINE);
    context.stroke();
    context.setLineDash([]);
    context.font = "800 12px Nunito, sans-serif";
    context.fillStyle = 'rgba(122, 200, 120, 0.95)';
    context.textAlign = 'center';
    context.fillText('PLANT ABOVE THIS LINE TO WEAKEN THE MUD', W / 2, SLOPE_COVER_LINE - 7);
    context.restore();
  }

  if (cover <= 0.001) return;

  /* ---- SLOPE COVER READOUT ----
     Redesigned from a flat dark box with a thin fill bar. Two problems with
     that: it sat at y300, inside the toast band (211-313), so a message
     could land straight on top of it; and a continuous bar told the player
     how full the meter was but not how many more TREES that meant, which is
     the only number they can act on.

     Now: one pip per tree needed to reach the cap, so "three pips left" is
     three more trees. Styled like the HUD panels — cream outline, moulded
     face, gloss.

     Placement: measured against the real toast bounds rather than assumed.
     The longest message (the hazard brief) runs y211-380 across x135-405,
     so a centred readout was completely buried behind it. This sits in the
     left margin the toast never reaches. */
  const pct = Math.round(cover * 100);
  const full = cover >= MAX_SLOPE_COVER - 0.001;
  const pips = Math.round(MAX_SLOPE_COVER / TREE_COVER_EACH);     // 7
  const litExact = cover / TREE_COVER_EACH;                        // fractional
  const bw = 124, bh = 42, bx = 8, by = 300;   // left of the toast's x135 edge
  const pulse = 0.5 + Math.sin(ambientTime * 3.2) * 0.5;

  context.save();

  // Card face
  const g = context.createLinearGradient(0, by, 0, by + bh);
  if (full) { g.addColorStop(0, '#5a4a18'); g.addColorStop(1, '#2f2608'); }
  else      { g.addColorStop(0, '#24401f'); g.addColorStop(1, '#14240f'); }
  context.fillStyle = g;
  roundRectCtx(context, bx, by, bw, bh, 12); context.fill();

  // Cream outline, brightening to gold once the catchment is fully covered
  context.lineWidth = 2.5;
  context.strokeStyle = full ? `rgba(255,214,110,${0.75 + pulse * 0.25})` : 'rgba(250,247,235,0.8)';
  roundRectCtx(context, bx, by, bw, bh, 12); context.stroke();

  // Gloss over the top half
  context.globalAlpha = 0.16;
  context.fillStyle = '#ffffff';
  roundRectCtx(context, bx + 3, by + 2.5, bw - 6, bh * 0.42, 9); context.fill();
  context.globalAlpha = 1;

  // Row 1: glyph, label and value
  context.textBaseline = 'middle';
  context.font = "15px Nunito, sans-serif";
  context.textAlign = 'left';
  context.fillText('\u{1F333}', bx + 6, by + 13);

  context.font = "800 10px Nunito, sans-serif";
  context.fillStyle = full ? 'rgba(255,229,160,0.9)' : 'rgba(190,225,185,0.85)';
  context.fillText('SLOPE', bx + 26, by + 13);

  context.font = "900 15px Nunito, sans-serif";
  context.fillStyle = full ? '#ffe9a8' : '#d8f5cf';
  context.textAlign = 'right';
  context.fillText(full ? 'MAX' : pct + '%', bx + bw - 7, by + 13);

  /* One pip per tree. A partly grown sapling part-fills its own pip, so the
     player can watch a tree mature into the meter. */
  const px0 = bx + 6, pw = (bw - 12) / pips, ph = 8, py = by + bh - 14;
  for (let i = 0; i < pips; i++) {
    const x = px0 + i * pw;
    const w = pw - 3;
    context.fillStyle = 'rgba(0,0,0,0.38)';
    roundRectCtx(context, x, py, w, ph, 3); context.fill();
    const fillAmt = Math.max(0, Math.min(1, litExact - i));
    if (fillAmt > 0) {
      context.fillStyle = full ? '#ffd166' : '#6ee27f';
      roundRectCtx(context, x, py, w * fillAmt, ph, 3); context.fill();
      context.globalAlpha = 0.5;
      context.fillStyle = '#ffffff';
      roundRectCtx(context, x + 1, py + 1, Math.max(0, w * fillAmt - 2), 2, 1); context.fill();
      context.globalAlpha = 1;
    }
  }
  context.restore();
}

/* Each hazard has to be SEEN, or it just reads as unexplained damage.
   Drawn after the buildings so boulders roll in front of the town, and the
   burial line reads as ground rising over it. */
function drawTownHazard(context) {
  const hz = townHazard();
  if (!hz) return;

  if (hz.key === 'boulders') {
    for (const b of state.boulders) {
      if (b.x === undefined) continue;
      /* Read-at-a-glance treatment. Mud is brown and busy, so a brown rock
         on it was almost invisible. Each boulder now gets a dark contact
         shadow, a warm high-contrast body with a hard outline, a lit top
         face, and a pulsing amber ring — the ring is the important part: it
         separates the rock from the flow no matter what is behind it. */
      const pulse = 0.55 + Math.sin(ambientTime * 6 + b.rot) * 0.45;

      // Threat ring
      context.save();
      context.globalAlpha = 0.35 + pulse * 0.35;
      context.strokeStyle = '#ffb703';
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(b.x, b.y, b.r + 7 + pulse * 3, 0, Math.PI * 2);
      context.stroke();
      context.restore();

      // Churned wake pushed ahead of the rock
      context.save();
      context.globalAlpha = 0.4;
      context.fillStyle = '#d8cbb0';
      context.beginPath();
      context.ellipse(b.x, b.y + b.r * 0.8, b.r * 1.7, b.r * 0.55, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();

      context.save();
      context.translate(b.x, b.y);
      context.rotate(b.rot);
      // Angular body, light enough to stand off the mud.
      context.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const rr = b.r * (0.76 + ((i * 53) % 13) / 30);
        const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
        i ? context.lineTo(px, py) : context.moveTo(px, py);
      }
      context.closePath();
      const g = context.createLinearGradient(0, -b.r, 0, b.r);
      g.addColorStop(0, '#b9ae99');
      g.addColorStop(0.55, '#8d8271');
      g.addColorStop(1, '#5b5346');
      context.fillStyle = g;
      context.fill();
      context.strokeStyle = '#37312a';       // hard outline for separation
      context.lineWidth = 2;
      context.stroke();
      // Lit top face and a couple of fracture lines so it reads as stone.
      context.globalAlpha = 0.5;
      context.fillStyle = '#e4dccb';
      context.beginPath();
      context.ellipse(-b.r * 0.22, -b.r * 0.34, b.r * 0.42, b.r * 0.26, -0.4, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 0.35;
      context.strokeStyle = '#4a4238';
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(-b.r * 0.5, b.r * 0.1); context.lineTo(b.r * 0.15, -b.r * 0.35);
      context.moveTo(b.r * 0.1, b.r * 0.5);  context.lineTo(b.r * 0.55, -b.r * 0.05);
      context.stroke();
      context.restore();
    }

  } else if (hz.key === 'burial' && state.burialLevel && state.burialLevel < 950) {
    const y = state.burialLevel;
    context.save();
    // The deposit itself, filling everything below the line.
    const g = context.createLinearGradient(0, y - 10, 0, H);
    g.addColorStop(0, 'rgba(150,138,116,0.0)');
    g.addColorStop(0.14, 'rgba(139,127,105,0.55)');
    g.addColorStop(1, 'rgba(104,94,76,0.75)');
    context.fillStyle = g;
    context.beginPath();
    context.moveTo(0, y + Math.sin(ambientTime * 0.6) * 2);
    for (let x = 0; x <= W; x += 30) {
      context.lineTo(x, y + Math.sin(x * 0.02 + ambientTime * 0.6) * 4);
    }
    context.lineTo(W, H); context.lineTo(0, H);
    context.closePath(); context.fill();
    // A bright leading edge so the rise is easy to track.
    context.strokeStyle = 'rgba(214,201,175,0.5)';
    context.lineWidth = 2;
    context.beginPath();
    for (let x = 0; x <= W; x += 30) {
      const yy = y + Math.sin(x * 0.02 + ambientTime * 0.6) * 4;
      x ? context.lineTo(x, yy) : context.moveTo(x, yy);
    }
    context.stroke();
    context.restore();

  } else if (hz.key === 'bridgeScour') {
    /* The hazard has to be legible ON the bridge itself, which is why this
       replaced the old bank collapses — those happened at the screen edges
       and players simply never saw them. */
    const br = state.bridge;
    if (!br) return;
    const hurt = br.lost ? 1 : 1 - br.hp / 100;
    if (hurt < 0.12) return;
    const pulse = 0.5 + Math.sin(ambientTime * 5) * 0.5;

    // Scour churn boiling around each pier, growing as the damage does.
    for (let i = -2; i <= 2; i++) {
      const px = br.x + i * 92;
      if (px < -20 || px > W + 20) continue;
      context.save();
      context.globalAlpha = 0.25 + hurt * 0.4;
      context.fillStyle = '#b9a98a';
      context.beginPath();
      context.ellipse(px, br.y + 34, 16 + hurt * 16 + pulse * 4,
                      6 + hurt * 5, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    /* Warning treatment. A full-width colour wash over the deck (the first
       attempt) buried the bridge art and the label vanished behind the
       houses. Now: thin pulsing edge strips that frame the deck without
       hiding it, and the label on its own dark pill so it stays readable
       over whatever is behind it. */
    if (!br.lost && hurt > 0.3) {
      const warnCol = hurt > 0.6 ? '#e5484d' : '#ffb703';
      context.save();
      context.globalAlpha = 0.35 + pulse * 0.45 * hurt;
      context.fillStyle = warnCol;
      context.fillRect(0, br.y - 30, W, 4);
      context.fillRect(0, br.y + 26, W, 4);
      context.restore();

      const label = hurt > 0.6 ? 'BRIDGE FAILING — SHIELD PIERS UPSTREAM'
                               : 'SCOUR AT THE BRIDGE PIERS';
      context.save();
      context.font = "900 14px Nunito, sans-serif";
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const tw = context.measureText(label).width;
      const bx = W / 2 - tw / 2 - 12, by = br.y - 62;
      context.globalAlpha = 0.9;
      context.fillStyle = 'rgba(24,18,12,0.86)';
      roundRectCtx(context, bx, by, tw + 24, 24, 12); context.fill();
      context.globalAlpha = 0.55 + pulse * 0.45;
      context.strokeStyle = warnCol; context.lineWidth = 2;
      roundRectCtx(context, bx, by, tw + 24, 24, 12); context.stroke();
      context.globalAlpha = 1;
      context.fillStyle = hurt > 0.6 ? '#ffd7d7' : '#ffe9b8';
      context.fillText(label, W / 2, by + 12);
      context.restore();
    }

    // Once it is gone, show the gap: a dropped span and its rubble.
    if (br.lost) {
      context.save();
      context.globalAlpha = 0.85;
      context.fillStyle = '#3c4048';
      context.beginPath();
      context.moveTo(br.x - 88, br.y - 6);
      context.lineTo(br.x + 20, br.y + 26);
      context.lineTo(br.x + 26, br.y + 40);
      context.lineTo(br.x - 92, br.y + 10);
      context.closePath(); context.fill();
      context.globalAlpha = 0.5;
      context.fillStyle = '#6b6f76';
      for (let i = 0; i < 9; i++) {
        const rx = br.x - 70 + i * 17, ry = br.y + 26 + ((i * 29) % 13);
        context.beginPath(); context.ellipse(rx, ry, 5 + (i % 3) * 2, 3.4, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.restore();
    }
  }
}

function drawCollapseDust(context) {
  const d = state.dust;
  if (!d || !d.length) return;
  context.save();
  for (const p of d) {
    const t = p.life / p.max;
    if (p.kind === 'ember') {
      // Bright core with a soft halo — the halo is what sells the heat.
      const fade = 1 - t;
      context.globalAlpha = fade * 0.85;
      const eg = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3.4);
      eg.addColorStop(0, 'rgba(255,214,140,0.95)');
      eg.addColorStop(0.35, 'rgba(255,120,30,0.55)');
      eg.addColorStop(1, 'rgba(200,50,0,0)');
      context.fillStyle = eg;
      context.beginPath(); context.arc(p.x, p.y, p.r * 3.4, 0, Math.PI * 2); context.fill();
      context.globalAlpha = fade;
      context.fillStyle = '#ffd9a0';
      context.beginPath(); context.arc(p.x, p.y, p.r, 0, Math.PI * 2); context.fill();
      continue;
    }
    if (p.kind === 'steam') {
      // Dark ash-laden steam, lit faintly from beneath by the flow.
      context.globalAlpha = (1 - t) * 0.3;
      const sg = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      sg.addColorStop(0, 'rgba(120,96,86,0.8)');
      sg.addColorStop(0.5, 'rgba(78,64,58,0.45)');
      sg.addColorStop(1, 'rgba(50,40,36,0)');
      context.fillStyle = sg;
      context.beginPath(); context.arc(p.x, p.y, p.r, 0, Math.PI * 2); context.fill();
      continue;
    }
    if (p.kind === 'dust') {
      context.globalAlpha = (1 - t) * 0.5;
      const g = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, 'rgba(214,205,188,0.95)');
      g.addColorStop(1, 'rgba(150,138,120,0)');
      context.fillStyle = g;
      context.beginPath(); context.arc(p.x, p.y, p.r, 0, Math.PI * 2); context.fill();
    } else {
      context.globalAlpha = 1 - t * t;
      context.save();
      context.translate(p.x, p.y); context.rotate(p.rot);
      context.fillStyle = '#6b5f4e';
      context.fillRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4);
      context.restore();
    }
  }
  context.restore();
}

/* ---------------- SCORING ----------------
   Converts the end-of-round state into a single comparable number.
   Structures contribute proportionally to their REMAINING hp (not just
   survived/lost), so keeping a house at 90% health scores better than
   limping across the finish line at 5% — rewarding early, decisive
   defense over last-second scraping-by. Leftover budget and the best
   combo streak reached both nudge the number too, so score reflects the
   whole run, not just the win/lose outcome. */
/* ---- SCORING ----
   The old formula simply added up every structure's remaining HP, which
   meant the score was governed by how many buildings a town happened to
   have: Angeles (24 houses) could bank 2400 points where Porac (11) could
   not clear 1100, against the same absolute grade thresholds. Angeles was
   nearly a guaranteed S and Porac nearly unreachable, and leaderboard
   entries from different towns were not comparable at all.

   Score is now built from NORMALISED components, so every town is marked
   out of the same 1100 and a result means the same thing everywhere:

     Preservation  0-550   share of the town's total structure HP left,
                           with landmarks weighted above ordinary houses
     Progress      0-240   80 per storm survived
     Efficiency    0-110   budget left unspent as a share of the cap
     Technique     0-100   best rapid-deployment combo
     Flawless      +100    nothing lost at all
*/
function scoreBreakdown() {
  // Weighted HP: landmarks matter more than a single house, but the total
  // is divided by the same weights so the result is always a 0-1 fraction.
  let got = 0, max = 0;
  const add = (obj, weight) => { if (!obj) return; max += weight; got += (obj.hp / 100) * weight; };
  state.houses.forEach(h => add(h, 1));
  add(state.school, 2.5); add(state.church, 3); add(state.robot, 2.5);
  add(state.monument, 2.5); add(state.bridge, 2.5); add(state.creekBridge, 2);
  (state.props || []).forEach(p => add(p, 2));
  const preservation = max > 0 ? got / max : 0;

  const wavesSurvived = Math.min(WAVE_ORDER.length, state.waveIndex + (state.gameWon ? 1 : 0));
  const technique = Math.min(1, (state.maxCombo || 0) / 6);

  /* FLAWLESS now counts EVERY structure, not just houses. It only looked at
     state.houses, so destroying the church and keeping the bonus scored
     HIGHER than losing a single ordinary home — 925 against 875. The most
     valuable building in town was effectively free to lose. */
  const lostAny = allStructures().some(o => o.lost);

  /* EFFICIENCY rewarded leftover money, which meant the game paid you for
     NOT defending: a perfect win cost 110 points if you spent your budget,
     and a player who never placed a tool still banked the full 110. It now
     requires a real defence to count at all, and it is worth less than a
     single landmark so it can never outweigh actually saving the town. */
  const spent = (state.placedItems || [])
    .reduce((sum, i) => sum + ((TOOL_DEFS[i.type] || {}).price || 0), 0);
  const defended = spent >= (TOOL_DEFS.dam ? TOOL_DEFS.dam.price : 750000);
  const efficiency = (defended && state.budgetMax > 0)
    ? Math.min(1, state.budget / state.budgetMax) : 0;

  const parts = {
    preservation: Math.round(preservation * 600),   // was 550
    progress:     wavesSurvived * 80,
    efficiency:   Math.round(efficiency * 60),      // was 110
    technique:    Math.round(technique * 100),
    flawless:     lostAny ? 0 : 100
  };
  parts.total = parts.preservation + parts.progress + parts.efficiency + parts.technique + parts.flawless;
  parts.preservationPct = preservation;
  parts.wavesSurvived = wavesSurvived;
  return parts;
}

function computeFinalScore() { return scoreBreakdown().total; }

// Thresholds are now a share of the same 1000-point ceiling for every town.
/* The letter reflects performance, but the LABEL has to reflect the
   outcome. A losing run that scored 436 was being told "Village Survived",
   which is simply untrue — the town fell. Losses now get their own wording
   at every grade, so the summary never contradicts the result. */
function scoreGrade(score, won) {
  const lost = won === false;
  if (score >= 880) return { grade: 'S', label: lost ? 'Fought to the Last' : 'Master Engineer' };
  if (score >= 720) return { grade: 'A', label: lost ? 'Held Most of the Town' : 'Excellent Response' };
  if (score >= 560) return { grade: 'B', label: lost ? 'A Hard Fight' : 'Solid Defense' };
  if (score >= 380) return { grade: 'C', label: lost ? 'The Town Fell' : 'Village Survived' };
  return { grade: 'D', label: lost ? 'Overwhelmed' : 'Heavy Losses' };
}

/* ---- EARNED TITLES ----
   A letter grade says how well you did; a title says WHAT you did. These
   are awarded for specific, recognisable feats so two players with the
   same score can still have played very differently — and so a losing run
   can still be credited for the thing it did well. */

/* ============================================================
   DRAWN UI ICONS
   ------------------------------------------------------------
   Inline SVG for everything the interface used to draw with
   emoji. Emoji come from whichever font the OS ships, so the
   same screen looked different across Windows 10, Windows 11
   and Android, and anything newer than Unicode 12 rendered as
   an empty box on older Windows 10 builds. These ship with the
   page: identical everywhere, sharp at any DPI, and on-palette.
   ============================================================ */
const UI_ICON = {
  trophy: "<path d='M7 3h10v5a5 5 0 0 1-10 0z' fill='#ffd25e' stroke='#8a5a12' stroke-width='1.7' stroke-linejoin='round'/><path d='M7 4.5H4.2v1.8A3.2 3.2 0 0 0 7.4 9.5M17 4.5h2.8v1.8a3.2 3.2 0 0 1-3.2 3.2' fill='none' stroke='#8a5a12' stroke-width='1.7'/><path d='M10.5 13h3v3.5h-3z' fill='#e0a52e' stroke='#8a5a12' stroke-width='1.5'/><path d='M7.5 20.5h9l-1-3.5h-7z' fill='#ffd25e' stroke='#8a5a12' stroke-width='1.7' stroke-linejoin='round'/>",
  shield: "<path d='M12 2.5 20 5.4v6.2c0 5-3.4 8.7-8 9.9-4.6-1.2-8-4.9-8-9.9V5.4z' fill='#cfe0f2' stroke='#3c5f88' stroke-width='1.7' stroke-linejoin='round'/><path d='M8.4 12.2l2.6 2.6 4.8-5' fill='none' stroke='#3c5f88' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>",
  temple: "<path d='M12 2.6 22 7.4H2z' fill='#e8dfc9' stroke='#6b5a34' stroke-width='1.6' stroke-linejoin='round'/><path d='M4.6 9h2.2v8H4.6zM10.9 9h2.2v8h-2.2zM17.2 9h2.2v8h-2.2z' fill='#f2eada' stroke='#6b5a34' stroke-width='1.4'/><path d='M2 18.6h20V21H2z' fill='#e8dfc9' stroke='#6b5a34' stroke-width='1.6' stroke-linejoin='round'/>",
  money: "<path d='M6 8h12a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z' fill='#cbe6c4' stroke='#2f6b34' stroke-width='1.7'/><path d='M9.4 4.4 12 7.9l2.6-3.5' fill='none' stroke='#2f6b34' stroke-width='1.7' stroke-linecap='round'/><path d='M12 11v6M10 12.6h3.4a1.4 1.4 0 0 1 0 2.8H10' fill='none' stroke='#2f6b34' stroke-width='1.7' stroke-linecap='round'/>",
  storm: "<path d='M6.6 11.4a4 4 0 0 1 .8-7.9 5.2 5.2 0 0 1 9.8 1.2 3.8 3.8 0 0 1-.6 7.5z' fill='#c3cddb' stroke='#4a5a70' stroke-width='1.6' stroke-linejoin='round'/><path d='M12.6 12.4 9.4 17h3l-1.4 4.4L15 15.6h-3z' fill='#ffd25e' stroke='#8a5a12' stroke-width='1.4' stroke-linejoin='round'/>",
  bolt: "<path d='M13.4 2 5 13.4h5.2L9.2 22 19 10.2h-5.4z' fill='#ffd25e' stroke='#8a5a12' stroke-width='1.7' stroke-linejoin='round'/>",
  tree: "<path d='M12 2.6 19 12h-3.6l3.2 5H5.4l3.2-5H5z' fill='#63a94e' stroke='#2f5d2a' stroke-width='1.7' stroke-linejoin='round'/><path d='M10.6 17h2.8v4.4h-2.8z' fill='#7a5230' stroke='#3f2b17' stroke-width='1.4'/>",
  wall: "<path d='M2.5 6.5h19v4h-19zM2.5 13.5h19v4h-19z' fill='#c9b79c' stroke='#6b4a18' stroke-width='1.6'/><path d='M9 6.5v4M15.5 6.5v4M5.6 13.5v4M12.4 13.5v4M18.8 13.5v4' stroke='#6b4a18' stroke-width='1.4'/>",
  sweat: "<circle cx='12' cy='12' r='9' fill='#ffd25e' stroke='#8a5a12' stroke-width='1.7'/><path d='M8.4 9.6h.02M15.6 9.6h.02' stroke='#8a5a12' stroke-width='2.6' stroke-linecap='round'/><path d='M8 15.4c2.4 1.8 5.6 1.8 8 0' fill='none' stroke='#8a5a12' stroke-width='1.8' stroke-linecap='round'/><path d='M19.4 6.6c1.4 2 1.4 3.4 0 3.4s-1.4-1.4 0-3.4z' fill='#7fc4e8' stroke='#33698c' stroke-width='1.2'/>",
  muscle: "<path d='M3.5 13.5c0-3.4 2.6-5.4 5.6-5.4 1.8 0 2.6-1 2.6-2.6L15 6.4c2.8.8 5.5 3 5.5 6.6 0 4-3.2 6.8-7.6 6.8-5 0-9.4-2.2-9.4-6.3z' fill='#f3c08a' stroke='#8a5a12' stroke-width='1.7' stroke-linejoin='round'/><path d='M8.6 12.6c1.8-1 3.6-1 5 .4' fill='none' stroke='#8a5a12' stroke-width='1.6' stroke-linecap='round'/>",
  wave: "<path d='M2 15c2.4 0 2.4-2 4.8-2s2.4 2 4.8 2 2.4-2 4.8-2 2.4 2 4.8 2' fill='none' stroke='#4d86c4' stroke-width='2.4' stroke-linecap='round'/><path d='M2 20c2.4 0 2.4-2 4.8-2s2.4 2 4.8 2 2.4-2 4.8-2 2.4 2 4.8 2' fill='none' stroke='#7fb2e8' stroke-width='2.2' stroke-linecap='round'/><path d='M12 10V3M12 3 8.8 6.4M12 3l3.2 3.4' fill='none' stroke='#4d86c4' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/>",
  party: "<path d='M3 21 8.6 8.2 15.8 15.4z' fill='#ffd25e' stroke='#8a5a12' stroke-width='1.7' stroke-linejoin='round'/><circle cx='18.4' cy='5.6' r='1.5' fill='#e8584b'/><circle cx='21' cy='11' r='1.3' fill='#63a94e'/><circle cx='13.6' cy='3.4' r='1.3' fill='#4d86c4'/>",
  cross: "<circle cx='12' cy='12' r='9.2' fill='#e8584b' stroke='#7d241c' stroke-width='1.7'/><path d='M8.4 8.4l7.2 7.2M15.6 8.4l-7.2 7.2' stroke='#fff0ec' stroke-width='2.4' stroke-linecap='round'/>",
  note: "<path d='M10 17.5V5.2l8-1.7v11.4' fill='none' stroke='#e9eef5' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/><ellipse cx='7.6' cy='17.6' rx='3.1' ry='2.5' fill='#e9eef5'/><ellipse cx='15.6' cy='15.6' rx='3.1' ry='2.5' fill='#e9eef5'/>",
  speaker: "<path d='M4 9.5h3.4L12 5.4v13.2L7.4 14.5H4z' fill='#e9eef5' stroke='#cfd7e2' stroke-width='1.2' stroke-linejoin='round'/><path d='M15.2 9a4.6 4.6 0 0 1 0 6M17.8 6.6a8 8 0 0 1 0 10.8' fill='none' stroke='#e9eef5' stroke-width='1.9' stroke-linecap='round'/>",
  speakerLow: "<path d='M4 9.5h3.4L12 5.4v13.2L7.4 14.5H4z' fill='#e9eef5' stroke='#cfd7e2' stroke-width='1.2' stroke-linejoin='round'/><path d='M15.2 9a4.6 4.6 0 0 1 0 6' fill='none' stroke='#e9eef5' stroke-width='1.9' stroke-linecap='round'/>",
  mute: "<path d='M4 9.5h3.4L12 5.4v13.2L7.4 14.5H4z' fill='#f2c7c2' stroke='#a3301c' stroke-width='1.2' stroke-linejoin='round'/><path d='M15.4 9.4l5 5.2M20.4 9.4l-5 5.2' stroke='#a3301c' stroke-width='2.1' stroke-linecap='round'/>",
  pin: "<path d='M12 22s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12z' fill='#e8584b' stroke='#7d241c' stroke-width='1.7' stroke-linejoin='round'/><circle cx='12' cy='9.6' r='2.7' fill='#fff0ec' stroke='#7d241c' stroke-width='1.3'/>",
  medal: "<circle cx='12' cy='14.6' r='6.4' fill='#ffd25e' stroke='#8a5a12' stroke-width='1.7'/><path d='M8.6 2.4 11 8.6M15.4 2.4 13 8.6' stroke='#4d86c4' stroke-width='2.4' stroke-linecap='round'/><circle cx='12' cy='14.6' r='3' fill='#f0b32e' stroke='#8a5a12' stroke-width='1.2'/>"
};
function uiIcon(name, extraClass) {
  const body = UI_ICON[name];
  if (!body) return '';
  return "<svg class='ui-ico" + (extraClass ? ' ' + extraClass : '') +
         "' viewBox='0 0 24 24' aria-hidden='true'>" + body + "</svg>";
}

function earnedTitles(won) {
  const t = [];
  const b = scoreBreakdown();
  const items = state.placedItems || [];
  const count = ty => items.filter(i => i.type === ty).length;
  const spent = items.reduce((sum, i) => sum + ((TOOL_DEFS[i.type] || {}).price || 0), 0);
  const landmarks = [state.church, state.school, state.robot, state.monument,
                     state.bridge, state.creekBridge].filter(Boolean)
                    .concat(state.props || []);
  const lostHouses = state.houses.filter(h => h.lost).length;
  const loseAt = townLoseThreshold(allStructures().length);

  if (won && lostHouses === 0)                      t.push({ icon: uiIcon('trophy'), name: 'Flawless Guardian',  desc: 'Not a single home lost' });
  if (won && b.preservationPct >= 0.9)              t.push({ icon: uiIcon('shield'), name: 'Master Engineer',    desc: 'Town left over 90% intact' });
  if (landmarks.length && landmarks.every(l => !l.lost))
                                                    t.push({ icon: uiIcon('temple'), name: 'Heritage Keeper',    desc: 'Every landmark still standing' });
  if (won && spent <= 2_000_000)                    t.push({ icon: uiIcon('money'), name: 'Thrifty Engineer',   desc: 'Won on a shoestring budget' });
  if (b.wavesSurvived >= WAVE_ORDER.length)         t.push({ icon: uiIcon('storm'), name: 'Storm Rider',        desc: 'Weathered all three storms' });
  if ((state.maxCombo || 0) >= 5)                   t.push({ icon: uiIcon('bolt'), name: 'Quick Hands',        desc: `${state.maxCombo}x rapid deployment` });
  if (count('tree') >= 4)                           t.push({ icon: uiIcon('tree'), name: 'Reforester',         desc: 'Rebuilt the slopes with trees' });
  if (count('dam') >= 4)                            t.push({ icon: uiIcon('wall'), name: 'Wall Builder',       desc: 'Sealed the channels with dikes' });
  if (won && lostHouses === loseAt - 1)             t.push({ icon: uiIcon('sweat'), name: 'Last Stand',         desc: 'Survived by a single house' });
  if (!won && b.preservationPct >= 0.6)             t.push({ icon: uiIcon('muscle'), name: 'Held the Line',      desc: 'Fought hard before the town fell' });
  if (!won && items.length === 0)                   t.push({ icon: uiIcon('wave'), name: 'Force of Nature',    desc: 'Faced the lahar with no defenses' });
  return t;
}

function renderEarnedTitles(won) {
  const card = document.getElementById('endCard');
  if (!card) return;
  let box = document.getElementById('earnedTitles');
  if (!box) {
    box = document.createElement('div');
    box.id = 'earnedTitles';
    const anchor = document.getElementById('endFactText');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor);
    else card.appendChild(box);
  }
  // Capped at three. Awarding seven at once both overflowed the card and
  // cheapened them — earnedTitles() is ordered by prestige, so the top of
  // that list is the run's headline achievement.
  const titles = earnedTitles(won).slice(0, 3);
  if (!titles.length) { box.innerHTML = ''; box.style.display = 'none'; return; }
  box.style.display = '';
  box.innerHTML = '<div class="et-head">Titles earned</div>' +
    titles.map(t =>
      `<div class="et-row"><span class="et-icon">${t.icon}</span>` +
      `<span class="et-text"><b>${t.name}</b><i>${t.desc}</i></span></div>`).join('');
}

/* ============================================================
   VICTORY CONFETTI
   ------------------------------------------------------------
   Drawn on its own canvas layered ABOVE the menu overlay, because
   the win card covers the screen — confetti on the game canvas
   would fall behind it and never be seen. The layer ignores
   pointer events so it can never block a button.

   Two phases, as requested: a burst the moment the result lands,
   then a steady drift that keeps falling while the card is up.
   ============================================================ */
const CONFETTI_COLORS = ['#f94144', '#f3722c', '#f8961e', '#f9c74f',
                         '#90be6d', '#43aa8b', '#577590', '#c77dff', '#fffdf6'];
let confettiCanvas = null, confettiCtx = null;
let confettiPieces = [], confettiRAF = null, confettiRunning = false, confettiLastT = 0;

function ensureConfettiLayer() {
  const stage = document.getElementById('gameWrap');
  if (confettiCanvas) {
    /* If the layer ever ended up on <body> — because gameWrap did not exist
       when the first win fired — it is sized to the whole DOCUMENT rather
       than the stage, so pieces spawn against document-sized bounds and
       spray outside the game frame. Re-home it once the stage exists. */
    if (stage && confettiCanvas.parentNode !== stage) stage.appendChild(confettiCanvas);
    return;
  }
  confettiCanvas = document.createElement('canvas');
  confettiCanvas.id = 'confettiLayer';
  (stage || document.body).appendChild(confettiCanvas);
  confettiCtx = confettiCanvas.getContext('2d');
}

function sizeConfettiLayer() {
  if (!confettiCanvas) return;
  const r = confettiCanvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pxW = Math.max(1, Math.round(r.width * dpr));
  const pxH = Math.max(1, Math.round(r.height * dpr));
  /* Only resize when it actually changed: assigning width/height wipes the
     canvas, so doing it unconditionally every frame would erase the frame
     halfway through drawing it. */
  if (confettiCanvas.width !== pxW || confettiCanvas.height !== pxH) {
    confettiCanvas.width = pxW;
    confettiCanvas.height = pxH;
  }
  confettiCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  confettiCanvas._w = r.width || W;
  confettiCanvas._h = r.height || H;
  confettiCanvas._dpr = dpr;
}

/* Shading a colour toward black gives each piece a believable "back face"
   for when it flips away from the viewer. */
function shadeConfetti(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * amount);
  const g = Math.round(((n >> 8) & 255) * amount);
  const b = Math.round((n & 255) * amount);
  return `rgb(${r},${g},${b})`;
}

function makeConfetto(x, y, vx, vy) {
  const color = CONFETTI_COLORS[(Math.random() * CONFETTI_COLORS.length) | 0];
  return {
    x, y, vx, vy,
    // Smaller and more varied than before: the old pieces were big enough
    // to overlap into solid blocks during the burst.
    w: 4 + Math.random() * 4,
    h: 6 + Math.random() * 5,
    rot: Math.random() * Math.PI * 2,          // in-plane tilt
    spin: (Math.random() - 0.5) * 3.2,         // slow tumble, not a blur
    flip: Math.random() * Math.PI * 2,         // rotation about its own long axis
    flipRate: 4 + Math.random() * 5,
    sway: 0.6 + Math.random() * 1.6,
    phase: Math.random() * Math.PI * 2,
    color,
    back: shadeConfetti(color, 0.62),
    life: 0
  };
}

function startConfetti() {
  ensureConfettiLayer();
  confettiCanvas.style.display = 'block';
  sizeConfettiLayer();
  const w = confettiCanvas._w, h = confettiCanvas._h;
  confettiPieces = [];
  /* ---- Phase 1: the burst ----
     The cannons used to sit at 12%/88% across and 72% DOWN the screen,
     firing inward — so both fans met in the middle and the whole burst
     collapsed into one clump just right of centre instead of covering the
     stage. They now sit in the bottom CORNERS and fire up and inward on a
     much wider arc at higher speed, so the streams arc right across the
     screen and cross near the top. */
  for (let side = 0; side < 2; side++) {
    const ox = side === 0 ? w * 0.04 : w * 0.96;
    const dir = side === 0 ? 1 : -1;
    for (let i = 0; i < 70; i++) {
      /* Angle and speed are sized to the stage rather than picked by eye.
         With gravity at 430px/s^2 a vertical component of ~840 just reaches
         the top of a 950px stage, so speeds are capped below that: the
         pieces arc inside the frame and fall back through it instead of
         rocketing off the top, which is what a 1260 top speed was doing. */
      const a = (-Math.PI / 2) + dir * (0.25 + Math.random() * 0.8);
      const sp = 430 + Math.random() * 330;
      confettiPieces.push(makeConfetto(
        ox + (Math.random() - 0.5) * 26, h * 0.97 + (Math.random() - 0.5) * 24,
        Math.cos(a) * sp, Math.sin(a) * sp));
    }
  }
  confettiRunning = true;
  confettiLastT = performance.now();
  /* Exactly one loop, ever. A second win, or re-entering the end screen,
     could previously start another while the first was still running, and
     two loops drawing between clears is one way to produce smeared trails. */
  if (confettiRAF) cancelAnimationFrame(confettiRAF);
  confettiRAF = requestAnimationFrame(stepConfetti);
}

function stopConfetti() {
  confettiRunning = false;
  confettiPieces = [];
  if (confettiRAF) { cancelAnimationFrame(confettiRAF); confettiRAF = null; }
  if (confettiCanvas) {
    confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
    confettiCanvas.style.display = 'none';
  }
}

function stepConfetti(now) {
  confettiRAF = null;
  if (!confettiCanvas) return;
  const dt = Math.min(0.05, (now - confettiLastT) / 1000);
  confettiLastT = now;
  // Follow the stage if it has been resized or re-letterboxed since the
  // last frame; sizeConfettiLayer only touches the buffer when it changed.
  sizeConfettiLayer();
  const w = confettiCanvas._w, h = confettiCanvas._h;

  // ---- Phase 2: keep a gentle fall going while the card is up.
  if (confettiRunning && confettiPieces.length < 170) {
    for (let i = 0; i < 3; i++) {
      confettiPieces.push(makeConfetto(Math.random() * w, -20,
        (Math.random() - 0.5) * 40, 60 + Math.random() * 90));
    }
  }

  /* Wipe under the IDENTITY transform, in raw device pixels. Clearing while
     a scale transform is active assumes that transform is exactly what we
     expect; if it is ever stale the wipe covers only part of the canvas and
     every frame leaves its pieces behind — which is precisely the vertical
     smearing seen here. Resetting first makes the wipe unconditional. */
  confettiCtx.setTransform(1, 0, 0, 1, 0, 0);
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  const _dpr = confettiCanvas._dpr || 1;
  confettiCtx.setTransform(_dpr, 0, 0, _dpr, 0, 0);

  for (const p of confettiPieces) {
    p.life += dt;
    p.vy += 430 * dt;                 // gravity
    p.vx *= (1 - dt * 1.1);           // air drag
    p.vy = Math.min(p.vy, 260);       // terminal velocity: paper, not stones
    p.x += (p.vx + Math.sin(p.life * 3 + p.phase) * 26 * p.sway) * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;

    /* Each piece is a flat ribbon turning about its own long axis. The
       scale factor is the SIGNED cosine of that turn, so it thins smoothly
       to edge-on and then opens out again showing its darker back face —
       a real flip. The previous version squashed by abs(cos(rot * 1.3)),
       which was desynced from the actual rotation and snapped at zero,
       which is what made the pieces look distorted. */
    p.flip += p.flipRate * dt;
    const flip = Math.cos(p.flip);
    confettiCtx.save();
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.rot);
    confettiCtx.scale(1, flip);
    confettiCtx.fillStyle = flip < 0 ? p.back : p.color;
    // Softly rounded corners read as paper rather than pixel blocks.
    const rr = Math.min(1.6, p.w * 0.3);
    if (confettiCtx.roundRect) {
      confettiCtx.beginPath();
      confettiCtx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, rr);
      confettiCtx.fill();
    } else {
      confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    confettiCtx.restore();
  }
  confettiPieces = confettiPieces.filter(p => p.y < h + 40 && p.life < 14);

  if (confettiRunning || confettiPieces.length) {
    confettiRAF = requestAnimationFrame(stepConfetti);
  }
}
window.addEventListener('resize', () => { if (confettiRunning) sizeConfettiLayer(); });

function endGame(won, text) {
  state.gameOver = true; state.running = false;
  state.gameWon = won;   // read by scoreBreakdown() for the progress component
  laharRainTrack.pause();
  /* Played after the rain stops, so the stinger lands in silence rather
     than fighting the storm loop it just replaced. */
  playSound(won ? 'victory' : 'defeat');
  if (won) startConfetti(); else stopConfetti();

  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('objectiveCard').style.display = 'none';
  document.getElementById('townCard').style.display = 'none';
  document.getElementById('infoCard').style.display = 'none';
  document.getElementById('endCard').style.display = 'block';
  // innerHTML, not textContent: the mark is now drawn SVG rather than an
  // emoji character, so it has to be parsed as markup.
  document.getElementById('endTitle').innerHTML = won
    ? uiIcon('party') + ' Village Saved!'
    : uiIcon('cross') + ' Village Lost';
  document.getElementById('endTitle').style.color = won ? '#4ade80' : '#f87171';
  document.getElementById('endDesc').textContent = text;

  // "Try Again" only makes sense after a loss — a win means the full
  // 3-wave campaign is already complete, so that button stays hidden and
  // only "Exit Game" is shown.
  const tryAgainBtn = document.getElementById('tryAgainBtn');
  if (tryAgainBtn) tryAgainBtn.style.display = won ? 'none' : 'inline-flex';

  // Final score, letter grade, and a random educational fact — gives the
  // end screen replay value (a number to beat) plus a last bit of teaching
  // content, without touching the win/lose logic itself.
  const score = computeFinalScore();
  const { grade, label } = scoreGrade(score, won);
  const scoreEl = document.getElementById('endScoreValue');
  const gradeEl = document.getElementById('endGradeBadge');
  const gradeLabelEl = document.getElementById('endGradeLabel');
  if (scoreEl) scoreEl.textContent = score;
  if (gradeEl) { gradeEl.textContent = grade; gradeEl.className = 'grade-badge grade-' + grade; }
  if (gradeLabelEl) gradeLabelEl.textContent = label;

  // ---- Leaderboard submission ----
  // Guarded so a single finished game can only ever be submitted once, even
  // if endGame() is somehow reached twice for the same run.
  if (!state.scoreSubmitted) {
    state.scoreSubmitted = true;
    const waveLabel = WAVE_LABELS[WAVE_ORDER[Math.min(state.waveIndex, WAVE_ORDER.length - 1)]] || 'Easy';
    lastResult = submitScore(playerName || 'Anonymous', score, gameSettings.town, waveLabel);
    renderRankResult(lastResult, won);
  }

  // ---- Earned titles ----
  // Shown beneath the score: the grade says how well, these say what.
  try { renderEarnedTitles(won); } catch (e) { /* cosmetic — never block the end screen */ }

  const factEl = document.getElementById('endFactText');
  if (factEl) factEl.textContent = LAHAR_FACTS[Math.floor(Math.random() * LAHAR_FACTS.length)];

}


/* ================================================================
   LEADERBOARD  —  persistent Top 10 high-score table
   ----------------------------------------------------------------
   Storage: localStorage, matching what the game already uses for the
   volume setting. This is an offline kiosk build with no backend, so
   adding server infrastructure would be unnecessary. Every read is
   defensive — a corrupted or hand-edited entry must never crash the
   game, so bad records are dropped and the rest still load.

   Scoring is NOT reimplemented: computeFinalScore() already exists and
   is used as-is. The game has no difficulty picker (every run is the
   same fixed Easy->Medium->Hard campaign), so instead of inventing one
   the board records how FAR the player got — the furthest wave reached
   — which is the honest source of difficulty context here.
   ================================================================ */
const LB_KEY = 'laharaya.leaderboard.v1';
const LB_MAX = 10;                 // never more than ten ranked players in any view
const LB_NAME_MAX = 14;
/* Each town keeps its own top ten in storage. If only the global top ten
   were stored, the best defender of a quieter town could be pushed off the
   board entirely by scores from elsewhere, leaving that town's tab empty
   or wrong. Storing per town costs almost nothing and makes each filter a
   real, complete ranking. The ALL view is derived from these. */
const LB_MAX_PER_TOWN = 10;

// Strip anything that could break the table or be used to inject markup;
// the name is rendered as text, but this keeps stored data clean too.
function sanitizeName(raw) {
  return String(raw == null ? '' : raw)
    .replace(/[<>&"'`\\]/g, '')       // markup / quoting characters
    .replace(/[\u0000-\u001F\u007F]/g, '')  // control characters
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LB_NAME_MAX);
}

function isValidEntry(e) {
  return e && typeof e === 'object'
    && typeof e.name === 'string' && e.name.length > 0
    && typeof e.score === 'number' && isFinite(e.score) && e.score >= 0 && e.score < 1e7;
}

function loadLeaderboard() {
  let raw = null;
  try { raw = localStorage.getItem(LB_KEY); } catch (e) { return []; }
  if (!raw) return [];
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return []; }   // corrupted -> start clean
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isValidEntry)
    .map(e => ({
      name: sanitizeName(e.name),
      score: Math.floor(e.score),
      town: typeof e.town === 'string' ? e.town : 'bacolor',
      wave: typeof e.wave === 'string' ? e.wave : 'Easy',
      date: typeof e.date === 'number' ? e.date : 0
    }))
    .filter(e => e.name.length > 0)
    .sort((a, b) => b.score - a.score || a.date - b.date);
}

// Trims to the best LB_MAX_PER_TOWN entries of each town before saving.
function saveLeaderboard(list) {
  const perTown = {};
  const kept = [];
  list.slice().sort((a, b) => b.score - a.score || a.date - b.date).forEach(e => {
    perTown[e.town] = (perTown[e.town] || 0) + 1;
    if (perTown[e.town] <= LB_MAX_PER_TOWN) kept.push(e);
  });
  try { localStorage.setItem(LB_KEY, JSON.stringify(kept)); }
  catch (e) { /* storage full or blocked — the session still plays fine */ }
}

/* The board for a given view.
   'all'  -> each player collapsed to their single best run across every
             town (so nobody occupies two places), top ten.
   a town -> that town's own top ten, ranked within the town, so its best
             defender is #1 there even if they sit lower overall.        */
function boardFor(filter) {
  const all = loadLeaderboard();
  if (filter && filter !== 'all') {
    return all.filter(e => e.town === filter).slice(0, LB_MAX);
  }
  const best = new Map();
  all.forEach(e => {
    const k = e.name.toLowerCase();
    const cur = best.get(k);
    if (!cur || e.score > cur.score) best.set(k, e);
  });
  return [...best.values()]
    .sort((a, b) => b.score - a.score || a.date - b.date)
    .slice(0, LB_MAX);
}

/* Submits a finished run and returns what the end screen needs to say.
   Rules:
     - one row per player: only their personal best is kept
     - the table is re-sorted and trimmed to ten every time
     - ties keep the earlier entry ranked higher (first to get there)  */
function submitScore(name, score, town, wave) {
  const clean = sanitizeName(name) || 'Anonymous';
  const pts = Math.max(0, Math.floor(Number(score) || 0));
  const list = loadLeaderboard();
  const key = clean.toLowerCase();

  // What the player had to beat, captured before the new run is merged in.
  const allBefore = boardFor('all');
  const townBefore = boardFor(town);
  const cutoff = allBefore.length >= LB_MAX ? allBefore[LB_MAX - 1].score : null;

  // One row per player PER TOWN: defending a different town is a separate
  // achievement, but replaying the same town only ever updates that row.
  const idx = list.findIndex(e => e.name.toLowerCase() === key && e.town === town);
  let personalBest = pts, improved = true;
  if (idx !== -1) {
    if (list[idx].score >= pts) { personalBest = list[idx].score; improved = false; }
    else list[idx] = { name: clean, score: pts, town, wave, date: Date.now() };
  } else {
    list.push({ name: clean, score: pts, town, wave, date: Date.now() });
  }

  saveLeaderboard(list);

  // Ranks are reported for both views, since a player can lead a town
  // without leading the combined board.
  const allNow = boardFor('all');
  const townNow = boardFor(town);
  const findIn = arr => arr.findIndex(e => e.name.toLowerCase() === key);
  const aRank = findIn(allNow), tRank = findIn(townNow);

  return {
    name: clean,
    score: pts,
    personalBest,
    improved,
    town,
    madeTop10: aRank !== -1,
    rank: aRank !== -1 ? aRank + 1 : null,
    townRank: tRank !== -1 ? tRank + 1 : null,
    isNewFirst: aRank === 0 && improved,
    isTownFirst: tRank === 0 && improved,
    cutoff,
    board: allNow
  };
}



/* Porac's concrete creek crossing, drawn live so it can show damage.
   Four states, matching every other structure in the game:
     0 Intact      - clean deck, blue/yellow provincial railings
     1 Damaged     - cracks, spalled concrete, a bent railing section
     2 Heavy       - deck sags, a hole punched through, railings gone in
                     places, rubble in the water below
     3 Collapsed   - the span is gone: broken stubs on each bank, the
                     deck slab tipped into the creek, dust still rising  */
function drawCreekBridge(context) {
  const b = state.creekBridge;
  if (!b) return;
  const stage = getDamageStage(b.hp, b.lost);
  const half = b.halfW + 26, deckW = 58;
  let shake = 0;
  if (b.shakeT > 0) { shake = Math.sin(state.time * 40) * 4 * b.shakeT; b.shakeT -= 0.04; }
  const bx = b.x + shake, cy = b.y;
  const L = bx - deckW / 2, R = bx + deckW / 2;

  context.save();

  // Shadow on the water (smaller once the span drops).
  context.globalAlpha = stage === 3 ? 0.18 : 0.34;
  context.fillStyle = '#0b1410';
  context.fillRect(L + 4, cy - half + 5, deckW, half * 2 * (stage === 3 ? 0.5 : 1));
  context.globalAlpha = 1;

  // Piers survive until the span drops, then become broken stubs.
  [-0.5, 0.5].forEach(f => {
    context.fillStyle = stage >= 2 ? '#7a736a' : '#8a8880';
    const py = cy + f * half * 0.95;
    if (stage === 3) {
      context.fillRect(L + 10, py - 5, deckW - 20, 10);   // snapped, narrower
    } else {
      context.fillRect(L + 7, py - 7, deckW - 14, 14);
      context.fillStyle = 'rgba(0,0,0,0.18)';
      context.fillRect(L + 7, py + 4, deckW - 14, 3);
    }
  });

  if (stage === 3) {
    // ---- Collapsed: stubs on the banks, slab tipped into the water.
    context.fillStyle = '#8e8c84';
    context.fillRect(L, cy - half, deckW, 22);            // bank stub
    context.fillRect(L, cy + half - 22, deckW, 22);       // far bank stub
    context.save();
    context.translate(bx, cy);
    context.rotate(0.22);
    context.fillStyle = '#7d7b73';
    context.fillRect(-deckW / 2 + 4, -14, deckW - 8, 26); // fallen slab
    context.restore();
    drawStructureDebris(context, bx, cy + half - 6, 3, 5150);
    drawGenericRubblePile(context, bx, cy + half, deckW * 0.7, 12, '#8a8880', '#77746c', 6161);
    for (let i = 0; i < 3; i++) {                          // dust still rising
      const t = (ambientTime * 0.4 + i / 3) % 1;
      context.globalAlpha = (1 - t) * 0.16;
      context.fillStyle = '#9a948a';
      context.beginPath();
      context.arc(bx + Math.sin(t * 4 + i) * 8, cy - 10 - t * 40, 8 + t * 14, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.restore();
    return;
  }

  // ---- Standing: deck slab, sagging as it fails.
  const sag = stage === 2 ? 5 : 0;
  const slab = context.createLinearGradient(L, 0, R, 0);
  slab.addColorStop(0,    stage >= 1 ? '#847f75' : '#8e8c84');
  slab.addColorStop(0.45, stage >= 2 ? '#a09b90' : (stage >= 1 ? '#aaa79d' : '#b3b1a8'));
  slab.addColorStop(1,    stage >= 1 ? '#7e7a71' : '#87857d');
  context.fillStyle = slab;
  context.fillRect(L, cy - half + sag * 0.5, deckW, half * 2 - sag);

  // Kerb lines.
  context.strokeStyle = 'rgba(90,88,80,0.75)';
  context.lineWidth = 2;
  [L + 9, R - 9].forEach(kx => {
    context.beginPath(); context.moveTo(kx, cy - half); context.lineTo(kx, cy + half); context.stroke();
  });

  if (stage >= 1) {
    drawCracks(context, L + 4, cy - half + 8, deckW - 8, half * 2 - 16, stage, 3131);
    context.globalAlpha = 0.22;                            // mud wash / spalling
    context.fillStyle = '#4a4034';
    context.fillRect(L, cy - half * 0.4, deckW, half * 0.8);
    context.globalAlpha = 1;
  }
  if (stage === 2) {
    // A hole punched clean through the deck, showing the water beneath.
    context.fillStyle = '#3d443a';
    context.beginPath();
    context.ellipse(bx + 6, cy + half * 0.25, deckW * 0.22, 12, 0.3, 0, Math.PI * 2);
    context.fill();
    drawStructureDebris(context, bx, cy + half - 4, 2, 5150);
  }

  // Painted railings — sections drop away as damage mounts.
  [-1, 1].forEach(side => {
    const rx = bx + side * (deckW / 2 - 4);
    const gapStart = stage === 2 ? 0.15 : (stage === 1 && side < 0 ? 0.55 : 2);
    context.strokeStyle = '#1f4fa8'; context.lineWidth = 5;
    context.beginPath(); context.moveTo(rx, cy - half - 3);
    context.lineTo(rx, cy - half + (half * 2) * Math.min(1, gapStart)); context.stroke();
    if (gapStart < 1) {   // the remaining span past the missing section
      context.beginPath();
      context.moveTo(rx, cy - half + (half * 2) * Math.min(1, gapStart + 0.3));
      context.lineTo(rx, cy + half + 3); context.stroke();
    }
    context.strokeStyle = '#f2c027'; context.lineWidth = 2;
    context.beginPath(); context.moveTo(rx + side * 2.5, cy - half - 3);
    context.lineTo(rx + side * 2.5, cy - half + (half * 2) * Math.min(1, gapStart)); context.stroke();
    context.fillStyle = '#f2c027';
    for (let y = cy - half; y <= cy + half; y += 11) {
      const f = (y - (cy - half)) / (half * 2);
      if (f > gapStart && f < gapStart + 0.3) continue;    // balusters gone here
      context.fillRect(rx - 2, y - 1.5, 4, 3);
    }
  });

  // Abutments.
  context.fillStyle = '#7e7c74';
  context.fillRect(L - 4, cy - half - 8, deckW + 8, 12);
  context.fillRect(L - 4, cy + half - 4, deckW + 8, 12);
  context.restore();

  queueHPBar(bx, cy - half - 26, 74, 7, b.hp, landmarkColor('creekBridge'), 'creekBridge');
}

/* ---------------- LEADERBOARD & NAME-ENTRY UI ---------------- */
const TOWN_LABELS = { bacolor: 'Bacolor', porac: 'Porac', angeles: 'Angeles' };
// Session-scoped only: deliberately NOT restored from storage. The field
// always starts blank, so a name carried over from a previous visitor
// could only ever be attached to the wrong person's score. It persists
// in memory just long enough for 'Try Again' replays, which skip the
// name screen.
let playerName = '';
let lbFilter = 'all';
let lbReturnTo = 'objective';   // which screen the Back button goes to
let lastResult = null;          // this run's submission, for highlighting

function hideAllCards() {
  ['objectiveCard','nameCard','townCard','infoCard','leaderboardCard','endCard']
    .forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
}

function showNameEntry() {
  nameAttempted = false;   // fresh visit: no warning until they act
  document.getElementById('overlay').classList.remove('hidden');
  hideAllCards();
  document.getElementById('nameCard').style.display = 'block';
  const input = document.getElementById('playerNameInput');
  // Always start blank. This is a walk-up public kiosk, so the previous
  // visitor's name must never be sitting in the field for the next person
  // to accidentally play under (or to have to clear by hand).
  if (input) { input.value = ''; setTimeout(() => input.focus(), 60); }
  validateNameInput();
}

// Empty names are refused by disabling Continue, so the player sees why
// rather than tapping a button that silently does nothing.
function validateNameInput() {
  const input = document.getElementById('playerNameInput');
  const btn = document.getElementById('nameContinueBtn');
  const hint = document.getElementById('nameHint');
  if (!input || !btn) return false;
  const clean = sanitizeName(input.value);
  const ok = clean.length > 0;
  btn.classList.toggle('disabled', !ok);
  btn.disabled = !ok;
  if (hint) {
    /* Don't scold before the player has done anything. On arrival the field
       is empty because they have only just got here, and a red warning at
       that moment reads as an error they caused. The hint stays neutral
       until they have typed something or actually tried to continue. */
    const touched = input.value.length > 0 || nameAttempted;
    if (!touched) {
      // The prompt above already says where the name goes; repeating it
      // here wasted the one line that could carry something useful.
      hint.textContent = `Up to ${LB_NAME_MAX} characters`;
      hint.classList.remove('warn');
    } else {
      hint.textContent = ok
        ? `${clean.length}/${LB_NAME_MAX} characters`
        : 'Please enter a name to continue';
      hint.classList.toggle('warn', !ok);
    }
  }
  return ok;
}

/* Set once the player presses Continue, so validation can distinguish
   "hasn't typed yet" from "tried to continue with nothing". */
let nameAttempted = false;

function renderLeaderboard() {
  const listEl = document.getElementById('lbList');
  const emptyEl = document.getElementById('lbEmpty');
  if (!listEl) return;
  // Ranks are always relative to the CURRENT view: the leader of a single
  // town takes the gold medal on that town's tab even if they place lower
  // in the combined ALL standings.
  const rows = boardFor(lbFilter);

  listEl.innerHTML = '';
  if (!rows.length) {
    if (emptyEl) {
      emptyEl.style.display = 'block';
      emptyEl.textContent = lbFilter === 'all'
        ? 'No scores yet — be the first to defend a town!'
        : `No scores yet for ${TOWN_LABELS[lbFilter] || lbFilter}.`;
    }
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  /* A single drawn medal tinted per placing. The 🥇🥈🥉 set renders at
     noticeably different sizes and styles across platforms, which made the
     top three rows sit unevenly. */
  const medals = [uiIcon('medal', 'rank-1'), uiIcon('medal', 'rank-2'), uiIcon('medal', 'rank-3')];
  rows.forEach((e, i) => {
    const place = i + 1;                     // rank within the selected view
    const row = document.createElement('div');
    row.className = 'lb-row' + (place <= 3 ? ' lb-top' + place : '');
    if (lastResult && e.name.toLowerCase() === lastResult.name.toLowerCase()) {
      row.classList.add('lb-you');
    }
    row.innerHTML =
      `<span class="lb-rank">${place <= 3 ? medals[place - 1] : place}</span>` +
      `<span class="lb-name"></span>` +
      `<span class="lb-meta">${lbFilter === 'all'
          ? (TOWN_LABELS[e.town] || e.town) + ' • ' + e.wave
          : 'Reached ' + e.wave}</span>` +
      `<span class="lb-score">${e.score.toLocaleString()}</span>`;
    // Name is set as text, never as HTML, so it can't inject markup.
    row.querySelector('.lb-name').textContent = e.name;
    listEl.appendChild(row);
  });
}

function showLeaderboard(returnTo) {
  lbReturnTo = returnTo || 'objective';
  document.getElementById('overlay').classList.remove('hidden');
  hideAllCards();
  document.getElementById('leaderboardCard').style.display = 'block';
  renderLeaderboard();
}

(function initLeaderboardUI() {
  const byId = id => document.getElementById(id);

  const openBtn = byId('openLeaderboardBtn');
  if (openBtn) openBtn.addEventListener('click', () => showLeaderboard('objective'));

  const backBtn = byId('lbBackBtn');
  if (backBtn) backBtn.addEventListener('click', () => {
    if (lbReturnTo === 'end') {
      hideAllCards();
      byId('endCard').style.display = 'block';
    } else {
      showObjectiveSelection();
    }
  });

  const endLbBtn = byId('endViewLbBtn');
  if (endLbBtn) endLbBtn.addEventListener('click', () => { stopConfetti(); showLeaderboard('end'); });

  document.querySelectorAll('.lb-filter').forEach(b => {
    b.addEventListener('click', () => {
      lbFilter = b.dataset.filter;
      document.querySelectorAll('.lb-filter').forEach(x => x.classList.toggle('active', x === b));
      renderLeaderboard();
    });
  });

  const input = byId('playerNameInput');
  if (input) {
    input.addEventListener('input', validateNameInput);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && validateNameInput()) byId('nameContinueBtn').click();
    });
  }
  const contBtn = byId('nameContinueBtn');
  /* A disabled button fires no click, so tapping Continue with an empty
     field did nothing at all — no advance, no explanation. Listening on the
     parent catches the tap even while the button is disabled, so the player
     finds out WHY it will not proceed. */
  if (contBtn && contBtn.parentElement) {
    contBtn.parentElement.addEventListener('pointerdown', (ev) => {
      if (ev.target === contBtn || contBtn.contains(ev.target)) {
        nameAttempted = true;
        validateNameInput();
      }
    });
  }
  if (contBtn) contBtn.addEventListener('click', () => {
    nameAttempted = true;          // from here the warning is earned
    if (!validateNameInput()) return;
    playerName = sanitizeName(byId('playerNameInput').value);
    showTownSelection();
  });
  const nameBack = byId('nameBackBtn');
  if (nameBack) nameBack.addEventListener('click', () => showObjectiveSelection());
})();


/* Shows the player's standing on the end card: their rank if they made the
   Top 10, or — if they didn't — the score they need to beat, so there's a
   concrete target to come back for. */
function renderRankResult(res, won) {
  const block = document.getElementById('endRankBlock');
  const banner = document.getElementById('endRankBanner');
  const line = document.getElementById('endRankLine');
  const sub = document.getElementById('endRankSub');
  if (!block || !res) return;
  block.style.display = 'block';
  block.classList.remove('rank-celebrate');

  const townName = TOWN_LABELS[res.town] || res.town;
  if (res.madeTop10) {
    if (res.isNewFirst) {
      banner.innerHTML = uiIcon('trophy') + ' NEW #1 RECORD!';
      banner.className = 'rank-banner rank-first';
      void block.offsetWidth;
      block.classList.add('rank-celebrate');
    } else if (res.improved) {
      banner.innerHTML = uiIcon('medal') + ' You made the Top 10!';
      banner.className = 'rank-banner rank-in';
      void block.offsetWidth;
      block.classList.add('rank-celebrate');
    } else {
      banner.textContent = 'Your best still stands';
      banner.className = 'rank-banner rank-hold';
    }
    line.textContent = `${res.name} — Rank #${res.rank} overall`;
    sub.textContent = (res.improved
      ? `${res.score.toLocaleString()} points`
      : `This run: ${res.score.toLocaleString()} · Your best: ${res.personalBest.toLocaleString()}`)
      + (res.townRank ? ` · #${res.townRank} in ${townName}` : '');
  } else {
    // Missing the combined Top 10 doesn't mean the run was worthless —
    // leading a single town is its own record, so say so.
    if (res.isTownFirst) {
      banner.innerHTML = uiIcon('medal', 'rank-1') + ` #1 in ${townName}!`;
      banner.className = 'rank-banner rank-first';
      void block.offsetWidth;
      block.classList.add('rank-celebrate');
    } else {
      banner.textContent = 'Not in the Top 10 — yet';
      banner.className = 'rank-banner rank-out';
    }
    line.textContent = `${res.name} — ${res.score.toLocaleString()} points`;
    sub.textContent = res.townRank
      ? `#${res.townRank} in ${townName}` +
        (res.cutoff != null ? ` · beat ${res.cutoff.toLocaleString()} for the overall board.` : '')
      : (res.cutoff != null
          ? `Beat ${res.cutoff.toLocaleString()} to make the board.`
          : 'Play again to climb the board.');
  }
}

/* ---------------- RENDERING ---------------- */
function roundRectCtx(context, x, y, w, h, r) {
  context.beginPath(); context.moveTo(x + r, y); context.arcTo(x + w, y, x + w, y + h, r); 
  context.arcTo(x + w, y + h, x, y + h, r); context.arcTo(x, y + h, x, y, r); context.arcTo(x, y, x + w, y, r); context.closePath();
}

function lerpColor(color1, color2, factor) {
  const c1 = parseInt(color1.slice(1), 16);
  const c2 = parseInt(color2.slice(1), 16);
  const r1 = (c1 >> 16) & 255, g1 = (c1 >> 8) & 255, b1 = c1 & 255;
  const r2 = (c2 >> 16) & 255, g2 = (c2 >> 8) & 255, b2 = c2 & 255;
  return `rgb(${Math.round(r1 + factor * (r2 - r1))}, ${Math.round(g1 + factor * (g2 - g1))}, ${Math.round(b1 + factor * (b2 - b1))})`;
}

// ----- River geometry (shared between the static bake and the live
// animated overlay, so both always align perfectly) -----
// Angeles is home to the real Abacan River, whose bridge was heavily
// damaged by lahar after the 1991 eruption — TOWN_MAPS.angeles already
// has a bridgePos for that reason. The river runs vertically down the
// town with a gentle meander (real rivers rarely run arrow-straight),
// tapering back to straight right under the bridge so the crossing
// still reads cleanly. Geometry is computed once per town and cached,
// since it's fully deterministic (seeded) and never changes at runtime.
const RIVER_GEOMETRY_CACHE = {};
function getRiverGeometry(townName) {
  if (townName in RIVER_GEOMETRY_CACHE) return RIVER_GEOMETRY_CACHE[townName];
  const townData = TOWN_MAPS[townName];
  // A town has a river if it defines a bridge crossing (vertical) or a
  // riverY band (horizontal). Towns with neither get no river at all.
  if (!townData || (!townData.bridgePos && typeof townData.riverY !== 'number')) {
    RIVER_GEOMETRY_CACHE[townName] = null; return null;
  }

  // Two orientations are supported:
  //   vertical   (bridgePos)  - Angeles, the Abacan running down the town
  //   horizontal (riverY)     - Porac, a creek crossing the town left-to-right
  const horizontal = !townData.bridgePos && typeof townData.riverY === 'number';
  const riverX = horizontal ? townData.riverY : townData.bridgePos.x;
  const bridgeY = horizontal ? null : townData.bridgePos.y;
  const riverHalf = 26;                 // nominal half-width (kept for callers)
  const topY = horizontal ? 0 : 500;    // start of the reach along the flow axis
  const botY = horizontal ? 540 : 960;  // end of the reach
  const rand = mulberry32(9911);
  const segments = 44;                  // finer sampling -> smoother curves, better shading
  const leftPts = [], rightPts = [], centerPts = [], stations = [];

  // Small deterministic value-noise so bank edges are irregular in a
  // natural, non-repeating-looking way rather than a clean sine.
  const noiseTable = Array.from({ length: 64 }, () => rand() * 2 - 1);
  const noise = (x) => {
    const i = Math.floor(x), f = x - i;
    const a = noiseTable[((i % 64) + 64) % 64];
    const b = noiseTable[(((i + 1) % 64) + 64) % 64];
    const s = f * f * (3 - 2 * f);      // smoothstep interpolation
    return a + (b - a) * s;
  };

  for (let i = 0; i <= segments; i++) {
    const u = i / segments;                       // 0 at head, 1 at mouth
    const y = topY + (botY - topY) * u;

    // ---- Centreline: two meander wavelengths layered, so bends vary in
    // size instead of repeating at one interval. Still tapers to straight
    // at the bridge so the crossing lines up.
    // Vertical rivers straighten under the bridge; a horizontal creek has
    // no crossing, so it meanders freely along its whole length.
    const taper = horizontal ? 1 : Math.min(1, Math.abs(y - bridgeY) / 130);
    // mScale lets a small creek snake less than a full river, so its band
    // stays inside the corridor the town layout leaves for it.
    const mScale = townData.riverMeander !== undefined ? townData.riverMeander : 1;
    const meander = (
        Math.sin(u * Math.PI * 2.3 + 1.1) * 24 +
        Math.sin(u * Math.PI * 5.1 + 0.4) * 7 +
        noise(u * 5) * 4) * taper * mScale;
    const cx = riverX + meander;

    // ---- Width: the channel pinches at constrictions and opens into
    // wider, slower pools. Also forced back to nominal at the bridge so
    // the span still fits its crossing.
    const widthWave =
        Math.sin(u * Math.PI * 3.7 + 2.2) * 0.22 +
        Math.sin(u * Math.PI * 1.3 + 0.7) * 0.13 +
        noise(u * 7 + 20) * 0.08;
    let halfW = riverHalf * (1 + widthWave);
    halfW = riverHalf + (halfW - riverHalf) * taper;   // nominal at the bridge
    halfW = Math.max(15, Math.min(38, halfW));

    // ---- Curvature of the centreline, used later for outer-bend scour
    // and for turbulence placement.
    const dPrev = Math.sin((u - 0.02) * Math.PI * 2.3 + 1.1) * 24;
    const dNext = Math.sin((u + 0.02) * Math.PI * 2.3 + 1.1) * 24;
    const curv = (dNext - 2 * meander / Math.max(taper, 0.001) * taper + dPrev);

    // ---- Depth: deepest where the channel is narrow (water is forced
    // through) and on the outer side of bends; shallow in wide pools.
    const narrowness = (riverHalf - halfW) / riverHalf;   // + when narrow
    const depth = Math.max(0.15, Math.min(1, 0.55 + narrowness * 1.1 + Math.abs(curv) * 0.004));

    // ---- Banks: independent multi-octave irregularity per side, so the
    // two shores never mirror each other.
    const leftEdge  = cx - halfW - (noise(u * 9 + 3) * 5 + noise(u * 19 + 11) * 2.2);
    const rightEdge = cx + halfW + (noise(u * 9 + 41) * 5 + noise(u * 19 + 57) * 2.2);

    // Map (along, cross) onto canvas coordinates for this orientation.
    const P  = horizontal ? (a, c) => ({ x: a, y: c }) : (a, c) => ({ x: c, y: a });
    leftPts.push(P(y, leftEdge));
    rightPts.push(P(y, rightEdge));
    centerPts.push(P(y, cx));
    const mid = P(y, cx);
    stations.push({
      y, cx, halfW, depth, curv, u,
      left: leftEdge, right: rightEdge,
      px: mid.x, py: mid.y,                 // centreline point in canvas space
      lx: P(y, leftEdge).x, ly: P(y, leftEdge).y,
      rx2: P(y, rightEdge).x, ry2: P(y, rightEdge).y
    });
  }

  // perp = unit vector across the channel; flowDir = along the channel.
  const geo = { leftPts, rightPts, centerPts, stations, riverX, riverHalf, topY, botY, bridgeY,
                horizontal, perp: horizontal ? { x: 0, y: 1 } : { x: 1, y: 0 } };
  RIVER_GEOMETRY_CACHE[townName] = geo;
  return geo;
}

/* Two visually distinct waterways.

   'lowland' (Angeles / Abacan): a deep, established urban river — teal
   blue-green, a strongly scoured deep channel, sandy banks, calm surface.

   'upland' (Porac): the town sits on Pinatubo's slopes, so its creek is a
   young stream still choked with volcanic ash and lahar debris. It runs
   pale grey-tan with suspended sediment, is shallow and BRAIDED — split
   around mid-channel gravel islands — with boulders in the bed and far
   more broken riffle water. Deliberately not a recolour of the Abacan. */
const RIVER_STYLES = {
  lowland: {
    // The Abacan after 1991: not clear tropical water but a sediment-laden,
    // grey-teal river that has cut a trench through its own pale lahar-sand
    // floodplain. Wide sandy aprons either side, a steep cut-bank edge, and
    // a slick, glassy sheen down the deep centre channel.
    water: ['#4d635f', '#607a76', '#7d9791', '#607a76', '#4d635f'],
    bankEarth: 'rgba(122,104,78,0.55)',
    bankWet:   'rgba(78,64,46,0.62)',
    floodplain: 'rgba(206,196,172,0.62)',   // pale ash-sand terrace
    cutBank:    'rgba(58,46,32,0.42)',
    depthPasses: [{ w: 0.78, col: 'rgba(30,48,50,0.28)' },
                  { w: 0.50, col: 'rgba(20,38,42,0.34)' },
                  { w: 0.26, col: 'rgba(12,30,36,0.34)' }],
    sheen: 'rgba(214,226,222,0.22)',
    shelf: '#a9b3a3', bar: '#c9bfa4', rock: '26,38,40',
    rockCount: 12, rockScale: 1, braided: false, riffle: 1, foam: '#eef8f6',
    barCount: 3
  },
  upland: {
    // A young, ash-choked creek on Pinatubo's slopes: shallow olive-grey
    // water threading between a few pale gravel bars, cobbles in the bed,
    // and thick green growth right down to the waterline.
    water: ['#4d5a52', '#5f7268', '#75897c', '#5f7268', '#4d5a52'],
    bankEarth: 'rgba(112,102,74,0.62)',
    bankWet:   'rgba(74,66,48,0.66)',
    depthPasses: [{ w: 0.62, col: 'rgba(30,38,32,0.28)' },
                  { w: 0.30, col: 'rgba(18,26,22,0.30)' }],
    sheen: 'rgba(222,230,214,0.18)',
    shelf: '#9aa088', bar: '#b3a889', rock: '48,46,38',
    rockCount: 22, rockScale: 1.3, braided: true, riffle: 1.6, foam: '#ffffff',
    lushBanks: true, barCount: 3
  }
};

// Lens-shaped bar/island outline (pointed upstream and downstream, like a
// real mid-channel gravel bar) — a plain ellipse reads as an egg.
function traceLens(context, cx, cy, len, wid, rot) {
  context.save();
  context.translate(cx, cy);
  context.rotate(rot);
  context.beginPath();
  context.moveTo(-len, 0);
  context.bezierCurveTo(-len * 0.45, -wid, len * 0.45, -wid, len, 0);
  context.bezierCurveTo(len * 0.45, wid * 0.85, -len * 0.45, wid * 0.85, -len, 0);
  context.closePath();
  context.restore();
}
function riverStyleFor(townName) {
  const t = TOWN_MAPS[townName] || {};
  return RIVER_STYLES[t.riverStyle] || RIVER_STYLES.lowland;
}

// Interpolated channel properties at a normalised position t (0..1) down
// the reach — used by the shading passes and the flow animation so both
// respond to the same varying width/depth.
function stationAtT(geo, t) {
  const s = geo.stations;
  const idxF = Math.max(0, Math.min(1, t)) * (s.length - 1);
  const i0 = Math.floor(idxF), i1 = Math.min(s.length - 1, i0 + 1);
  const f = idxF - i0, a = s[i0], b = s[i1];
  return {
    y: a.y + (b.y - a.y) * f,
    cx: a.cx + (b.cx - a.cx) * f,
    halfW: a.halfW + (b.halfW - a.halfW) * f,
    depth: a.depth + (b.depth - a.depth) * f,
    curv: a.curv + (b.curv - a.curv) * f,
    px: a.px + (b.px - a.px) * f,
    py: a.py + (b.py - a.py) * f
  };
}

// Traces the river's water-body path (left bank forward, right bank
// back) into the given context's current path — shared by the static
// fill and the live overlay's clip region so they always match exactly.
function traceRiverBody(context, geo) {
  context.beginPath();
  context.moveTo(geo.leftPts[0].x, geo.leftPts[0].y);
  geo.leftPts.forEach(p => context.lineTo(p.x, p.y));
  for (let i = geo.rightPts.length - 1; i >= 0; i--) context.lineTo(geo.rightPts[i].x, geo.rightPts[i].y);
  context.closePath();
}

// Static bake: bank shoulder, water gradient, and a few dark submerged
// rock silhouettes for depth — everything here is motionless, so it's
// drawn once into the ground layer (see cacheStaticElements) rather than
// repainted every frame.
function drawRiver(context) {
  const geo = getRiverGeometry(gameSettings.town);
  if (!geo) return;
  const { leftPts, rightPts, centerPts, stations, riverX, riverHalf } = geo;
  const rand = mulberry32(2281);
  const SS = riverStyleFor(gameSettings.town);   // per-town water character

  context.save();

  // ---- 1. Bank earth: an uneven apron of exposed soil either side. Its
  // outer edge wanders independently of the waterline so the shore reads
  // as eroded ground, not a clean outline offset around the water.
  const PX = geo.perp.x, PY = geo.perp.y;

  // ---- 0. Lahar-sand floodplain (lowland river only): a broad pale
  // terrace of old deposits either side, ending in a darker cut-bank edge
  // where the river has trenched down through it.
  if (SS.floodplain) {
    const fpRand = mulberry32(3170);
    const fpOff = (i, side) => 14 + Math.sin(i * 0.55 + side * 1.3) * 5 + fpRand() * 5;
    context.beginPath();
    context.moveTo(leftPts[0].x - 18 * PX, leftPts[0].y - 18 * PY);
    leftPts.forEach((p, i) => { const o = fpOff(i, -1); context.lineTo(p.x - o * PX, p.y - o * PY); });
    for (let i = rightPts.length - 1; i >= 0; i--) { const o = fpOff(i, 1); context.lineTo(rightPts[i].x + o * PX, rightPts[i].y + o * PY); }
    context.closePath();
    context.fillStyle = SS.floodplain;
    context.fill();
    context.strokeStyle = SS.cutBank;
    context.lineWidth = 1.6;
    context.stroke();
    // Faint deposit strata lines running along the terrace
    context.strokeStyle = 'rgba(90,76,56,0.16)';
    context.lineWidth = 1;
    [11, 15].forEach(d => {
      [-1, 1].forEach(side => {
        const pts = side < 0 ? leftPts : rightPts;
        context.beginPath();
        pts.forEach((p, i) => { const x = p.x + side * d * PX, y = p.y + side * d * PY; i ? context.lineTo(x, y) : context.moveTo(x, y); });
        context.stroke();
      });
    });
  }

  context.beginPath();
  context.moveTo(leftPts[0].x - 14 * PX, leftPts[0].y - 14 * PY);
  leftPts.forEach((p, i) => {
    const o = 7 + Math.sin(i * 0.7) * 5 + rand() * 4;
    context.lineTo(p.x - o * PX, p.y - o * PY);
  });
  for (let i = rightPts.length - 1; i >= 0; i--) {
    const o = 7 + Math.sin(i * 0.9 + 2) * 5 + rand() * 4;
    context.lineTo(rightPts[i].x + o * PX, rightPts[i].y + o * PY);
  }
  context.closePath();
  context.fillStyle = SS.bankEarth;
  context.fill();

  // ---- 2. Wet mud margin: darker, damp silt right at the waterline —
  // the tell-tale look of a Pampanga channel carrying volcanic sediment.
  context.beginPath();
  context.moveTo(leftPts[0].x - 4 * PX, leftPts[0].y - 4 * PY);
  leftPts.forEach(p => context.lineTo(p.x - 3 * PX, p.y - 3 * PY));
  for (let i = rightPts.length - 1; i >= 0; i--) context.lineTo(rightPts[i].x + 3 * PX, rightPts[i].y + 3 * PY);
  context.closePath();
  context.fillStyle = SS.bankWet;
  context.fill();

  // ---- 3. Water body base fill.
  traceRiverBody(context, geo);
  const gA = geo.horizontal ? { x: 0, y: riverX - riverHalf } : { x: riverX - riverHalf, y: 0 };
  const gB = geo.horizontal ? { x: 0, y: riverX + riverHalf } : { x: riverX + riverHalf, y: 0 };
  const riverGrad = context.createLinearGradient(gA.x, gA.y, gB.x, gB.y);
  riverGrad.addColorStop(0,    SS.water[0]);
  riverGrad.addColorStop(0.18, SS.water[1]);
  riverGrad.addColorStop(0.5,  SS.water[2]);
  riverGrad.addColorStop(0.82, SS.water[3]);
  riverGrad.addColorStop(1,    SS.water[4]);
  context.fillStyle = riverGrad;
  context.fill();

  // Everything below is confined to the water surface.
  context.save();
  traceRiverBody(context, geo);
  context.clip();

  // ---- 4. Depth shading. A "thalweg" ribbon — the deep channel a real
  // river carves — is drawn following the centreline, swinging toward the
  // OUTER side of each bend the way scour actually works, and narrowing
  // where the channel pinches. Layered translucent bands give depth
  // through tone alone, so it stays flat 2D art.
  for (const pass of SS.depthPasses) {
    context.beginPath();
    stations.forEach((s, i) => {
      const shift = Math.max(-1, Math.min(1, s.curv * 0.02)) * s.halfW * 0.28;
      const off = shift - s.halfW * pass.w * s.depth;
      const px = s.px + off * PX, py = s.py + off * PY;
      i === 0 ? context.moveTo(px, py) : context.lineTo(px, py);
    });
    for (let i = stations.length - 1; i >= 0; i--) {
      const s = stations[i];
      const shift = Math.max(-1, Math.min(1, s.curv * 0.02)) * s.halfW * 0.28;
      const off2 = shift + s.halfW * pass.w * s.depth;
      context.lineTo(s.px + off2 * PX, s.py + off2 * PY);
    }
    context.closePath();
    context.fillStyle = pass.col;
    context.fill();
  }

  // ---- 5. Shallow inner-bank shelves: pale sandy-grey water where the
  // channel is wide and shallow, on the inside of bends where sediment
  // drops out. Reads as a visible shallows/sandbar edge.
  stations.forEach((s, i) => {
    if (s.depth > 0.55 || i === 0 || i === stations.length - 1) return;
    const inner = s.curv > 0 ? -1 : 1;
    const w = s.halfW * (0.30 + (0.6 - s.depth));
    context.globalAlpha = 0.30;
    context.fillStyle = SS.shelf;
    context.beginPath();
    const so = inner * s.halfW * 0.62;
    context.ellipse(s.px + so * PX, s.py + so * PY, w * 0.5, 11, geo.horizontal ? Math.PI / 2 : 0, 0, Math.PI * 2);
    context.fill();
  });
  context.globalAlpha = 1;

  // ---- 6. Exposed gravel/sediment bars in the shallowest wide spots,
  // plus submerged rocks for a rocky bed rather than a flat fill.
  // Point bars on the inside of bends: a few lens-shaped sand/gravel
  // deposits hugging the shore where the current slackens.
  {
    let bars = 0;
    const along = geo.horizontal ? 0 : Math.PI / 2;
    stations.forEach((s, i) => {
      if (bars >= (SS.barCount || 3) || s.depth > 0.5 || i < 2 || i > stations.length - 3 || rand() > 0.22) return;
      const side = s.curv > 0 ? -1 : 1;   // inside of the bend
      const bo = side * s.halfW * 0.7;
      traceLens(context, s.px + bo * PX, s.py + bo * PY, s.halfW * 0.9, s.halfW * 0.32, along + (rand() - 0.5) * 0.25);
      context.globalAlpha = 0.6; context.fillStyle = SS.bar; context.fill();
      context.globalAlpha = 0.25; context.fillStyle = '#efe8d4'; context.fill();
      bars++;
    });
    context.globalAlpha = 1;
  }

  // Glassy sheen down the fast centre line — a soft light ribbon that
  // gives the water a wet, reflective surface instead of a flat tint.
  if (SS.sheen) {
    context.beginPath();
    stations.forEach((s, i) => {
      const shift = Math.max(-1, Math.min(1, s.curv * 0.02)) * s.halfW * 0.2;
      const off = shift - s.halfW * 0.16;
      i === 0 ? context.moveTo(s.px + off * PX, s.py + off * PY) : context.lineTo(s.px + off * PX, s.py + off * PY);
    });
    for (let i = stations.length - 1; i >= 0; i--) {
      const s = stations[i];
      const shift = Math.max(-1, Math.min(1, s.curv * 0.02)) * s.halfW * 0.2;
      const off = shift + s.halfW * 0.16;
      context.lineTo(s.px + off * PX, s.py + off * PY);
    }
    context.closePath();
    context.fillStyle = SS.sheen;
    context.fill();
  }

  const rockRand = mulberry32(4477);
  for (let r = 0; r < SS.rockCount; r++) {
    const t = rockRand();
    const st = stationAtT(geo, t);
    const ro = (rockRand() - 0.5) * st.halfW * 1.5;
    const cx = st.px + ro * PX, cyR = st.py + ro * PY;
    const rs = (2.5 + rockRand() * 5) * SS.rockScale;
    context.fillStyle = `rgba(${SS.rock},${0.22 + rockRand() * 0.22})`;
    context.beginPath();
    context.ellipse(cx, cyR, rs, rs * 0.62, rockRand() * Math.PI, 0, Math.PI * 2);
    context.fill();
    // A dry-side highlight on the larger ones so they read as rounded.
    if (rs > 5) {
      context.fillStyle = 'rgba(150,175,175,0.16)';
      context.beginPath();
      context.ellipse(cx - rs * 0.25, cyR - rs * 0.2, rs * 0.45, rs * 0.25, 0, 0, Math.PI * 2);
      context.fill();
    }
  }
  // ---- Braided channel (upland creeks only): elongated gravel islands
  // sitting mid-stream, splitting the flow into strands. This is what a
  // young, sediment-loaded volcanic-slope creek actually looks like, and
  // it's the clearest structural break from the Abacan's single channel.
  if (SS.braided) {
    const bRand = mulberry32(7717);
    const slots = [0.16, 0.42, 0.74];   // spaced out so the creek keeps open water between bars
    slots.forEach((slot, b) => {
      const t = slot + (bRand() - 0.5) * 0.08;
      const st = stationAtT(geo, t);
      const side = b % 2 === 0 ? -1 : 1;
      const off = side * st.halfW * (0.08 + bRand() * 0.2);
      const cx2 = st.px + off * PX, cy2 = st.py + off * PY;
      const len = st.halfW * (1.3 + bRand() * 0.7);
      const wid = st.halfW * (0.24 + bRand() * 0.12);
      const rot = (geo.horizontal ? 0 : Math.PI / 2) + (bRand() - 0.5) * 0.2;
      // Damp sediment apron, then the dry pale crest of the bar.
      traceLens(context, cx2, cy2, len, wid, rot);
      context.globalAlpha = 0.6; context.fillStyle = SS.bar; context.fill();
      traceLens(context, cx2, cy2 - 0.5, len * 0.7, wid * 0.55, rot);
      context.globalAlpha = 0.85; context.fillStyle = '#d3cab0'; context.fill();
      // Water piling against the upstream nose and a small eddy tail
      context.globalAlpha = 0.35; context.strokeStyle = '#ffffff'; context.lineWidth = 1.2;
      context.beginPath();
      context.arc(cx2 - (geo.horizontal ? len : 0), cy2 - (geo.horizontal ? 0 : len), 3.5, Math.PI * 0.9, Math.PI * 2.1);
      context.stroke();
      // A few cobbles strewn across the bar.
      context.globalAlpha = 0.6;
      context.fillStyle = `rgba(${SS.rock},0.5)`;
      for (let k = 0; k < 4; k++) {
        const kx = cx2 + (geo.horizontal ? (bRand() - 0.5) * len * 1.1 : (bRand() - 0.5) * wid * 1.1);
        const ky = cy2 + (geo.horizontal ? (bRand() - 0.5) * wid * 1.1 : (bRand() - 0.5) * len * 1.1);
        context.beginPath();
        context.arc(kx, ky, 1 + bRand() * 1.8, 0, Math.PI * 2);
        context.fill();
      }
    });
    context.globalAlpha = 1;
  }

  context.restore();   // end water clip

  // ---- 7. Riverbank vegetation: low clumps of grass and reeds along the
  // shore, denser on the inside of bends where silt collects. Common along
  // Pampanga waterways, and it breaks up the bank outline.
  // Dense green bank growth: on an upland creek the vegetation mats right
  // down to the waterline, so clumps are drawn every station rather than
  // every other one, with a leafy ground cover underneath them.
  const vegRand = mulberry32(6613);
  if (SS.lushBanks) {
    stations.forEach(st => {
      [-1, 1].forEach(side => {
        const bxo = (side < 0 ? st.lx : st.rx2) + side * 9 * PX;
        const byo = (side < 0 ? st.ly : st.ry2) + side * 9 * PY;
        context.globalAlpha = 0.55;
        context.fillStyle = vegRand() < 0.5 ? '#4f7a3c' : '#3f6733';
        context.beginPath();
        context.ellipse(bxo, byo, geo.horizontal ? 13 : 9, geo.horizontal ? 9 : 13,
                        0, 0, Math.PI * 2);
        context.fill();
      });
    });
    context.globalAlpha = 1;
  }
  stations.forEach((s, i) => {
    if (!SS.lushBanks && i % 2 !== 0) return;
    [-1, 1].forEach(side => {
      if (vegRand() > (SS.lushBanks ? 0.92 : 0.62)) return;
      const vo = side * (3 + vegRand() * 5);
      const baseX = (side < 0 ? s.lx : s.rx2) + vo * PX;
      const baseY = (side < 0 ? s.ly : s.ry2) + vo * PY;
      const clump = 2 + Math.floor(vegRand() * 3);
      context.strokeStyle = vegRand() < 0.5 ? (SS.lushBanks ? '#5b8a41' : '#4c6b3a') : (SS.lushBanks ? '#6d9c4c' : '#5d7a42');
      context.lineWidth = 1.4;
      context.lineCap = 'round';
      for (let b = 0; b < clump; b++) {
        // Reeds always grow upward on screen, whichever way the bank faces.
        const bxo = baseX + (vegRand() - 0.5) * 7;
        const byo = baseY + (geo.horizontal ? side * 2 : 2);
        const h = 5 + vegRand() * 7;
        const leanX = geo.horizontal ? 1.5 : side * 2;
        context.beginPath();
        context.moveTo(bxo, byo);
        context.quadraticCurveTo(bxo + leanX, byo - h * 0.6, bxo + leanX * 2, byo - h);
        context.stroke();
      }
    });
  });

  context.restore();

  // NOTE: the creek bridge is deliberately NOT baked in here. It is a
  // damageable structure with its own health bar and destruction stages,
  // so it has to be redrawn live every frame (see drawCreekBridge).
}


/* Concrete barangay bridge crossing a creek, modelled on the real
   Pampanga crossings: a plain grey concrete deck on square piers, with
   the steel railings painted in the blue-and-yellow provincial colours.
   Placed at townData.riverBridgeAt (0..1 along the reach). Scenery only. */
function drawRiverBridge(context, geo, townData) {
  if (!geo || !geo.horizontal || typeof townData.riverBridgeAt !== 'number') return;
  const st = stationAtT(geo, townData.riverBridgeAt);
  const bx = st.px, cy = st.py;
  const half = st.halfW + 26;         // deck reaches well onto both banks
  const deckW = 58;                   // deck width, measured along the flow
  const L = bx - deckW / 2, R = bx + deckW / 2;

  context.save();

  // Shadow thrown onto the water under the span.
  context.globalAlpha = 0.34;
  context.fillStyle = '#0b1410';
  context.fillRect(L + 4, cy - half + 5, deckW, half * 2);
  context.globalAlpha = 1;

  // Square concrete piers standing in the channel.
  [-0.5, 0.5].forEach(f => {
    context.fillStyle = '#8a8880';
    context.fillRect(L + 7, cy + f * half * 0.95 - 7, deckW - 14, 14);
    context.fillStyle = 'rgba(0,0,0,0.18)';
    context.fillRect(L + 7, cy + f * half * 0.95 + 4, deckW - 14, 3);
  });

  // Concrete deck slab, lighter along its crown.
  const slab = context.createLinearGradient(L, 0, R, 0);
  slab.addColorStop(0,    '#8e8c84');
  slab.addColorStop(0.45, '#b3b1a8');
  slab.addColorStop(1,    '#87857d');
  context.fillStyle = slab;
  context.fillRect(L, cy - half, deckW, half * 2);

  // Kerb lines down both edges of the roadway.
  context.strokeStyle = 'rgba(90,88,80,0.75)';
  context.lineWidth = 2;
  [L + 9, R - 9].forEach(kx => {
    context.beginPath();
    context.moveTo(kx, cy - half);
    context.lineTo(kx, cy + half);
    context.stroke();
  });

  // Painted railings: blue rail with a yellow cap rail and balusters.
  [-1, 1].forEach(side => {
    const rx = bx + side * (deckW / 2 - 4);
    context.strokeStyle = '#1f4fa8';
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(rx, cy - half - 3);
    context.lineTo(rx, cy + half + 3);
    context.stroke();
    context.strokeStyle = '#f2c027';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(rx + side * 2.5, cy - half - 3);
    context.lineTo(rx + side * 2.5, cy + half + 3);
    context.stroke();
    context.fillStyle = '#f2c027';
    for (let y = cy - half; y <= cy + half; y += 11) {
      context.fillRect(rx - 2, y - 1.5, 4, 3);
    }
  });

  // Abutments where the deck lands on each bank.
  context.fillStyle = '#7e7c74';
  context.fillRect(L - 4, cy - half - 8, deckW + 8, 12);
  context.fillRect(L - 4, cy + half - 4, deckW + 8, 12);

  context.restore();
}

// Live animated overlay: traveling current highlights that visibly
// scroll downstream, plus twinkling sunlight sparkles — drawn fresh
// every frame (unlike the static bake above) so the river actually
// looks like moving water instead of a painted backdrop. Cheap: a
// handful of clipped strokes/dots per frame, no per-frame allocation.
const RIVER_SPARKLE_CACHE = {};
function getRiverSparkles(geo) {
  const key = geo.riverX + '_' + geo.bridgeY;
  if (RIVER_SPARKLE_CACHE[key]) return RIVER_SPARKLE_CACHE[key];
  const rand = mulberry32(5151);
  const arr = [];
  for (let i = 0; i < 14; i++) {
    arr.push({ t: rand(), perp: (rand() - 0.5) * geo.riverHalf * 1.3, phase: rand() * Math.PI * 2 });
  }
  RIVER_SPARKLE_CACHE[key] = arr;
  return arr;
}

function centerXAtT(geo, t) {
  const idxF = t * (geo.centerPts.length - 1);
  const idx0 = Math.floor(idxF), idx1 = Math.min(geo.centerPts.length - 1, idx0 + 1);
  const frac = idxF - idx0;
  return geo.centerPts[idx0].x + (geo.centerPts[idx1].x - geo.centerPts[idx0].x) * frac;
}

/* Seeded surface-flow particles for the Abacan. Built once per geometry and
   reused, so the river's motion is deterministic and costs no per-frame
   allocation. Each particle carries a lateral offset across the channel,
   which drives BOTH where it sits and how fast it travels: real rivers run
   fastest mid-channel and drag along the banks, and reproducing that
   velocity gradient is what makes the surface read as water rather than a
   scrolling texture. */
const RIVER_FLOW_CACHE = new WeakMap();
function getRiverFlow(geo) {
  if (RIVER_FLOW_CACHE.has(geo)) return RIVER_FLOW_CACHE.get(geo);
  const rand = mulberry32(4471);
  const mk = (n, cfg) => Array.from({ length: n }, () => {
    // perp: -1 (left bank) .. +1 (right bank)
    const perp = (rand() * 2 - 1) * cfg.spread;
    // Velocity profile: quadratic falloff toward the banks.
    const vel = 1 - 0.72 * perp * perp;
    return {
      t: rand(),                        // live position, advanced per frame
      perp,
      vel,
      rate: 0.8 + rand() * 0.45,        // per-particle variation, so the surface never pulses in lockstep
      len: cfg.minLen + rand() * (cfg.maxLen - cfg.minLen),
      w: cfg.minW + rand() * (cfg.maxW - cfg.minW),
      alpha: cfg.minA + rand() * (cfg.maxA - cfg.minA),
      phase: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 2
    };
  });
  const flow = {
    lastT: null,   // previous ambientTime, for integrating particle motion
    streaks: mk(16, { spread: 0.86, minLen: 22, maxLen: 62, minW: 1.2, maxW: 3.0, minA: 0.10, maxA: 0.30 }),
    foam:    mk(10, { spread: 1.0,  minLen: 8,  maxLen: 20, minW: 1.0, maxW: 2.2, minA: 0.16, maxA: 0.38 }),
    debris:  mk(5,  { spread: 0.75, minLen: 3,  maxLen: 5,  minW: 1,   maxW: 1,   minA: 0.30, maxA: 0.55 })
  };
  RIVER_FLOW_CACHE.set(geo, flow);
  return flow;
}

function drawRiverLiveDetail(context) {
  const geo = getRiverGeometry(gameSettings.town);
  if (!geo) return;
  const { topY, botY, riverHalf, bridgeY } = geo;
  const span = botY - topY;
  const flow = getRiverFlow(geo);
  // Base downstream speed (fraction of the river's length per second).
  const BASE = 0.16;

  const SS = riverStyleFor(gameSettings.town);
  const PX = geo.perp.x, PY = geo.perp.y;          // across the channel
  const FX = geo.horizontal ? 1 : 0, FY = geo.horizontal ? 0 : 1;  // along the flow
  context.save();
  traceRiverBody(context, geo);
  context.clip();
  context.lineCap = 'round';

  // Local flow speed: continuity means a narrower channel must move the
  // same water faster, so speed scales with how pinched the section is.
  // This is what stops the whole river sliding at one uniform rate.
  const speedAt = (t) => {
    const st = stationAtT(geo, t);
    return (riverHalf / st.halfW) * (0.75 + 0.45 * st.depth);
  };

  // Advance every particle by the LOCAL speed at its own position, rather
  // than moving it at a fixed rate. A leaf therefore genuinely speeds up
  // as it is drawn into a narrows and eases off again in the wide pools —
  // and because each particle integrates its own path, the surface never
  // settles into a visible repeating loop.
  const dt = (flow.lastT === null) ? 0 : Math.max(0, Math.min(0.1, ambientTime - flow.lastT));
  flow.lastT = ambientTime;
  const advance = (p, scale) => {
    p.t = (p.t + dt * BASE * p.vel * p.rate * scale * speedAt(p.t)) % 1;
    return p.t;
  };

  // ---- 1. Current streaks: elongated highlights stretched along the flow.
  // Faster mid-channel, slower at the banks (see the velocity profile above).
  for (const p of flow.streaks) {
    const t = advance(p, 1);
    const st = stationAtT(geo, t);
    const off = p.perp * st.halfW * 0.82;
    const cx = st.px + off * PX, cy = st.py + off * PY;
    const local = speedAt(t);
    // Fade in at the top of the reach and out at the bottom so streaks
    // never pop into existence mid-river.
    const edgeFade = Math.min(1, Math.sin(t * Math.PI) * 2.2);
    context.globalAlpha = p.alpha * edgeFade;
    context.strokeStyle = SS.riffle > 1 ? '#efeadb' : '#dff6ff';
    context.lineWidth = p.w;
    context.beginPath();
    // Streaks stretch out where the water runs fast and bunch up where
    // it slows, the way real surface streaklines behave.
    const len = p.len * (0.6 + local * 0.6);
    const bow = Math.sin(ambientTime * 0.8 + p.phase) * 2.5;
    context.moveTo(cx - FX * len * 0.5, cy - FY * len * 0.5);
    context.quadraticCurveTo(cx + bow * PX, cy + bow * PY,
                             cx + FX * len * 0.5, cy + FY * len * 0.5);
    context.stroke();
  }

  // ---- 2. Bank foam: short, brighter, slower flecks that hug the edges,
  // where the water drags against the shore.
  for (const p of flow.foam) {
    const t = advance(p, 0.42);
    const st = stationAtT(geo, t);
    const side = p.perp < 0 ? -1 : 1;
    const fo = side * st.halfW * (0.80 + 0.12 * Math.sin(ambientTime + p.phase));
    const cx = st.px + fo * PX, cy = st.py + fo * PY;
    context.globalAlpha = p.alpha * Math.min(1, Math.sin(t * Math.PI) * 2.2);
    context.strokeStyle = SS.foam;
    context.lineWidth = p.w;
    context.beginPath();
    context.moveTo(cx - FX * p.len * 0.5, cy - FY * p.len * 0.5);
    context.lineTo(cx + FX * p.len * 0.5, cy + FY * p.len * 0.5);
    context.stroke();
  }

  // ---- 3. Drifting surface debris (leaves/twigs). A few solid objects
  // being carried downstream sell the motion far more convincingly than
  // light alone, because the eye can track them.
  for (const p of flow.debris) {
    const t = advance(p, 0.9);
    const st = stationAtT(geo, t);
    const dOff = p.perp * st.halfW * 0.7 + Math.sin(ambientTime * 0.9 + p.phase) * 3;
    context.save();
    context.translate(st.px + dOff * PX, st.py + dOff * PY);
    context.rotate(ambientTime * p.spin * 0.6 + p.phase);    // tumbling on the surface
    context.globalAlpha = p.alpha * Math.min(1, Math.sin(t * Math.PI) * 2.6);
    context.fillStyle = '#4a5b34';
    context.beginPath();
    context.ellipse(0, 0, p.len, p.len * 0.5, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  // ---- 4. Turbulence where the channel bends hard or pinches: broken
  // riffle water on the outer bank of a bend and through constrictions.
  geo.stations.forEach((s, si) => {
    // Only every third station carries riffle marks — drawing them at
    // every sample produced a repeating fish-scale pattern.
    if (si % 3 !== 1) return;
    const tight = Math.min(1, Math.abs(s.curv) * 0.03);
    const pinch = Math.max(0, (riverHalf - s.halfW) / riverHalf);
    // An upland creek breaks white far more readily than a deep lowland
    // river, so its riffle threshold is lower and its churn stronger.
    const churn = (tight * 0.6 + pinch * 1.1 + (SS.riffle > 1 ? 0.22 : 0)) * SS.riffle;
    if (churn < 0.18) return;
    const outer = s.curv > 0 ? 1 : -1;
    for (let k = 0; k < 2; k++) {
      const ph = ambientTime * (2.2 + k) + s.u * 40 + k;
      const wob = Math.sin(ph);
      context.globalAlpha = Math.min(SS.riffle > 1 ? 0.42 : 0.30, churn * 0.26) * (0.55 + 0.45 * wob);
      context.strokeStyle = '#ecffff';
      context.lineWidth = 1.4;
      const to = outer * s.halfW * (0.45 + 0.22 * k);
      const rx = s.px + to * PX, ry = s.py + to * PY;
      context.beginPath();
      context.moveTo(rx - FX * 4 + PX * wob * 1.5, ry - FY * 4 + PY * wob * 1.5);
      context.quadraticCurveTo(rx + PX * (2.5 + wob), ry + PY * (2.5 + wob),
                               rx + FX * 4 + PX * wob * 1.5, ry + FY * 4 + PY * wob * 1.5);
      context.stroke();
    }
  });

  // ---- 4. Turbulence at the bridge crossing: water piling against the
  // piers and breaking white just downstream of them.
  if (bridgeY && !geo.horizontal) {
    const pierCx = centerXAtT(geo, (bridgeY - topY) / span);
    for (let i = -1; i <= 1; i += 2) {
      const px = pierCx + i * riverHalf * 0.52;
      const churn = 0.5 + 0.5 * Math.sin(ambientTime * 3.1 + i);
      context.globalAlpha = 0.14 + 0.14 * churn;
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.ellipse(px, bridgeY + 7 + churn * 2, 4.5, 8 + churn * 3, 0, 0, Math.PI * 2);
      context.fill();
    }
  }

  // ---- 5. Twinkling sunlight glints at fixed seeded positions — only the
  // alpha animates, so they glint in and out rather than jittering around.
  getRiverSparkles(geo).forEach(sp => {
    const stS = stationAtT(geo, sp.t);
    const cx = stS.px + sp.perp * PX, y = stS.py + sp.perp * PY;
    const twinkle = 0.5 + 0.5 * Math.sin(ambientTime * 2.4 + sp.phase);
    if (twinkle < 0.55) return;
    context.globalAlpha = ((twinkle - 0.55) / 0.45) * 0.65;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(cx, y, 1.6, 0, Math.PI * 2);
    context.fill();
  });

  context.globalAlpha = 1;
  context.restore();
}

/* ---- GROUND CHARACTER ----
   All three towns used to share one identical green gradient, so the field
   said nothing about where you were. Each municipality now has ground that
   matches what it actually is:

     Bacolor — the town the lahar buried. Pale grey-brown ash and sand with
               visible deposit banding and dry, sparse growth.
     Porac   — upland farming barangay on the foot-slopes. Green, warm, laid
               out in cultivated plots divided by hedgerows.
     Angeles — a dense city. Grey, built-up ground with a street grid rather
               than open field.
*/
const TOWN_GROUND = {
  bacolor: {
    stops: ['#a89c86', '#95886f', '#7d715a', '#5f5645'],   // lahar sand
    tufts: { count: 34, tones: ['#8a8468', '#6f6a52'], height: 4 },
    texture: 'lahar'
  },
  porac: {
    stops: ['#6a8a4e', '#587343', '#455c34', '#334425'],   // cultivated green
    tufts: { count: 86, tones: ['#4a6b3a', '#6b8f52'], height: 7 },
    texture: 'fields'
  },
  angeles: {
    stops: ['#6b7360', '#5a6152', '#474d41', '#343930'],   // urban grey-green
    tufts: { count: 40, tones: ['#4a5740', '#5d6b4f'], height: 5 },
    texture: 'urban'
  }
};
function townGround() {
  return TOWN_GROUND[gameSettings.town] || TOWN_GROUND.porac;
}

/* Hex -> rgba() so a palette colour can fade to transparent in a gradient. */
function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/* ---- WHERE THE SLOPE MEETS THE TOWN ----
   The ground was a plain rectangle starting at y=500, which left a
   dead-straight horizontal seam across the full width — the single most
   artificial thing on the map, and it read as pasted-on rather than as
   terrain. Real ground does not end in a ruled line: a lahar plain meets
   the foot of a volcano in an alluvial fan with lobed, uneven toes.

   This paints that toe: the ground colour pushes UP into the slope in
   irregular lobes, softened by a short gradient so there is no hard edge
   anywhere along it. */
/* The toe profile. Shared by the ground fill and the feather so the two
   cannot disagree — the first attempt drew a lobed overlay ON TOP of the
   original rectangle, which left the straight seam underneath and actually
   made the edge sharper. The ground is now cut to this shape from the
   start, so there is no rectangle edge to hide. */
function groundToeY(x) {
  return 500 - 26
    + Math.sin(x * 0.0135 + 1.2) * 15
    + Math.sin(x * 0.041 + 3.1) * 6
    + Math.sin(x * 0.0951) * 3;
}
function traceGroundToe(ctx) {
  ctx.beginPath();
  ctx.moveTo(-10, 980);
  for (let x = -10; x <= 550; x += 8) ctx.lineTo(x, groundToeY(x));
  ctx.lineTo(550, 980);
  ctx.closePath();
}

function paintGroundToe(ctx, stops) {
  const rand = mulberry32(4471);
  ctx.save();

  /* Feather the top few pixels of the cut edge into the slope, so even the
     lobed outline has no hard line along it. */
  const grad = ctx.createLinearGradient(0, 455, 0, 528);
  grad.addColorStop(0, hexToRgba(stops[0], 0));
  grad.addColorStop(1, hexToRgba(stops[0], 0.55));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-10, 545);
  for (let x = -10; x <= 550; x += 8) ctx.lineTo(x, groundToeY(x) - 12);
  ctx.lineTo(550, 545);
  ctx.closePath();
  ctx.fill();

  // Debris fans spilling from the gully mouths onto the plain.
  for (let i = 0; i < 9; i++) {
    const x = 20 + rand() * 500;
    const y = groundToeY(x) + 6 + rand() * 14;
    const w = 26 + rand() * 46;
    ctx.globalAlpha = 0.1 + rand() * 0.09;
    ctx.fillStyle = stops[1];
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.quadraticCurveTo(x - w * 0.5, y + 10, x - w, y + 20);
    ctx.lineTo(x + w, y + 20);
    ctx.quadraticCurveTo(x + w * 0.5, y + 10, x, y - 12);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/* Broad relief so the plain reads as sloping away from the volcano rather
   than as a flat sheet: faint contour terraces, a light haze on the far
   ground, and a gentle vignette at the edges. */
function paintGroundRelief(ctx, stops) {
  ctx.save();
  traceGroundToe(ctx); ctx.clip();   // relief never spills onto the slope

  // Aerial perspective — distant ground is hazier and lighter.
  // Kept light: at 0.22 it read as fog sitting on the field rather than as
  // distance, and washed the colour out of the whole upper plain.
  const haze = ctx.createLinearGradient(0, 480, 0, 600);
  haze.addColorStop(0, 'rgba(198, 206, 196, 0.11)');
  haze.addColorStop(1, 'rgba(198, 206, 196, 0)');
  ctx.fillStyle = haze;
  ctx.fillRect(0, 480, 540, 125);

  // Contour terraces: each step catches a little light on its riser.
  const rand = mulberry32(8123);
  for (let i = 0; i < 6; i++) {
    const y = 560 + i * 68 + rand() * 18;
    ctx.globalAlpha = 0.028 + rand() * 0.022;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-10, y);
    for (let x = -10; x <= 550; x += 40) ctx.lineTo(x, y + Math.sin(x * 0.012 + i * 2.1) * 7);
    ctx.lineTo(550, y + 5); ctx.lineTo(-10, y + 5);
    ctx.closePath(); ctx.fill();

    ctx.globalAlpha = 0.04 + rand() * 0.03;
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(-10, y + 5);
    for (let x = -10; x <= 550; x += 40) ctx.lineTo(x, y + 5 + Math.sin(x * 0.012 + i * 2.1) * 7);
    ctx.lineTo(550, y + 13); ctx.lineTo(-10, y + 13);
    ctx.closePath(); ctx.fill();
  }

  // Vignette: the plain darkens toward the edges of the stage.
  ctx.globalAlpha = 1;
  const vig = ctx.createLinearGradient(0, 0, 540, 0);
  vig.addColorStop(0, 'rgba(0,0,0,0.2)');
  vig.addColorStop(0.18, 'rgba(0,0,0,0)');
  vig.addColorStop(0.82, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 500, 540, 460);
  ctx.restore();
}

/* Ground texture for the current town, painted once into the static cache
   over the base gradient.

   The first version drew perfectly straight, full-width grid lines, which
   read as a wireframe laid over the field rather than as terrain. Every
   layout here is now irregular — offset plots, broken lines, varied sizes —
   and each town gets the physical details that identify it. Everything is
   kept low-contrast so buildings, channels and tools still read on top. */
function paintGroundTexture(ctx) {
  const g = townGround();
  const rand = mulberry32(9871);
  const R = (a, b) => a + rand() * (b - a);
  ctx.save();
  traceGroundToe(ctx); ctx.clip();   // texture stays on the plain

  if (g.texture === 'lahar') {
    // ---- Bacolor: a valley filled in by successive lahar flows ----
    // Terraces: each flow settled at its own level, edges lobed not straight.
    for (let i = 0; i < 8; i++) {
      const y = 515 + i * R(44, 58);
      ctx.globalAlpha = R(0.10, 0.2);
      ctx.fillStyle = i % 2 ? '#c0b295' : '#6b6250';
      ctx.beginPath();
      ctx.moveTo(-10, y);
      for (let x = -10; x <= 550; x += 28) {
        ctx.lineTo(x, y + Math.sin(x * 0.021 + i * 1.7) * 6 + Math.sin(x * 0.007) * 4);
      }
      ctx.lineTo(550, y + 22); ctx.lineTo(-10, y + 22);
      ctx.closePath(); ctx.fill();
    }
    /* Dry gullies scoured by run-off after the flow stopped. Kept faint and
       short: at full length and strength they ran the whole height of the
       field and read as scratches on the screen rather than channels in
       the ash. Each one now starts and ends at its own depth, wanders more,
       and fades out along its length. */
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = R(20, 520);
      const yStart = R(515, 700), yEnd = yStart + R(70, 210);
      const grad = ctx.createLinearGradient(0, yStart, 0, yEnd);
      grad.addColorStop(0, 'rgba(93,84,67,0)');
      grad.addColorStop(0.35, 'rgba(93,84,67,0.16)');
      grad.addColorStop(1, 'rgba(93,84,67,0)');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = grad;
      ctx.lineWidth = R(2, 4.5);
      let y = yStart;
      ctx.beginPath(); ctx.moveTo(x, y);
      while (y < yEnd) {
        x += R(-13, 13); y += R(16, 30);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Cracked pans of settled ash.
    for (let i = 0; i < 26; i++) {
      const x = R(0, 540), y = R(520, 945), r = R(14, 38);
      ctx.globalAlpha = R(0.08, 0.18);
      ctx.fillStyle = '#cabda3';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * R(0.32, 0.5), R(-0.3, 0.3), 0, Math.PI * 2); ctx.fill();
    }
    // Boulders rafted down and stranded in the deposit.
    for (let i = 0; i < 16; i++) {
      const x = R(15, 525), y = R(535, 945), r = R(3.5, 9);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = '#7d7666';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#a29a87';
      ctx.beginPath(); ctx.ellipse(x - r * 0.25, y - r * 0.3, r * 0.5, r * 0.34, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Dead stumps left standing where the ash drowned the trees.
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 9; i++) {
      const x = R(20, 520), y = R(545, 940), h = R(5, 11);
      ctx.strokeStyle = '#6b5a44'; ctx.lineWidth = R(2, 3.4);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + R(-2, 2), y - h); ctx.stroke();
    }
    // Wind-combed ripples across the open ash.
    ctx.globalAlpha = 0.07; ctx.strokeStyle = '#e2d8c2'; ctx.lineWidth = 1;
    for (let i = 0; i < 40; i++) {
      const x = R(-10, 520), y = R(515, 950), len = R(26, 70);
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + len * 0.5, y - R(1.5, 4), x + len, y);
      ctx.stroke();
    }
    // Roof peaks and wall stubs of the houses the ash swallowed — the
    // detail Bacolor is actually known for.
    for (let i = 0; i < 7; i++) {
      const x = R(30, 505), y = R(560, 930), w = R(13, 26);
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = i % 2 ? '#7a4b3a' : '#5d6470';
      ctx.beginPath();                       // a gable just breaking the surface
      ctx.moveTo(x - w, y);
      ctx.lineTo(x, y - w * R(0.4, 0.62));
      ctx.lineTo(x + w, y);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.22; ctx.fillStyle = '#efe6d2';   // ash banked against it
      ctx.beginPath(); ctx.ellipse(x, y + 2, w * 1.25, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    // Cart and truck ruts pressed into the drying deposit.
    ctx.globalAlpha = 0.09; ctx.strokeStyle = '#5a5140'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 5; i++) {
      const y0 = R(540, 900); let x = R(-10, 200);
      for (const off of [0, 6]) {
        let xx = x, yy = y0 + off * 0.4;
        ctx.beginPath(); ctx.moveTo(xx, yy + off);
        while (xx < 560) { xx += R(40, 70); yy += R(-9, 9); ctx.lineTo(xx, yy + off); }
        ctx.stroke();
      }
    }
    // Shallow pools left standing in the hollows.
    for (let i = 0; i < 8; i++) {
      const x = R(20, 520), y = R(540, 935), r = R(8, 20);
      ctx.globalAlpha = 0.17; ctx.fillStyle = '#8d9a94';
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.4, R(-0.25, 0.25), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.13; ctx.fillStyle = '#dff0ea';
      ctx.beginPath(); ctx.ellipse(x - r * 0.2, y - r * 0.1, r * 0.45, r * 0.14, 0, 0, Math.PI * 2); ctx.fill();
    }

  } else if (g.texture === 'fields') {
    /* ---- Porac: cultivated foot-slope plots ----
       Rewritten. The parcels were axis-aligned fillRects with strokeRect
       borders and pale headland strips, which read as translucent grey
       SQUARES laid over the field rather than as farmland — the straight
       edges and right angles gave them away instantly.

       Real plots on a slope are four-sided but never square: they follow
       the contour, so the corners are jittered, the sides are not parallel,
       and the boundaries are soft earth bunds rather than drawn outlines. */
    const plots = [];
    let y = 508;
    while (y < 950) {
      const rowH = R(66, 104);
      let x = R(-30, -6);
      while (x < 545) {
        const pw = R(92, 178);
        // Each corner is nudged independently, so no two sides are parallel.
        const j = () => (rand() - 0.5) * 18;
        plots.push({
          pts: [
            [x + j(),        y + j()],
            [x + pw + j(),   y + j() * 0.8],
            [x + pw + j(),   y + rowH + j()],
            [x + j() * 0.8,  y + rowH + j()]
          ],
          wet: rand() < 0.2,
          rot: (rand() - 0.5) * 0.05
        });
        x += pw + R(6, 16);
      }
      y += rowH + R(7, 15);
    }

    const tracePlot = (p2) => {
      ctx.beginPath();
      ctx.moveTo(p2.pts[0][0], p2.pts[0][1]);
      for (let k = 1; k < p2.pts.length; k++) ctx.lineTo(p2.pts[k][0], p2.pts[k][1]);
      ctx.closePath();
    };

    plots.forEach((p2, i) => {
      /* A flat tint inside the outline still read as a translucent panel,
         because the fill stopped dead at the boundary. Each parcel is now
         filled with a soft radial falloff that reaches zero before its own
         edge, so there is no visible boundary anywhere — only a gentle
         variation in the crop colour from plot to plot. */
      const cx = (p2.pts[0][0] + p2.pts[2][0]) / 2;
      const cy = (p2.pts[0][1] + p2.pts[2][1]) / 2;
      const rr = Math.max(Math.abs(p2.pts[2][0] - p2.pts[0][0]),
                          Math.abs(p2.pts[2][1] - p2.pts[0][1])) * 0.62;
      const base = p2.wet ? '#8fb6a4' : (i % 2 ? '#7fa65c' : '#5e8042');
      const peak = p2.wet ? 0.13 : 0.07 + rand() * 0.05;
      const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(12, rr));
      pg.addColorStop(0, hexToRgba(base, peak));
      pg.addColorStop(0.6, hexToRgba(base, peak * 0.55));
      pg.addColorStop(1, hexToRgba(base, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = pg;
      tracePlot(p2); ctx.fill();

      // Crop rows, clipped to the parcel so they end at its real edge.
      ctx.save();
      tracePlot(p2); ctx.clip();
      if (!p2.wet) {
        ctx.globalAlpha = 0.075;
        ctx.strokeStyle = '#3c5528'; ctx.lineWidth = 1;
        const vert = i % 3 === 0;
        const bb = p2.pts.reduce((o, q) => ({
          x0: Math.min(o.x0, q[0]), y0: Math.min(o.y0, q[1]),
          x1: Math.max(o.x1, q[0]), y1: Math.max(o.y1, q[1])
        }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
        ctx.beginPath();
        if (vert) for (let cx = bb.x0; cx < bb.x1; cx += 8) { ctx.moveTo(cx, bb.y0); ctx.lineTo(cx + 6, bb.y1); }
        else      for (let cy = bb.y0; cy < bb.y1; cy += 8) { ctx.moveTo(bb.x0, cy); ctx.lineTo(bb.x1, cy + 5); }
        ctx.stroke();
      } else {
        ctx.globalAlpha = 0.1; ctx.fillStyle = '#dff1ea';
        ctx.beginPath();
        ctx.ellipse((p2.pts[0][0] + p2.pts[2][0]) / 2, (p2.pts[0][1] + p2.pts[2][1]) / 2,
                    28, 7, p2.rot, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      /* Bunds: a soft earth ridge along each side, drawn as a faint line
         that follows the parcel's own irregular outline. No strokeRect,
         which is what produced the hard right angles. */
      // Only some parcels carry a visible bund: a boundary drawn around
      // every single plot is what made the grid read as a drawn lattice.
      if (i % 3 !== 1) {
        ctx.globalAlpha = 0.055;
        ctx.strokeStyle = '#3a4f26';
        ctx.lineWidth = 1.4;
        ctx.lineJoin = 'round';
        tracePlot(p2); ctx.stroke();
      }
    });

    // Dirt footpaths worn between the parcels.
    ctx.globalAlpha = 0.1; ctx.strokeStyle = '#9c8a5e';
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      let x = R(0, 540), y2 = 505;
      ctx.lineWidth = R(3, 6);
      ctx.beginPath(); ctx.moveTo(x, y2);
      while (y2 < 950) { x += R(-24, 24); y2 += R(48, 78); ctx.lineTo(x, y2); }
      ctx.stroke();
    }
    // Irrigation ditches following the contour.
    ctx.globalAlpha = 0.12; ctx.strokeStyle = '#7fa79a'; ctx.lineWidth = 2.2;
    for (let i = 0; i < 3; i++) {
      const y0 = R(540, 900);
      ctx.beginPath(); ctx.moveTo(-10, y0);
      for (let x = -10; x <= 550; x += 45) ctx.lineTo(x, y0 + Math.sin(x * 0.02 + i) * 6);
      ctx.stroke();
    }
    // Cut crop drying in stacks, and stones cleared to the field edges.
    for (let i = 0; i < 14; i++) {
      ctx.globalAlpha = 0.34; ctx.fillStyle = '#c9b167';
      ctx.beginPath(); ctx.ellipse(R(20, 520), R(535, 935), R(4, 8), R(2.5, 4.5), 0, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 18; i++) {
      ctx.globalAlpha = 0.26; ctx.fillStyle = '#6f7568';
      ctx.beginPath(); ctx.arc(R(15, 525), R(530, 940), R(1.4, 3), 0, Math.PI * 2); ctx.fill();
    }

  } else {
    // ---- Angeles: a built-up grid of blocks and streets ----
    // Streets first: broken into segments so nothing runs dead straight.
    const roadsY = [566, 664, 772, 878];
    ctx.lineCap = 'butt';
    roadsY.forEach((ry, i) => {
      const w = R(15, 21);
      ctx.globalAlpha = 0.22; ctx.fillStyle = '#2f3329';
      ctx.fillRect(-10, ry, 560, w);
      ctx.globalAlpha = 0.14; ctx.fillStyle = '#9aa08f';         // kerbs
      ctx.fillRect(-10, ry - 2, 560, 2);
      ctx.fillRect(-10, ry + w, 560, 2);
      ctx.globalAlpha = 0.2; ctx.strokeStyle = '#d9d6c4';        // centre dashes
      ctx.lineWidth = 1.4; ctx.setLineDash([9, 11]);
      ctx.beginPath(); ctx.moveTo(-10, ry + w / 2); ctx.lineTo(550, ry + w / 2); ctx.stroke();
      ctx.setLineDash([]);
    });
    const roadsX = [78, 214, 356, 470];
    roadsX.forEach(rx => {
      const w = R(12, 17);
      ctx.globalAlpha = 0.2; ctx.fillStyle = '#2f3329';
      ctx.fillRect(rx, 505, w, 450);
      ctx.globalAlpha = 0.12; ctx.fillStyle = '#9aa08f';
      ctx.fillRect(rx - 2, 505, 2, 450);
      ctx.fillRect(rx + w, 505, 2, 450);
    });
    // Paved lots and yards filling the blocks between the streets.
    for (let i = 0; i < 26; i++) {
      const x = R(0, 500), y = R(515, 930);
      ctx.globalAlpha = R(0.06, 0.14);
      ctx.fillStyle = rand() < 0.5 ? '#8d9285' : '#6f7568';
      ctx.fillRect(x, y, R(24, 62), R(16, 34));
    }
    // Zebra crossings where the streets meet.
    ctx.globalAlpha = 0.22; ctx.fillStyle = '#d9d6c4';
    roadsY.forEach(ry => {
      roadsX.forEach(rx => {
        if (rand() < 0.45) return;                 // not every junction
        for (let k = 0; k < 5; k++) ctx.fillRect(rx - 16 + k * 6, ry + 2, 3.4, 14);
      });
    });
    // Parking bays marked out along some frontages.
    ctx.globalAlpha = 0.15; ctx.strokeStyle = '#cfd3c2'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const x = R(20, 420), y = R(530, 920), n = 4 + (rand() * 4 | 0);
      for (let k = 0; k <= n; k++) {
        ctx.beginPath(); ctx.moveTo(x + k * 13, y); ctx.lineTo(x + k * 13, y + 17); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(x, y + 17); ctx.lineTo(x + n * 13, y + 17); ctx.stroke();
    }
    // Sidewalk paving, drains and manhole covers.
    ctx.globalAlpha = 0.09; ctx.strokeStyle = '#b9bcae'; ctx.lineWidth = 1;
    roadsY.forEach(ry => {
      for (let x = -6; x < 545; x += 14) {
        ctx.beginPath(); ctx.moveTo(x, ry - 8); ctx.lineTo(x, ry - 2); ctx.stroke();
      }
    });
    for (let i = 0; i < 12; i++) {
      const x = R(20, 520), y = R(530, 930);
      ctx.globalAlpha = 0.2; ctx.fillStyle = '#4a5044';
      ctx.beginPath(); ctx.ellipse(x, y, R(3, 5), R(1.6, 2.8), 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

function cacheStaticElements() {
  staticCanvas.width = canvas.width; staticCanvas.height = canvas.height;
  staticCtx.setTransform(RENDER_SX, 0, 0, RENDER_SY, 0, 0);
  
  // Layered ground gradient: sunlit warm green at top -> deeper earthy shadow at base
  const gStops = townGround().stops;
  const groundGrad = staticCtx.createLinearGradient(0, 500, 0, 960);
  groundGrad.addColorStop(0,    gStops[0]);   // sunlit
  groundGrad.addColorStop(0.28, gStops[1]);
  groundGrad.addColorStop(0.65, gStops[2]);   // shadowed
  groundGrad.addColorStop(1,    gStops[3]);   // deep base
  // Ground is cut to the alluvial toe, not a rectangle — see traceGroundToe.
  staticCtx.save();
  traceGroundToe(staticCtx);
  staticCtx.clip();
  staticCtx.fillStyle = groundGrad;
  staticCtx.fillRect(0, 440, 540, 520);
  staticCtx.restore();
  paintGroundToe(staticCtx, gStops);
  paintGroundRelief(staticCtx, gStops);
  paintGroundTexture(staticCtx);

  // River (Angeles only — see drawRiver docblock) drawn before the
  // vignette so its edges get the same soft edge-darkening as the rest
  // of the ground.
  drawRiver(staticCtx);

  // Radial ground vignette: darkened edges give perspective depth
  const vigGrad = staticCtx.createRadialGradient(270, 760, 80, 270, 760, 380);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.25)');
  /* Clipped to the terrain outline. This vignette was filling a plain
     rectangle from y=500, so even after the ground itself was cut to the
     alluvial toe it kept redrawing a straight horizontal edge across the
     full width — it, not the ground, was the seam that survived. */
  staticCtx.save();
  traceGroundToe(staticCtx);
  staticCtx.clip();
  staticCtx.fillStyle = vigGrad;
  staticCtx.fillRect(0, 440, 540, 520);
  staticCtx.restore();

  // Trees/bushes used to be baked in here as static pixels. They're now
  // drawn live every frame in drawPlants() so they can gently sway in the
  // wind (see the LIVING ENVIRONMENT section) — the ground fill above is
  // the only piece still cheap/static enough to stay cached.
  isStaticRendered = true;
}

// Precomputed per-channel mud texture/foam speckle fields — generated once
// (lazily, on first draw) rather than re-randomized every frame. Each
// speckle has a fixed position along the channel (`t`, 0..1) and a fixed
// perpendicular offset; drawLaharFlow only reveals speckles whose `t` is
// behind the current flow front, and gives them a small time-based wobble
// for a "roiling mud" feel without any per-frame randomness (which would
// read as flicker/noise instead of texture).
const MUD_TEXTURE_CACHE = {};
function getMudTexture(channelIndex) {
  if (!MUD_TEXTURE_CACHE[channelIndex]) {
    const rand = mulberry32(5000 + channelIndex * 131);
    const arr = [];
    const count = 46;
    for (let i = 0; i < count; i++) {
      arr.push({
        t: rand(),
        perp: (rand() - 0.5) * 24,
        size: 2 + rand() * 4.2,
        isFoam: rand() < 0.32,
        wobbleSeed: rand() * Math.PI * 2,
        speedMul: 0.75 + rand() * 0.6   // each fleck rides downstream at its own pace
      });
    }
    MUD_TEXTURE_CACHE[channelIndex] = arr;
  }
  return MUD_TEXTURE_CACHE[channelIndex];
}

// Larger, sparser "crust raft" patches — irregular dark polygons meant to
// read as chunks of cooled ash/debris riding on the flow's surface, as
// distinct from the fine mud/foam speckles above. Each has its own slow
// rotation so the rafts feel like they're gently turning as they drift.
const CRUST_TEXTURE_CACHE = {};
function getCrustTexture(channelIndex) {
  if (!CRUST_TEXTURE_CACHE[channelIndex]) {
    const rand = mulberry32(8300 + channelIndex * 251);
    const arr = [];
    const count = 9;
    for (let i = 0; i < count; i++) {
      const sides = 5 + Math.floor(rand() * 3);
      const verts = [];
      for (let s = 0; s < sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        verts.push({ a, r: 0.65 + rand() * 0.6 });
      }
      arr.push({
        t: rand(),
        perp: (rand() - 0.5) * 20,
        size: 5 + rand() * 6,
        verts,
        rotSpeed: (rand() - 0.5) * 0.3,
        rotSeed: rand() * Math.PI * 2,
        speedMul: 0.6 + rand() * 0.5   // heavy rafts drift slower than the fine foam
      });
    }
    CRUST_TEXTURE_CACHE[channelIndex] = arr;
  }
  return CRUST_TEXTURE_CACHE[channelIndex];
}

// Sparse "steam vent" positions per channel — at high lahar intensity,
// a few soft wisps rise from the hot mud's surface and drift/fade,
// reusing the same stateless life-cycle pattern as the crater's
// SMOKE_PUFFS (life = (ambientTime*speed+offset) % 1, so motion is
// perfectly smooth with zero per-frame bookkeeping).
const STEAM_VENT_CACHE = {};
function getSteamVents(channelIndex) {
  if (!STEAM_VENT_CACHE[channelIndex]) {
    const rand = mulberry32(6600 + channelIndex * 97);
    const arr = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      arr.push({
        t: rand(),
        perp: (rand() - 0.5) * 16,
        offset: i / count,
        speed: 0.18 + rand() * 0.12,
        driftX: (rand() - 0.5) * 10,
        riseHeight: 20 + rand() * 16,
        scale: 0.5 + rand() * 0.4
      });
    }
    STEAM_VENT_CACHE[channelIndex] = arr;
  }
  return STEAM_VENT_CACHE[channelIndex];
}

// ----- Deposition fan (the spread at the bottom of each channel) -----
// A real lahar's distal fan is not a clean ellipse: it's irregular and
// "digitate" (finger-like lobes of unequal length), pushes further
// downstream than side-to-side, has feathered rather than hard edges,
// drops coarser debris near its margins, and often shows small braided
// distributary rivulets threading out beyond the main body. The caches
// below back all of that.

// Per-channel angular radius multipliers for the fan's irregular
// silhouette — seeded once so the jagged outline is stable frame to
// frame and simply scales smoothly as `radius` grows.
const FAN_JITTER_CACHE = {};
function getFanJitter(channelIndex) {
  if (!FAN_JITTER_CACHE[channelIndex]) {
    const rand = mulberry32(7400 + channelIndex * 173);
    const sides = 14;
    const arr = [];
    for (let s = 0; s < sides; s++) arr.push(0.5 + rand() * 0.9);
    FAN_JITTER_CACHE[channelIndex] = arr;
  }
  return FAN_JITTER_CACHE[channelIndex];
}

// Traces the fan's irregular boundary around `front`. Radius per angle
// combines the seeded jitter, a forward bias (fans push further in the
// direction the channel was already flowing than they do sideways/back),
// and a slow time-based wobble so the margin gently ripples.
function traceDeltaFan(context, front, radius, jitter, wobbleSeed) {
  const sides = jitter.length;
  context.beginPath();
  for (let s = 0; s <= sides; s++) {
    const idx = s % sides;
    const angle = (idx / sides) * Math.PI * 2;
    const forwardBias = 1 + 0.6 * Math.max(0, Math.cos(angle - front.angle));
    const wobble = 1 + Math.sin(ambientTime * 1.1 + idx * 1.7 + wobbleSeed) * 0.05;
    const r = radius * jitter[idx] * forwardBias * wobble;
    const x = front.x + Math.cos(angle) * r;
    const y = front.y + Math.sin(angle) * r * 0.58;
    if (s === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath();
}

// Per-channel distributary rivulets — a few thin braided streams that
// thread outward beyond the main fan body, biased toward the downstream
// direction, each with its own gentle curve and taper.
const RIVULET_CACHE = {};
function getRivulets(channelIndex) {
  if (!RIVULET_CACHE[channelIndex]) {
    const rand = mulberry32(9100 + channelIndex * 211);
    const count = 4;
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        angleOffset: (rand() - 0.5) * 1.7,
        lengthMul: 0.95 + rand() * 0.55,
        curve: (rand() - 0.5) * 0.7,
        widthMul: 0.5 + rand() * 0.5
      });
    }
    RIVULET_CACHE[channelIndex] = arr;
  }
  return RIVULET_CACHE[channelIndex];
}

function drawRivulets(context, front, radius, overFactor, rivulets, color) {
  rivulets.forEach(rv => {
    const baseAngle = front.angle + rv.angleOffset;
    const len = radius * rv.lengthMul * (0.5 + 0.5 * overFactor);
    const steps = 6;
    context.beginPath();
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const r = t * len;
      const curveOffset = Math.sin(t * Math.PI) * rv.curve;
      const ang = baseAngle + curveOffset;
      const x = front.x + Math.cos(ang) * r;
      const y = front.y + Math.sin(ang) * r * 0.58;
      if (s === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.strokeStyle = color;
    context.lineWidth = 3 * rv.widthMul;
    context.lineCap = 'round';
    context.globalAlpha = 0.32 * overFactor;
    context.stroke();
  });
  context.globalAlpha = 1;
}

// ----- Organic ribbon body -----
// Instead of a constant-width stroke (which reads as a perfectly smooth
// pipe), the flow body is built as a ribbon whose width undulates along
// its length using two traveling sine waves — the `-ambientTime` term
// shifts phase with t, so the undulation pattern visibly migrates
// downstream over time like a real surge/pulse moving through viscous
// mud, rather than just breathing in place. `wobbleSeed` (derived from
// the channel index) keeps each channel's pulse pattern out of sync with
// the others so multiple channels never pulse in lockstep.
function computeLaharSamples(path, totalLen, progress, wobbleSeed, severT, severFade) {
  // Ribbon vertices sit at FIXED stations along the channel (one every
  // SAMPLE_STEP of its length) plus one exact vertex at the front. A
  // station never moves once the flow has passed it; as the head advances
  // a new station is simply added behind it. The previous scheme spaced
  // the vertices as fractions of the flowed length, so every vertex — and
  // the width envelope — re-spaced each time the front moved, stretching
  // the body like a rubber band and making the rear appear to slide.
  const SAMPLE_STEP = 0.02;
  // All three undulation harmonics share ONE phase speed, so the bank
  // pattern translates rigidly downstream. With different speeds their
  // interference makes bulges appear to slide back toward the crater.
  const vPhase = ambientTime * 0.08;
  const fading = (severFade !== undefined && severFade < 1 && severT !== undefined && severT < progress);
  const stations = [];
  for (let t = 0; t < progress - 1e-6; t += SAMPLE_STEP) stations.push(t);
  stations.push(progress);
  const samples = [];
  for (let i = 0; i < stations.length; i++) {
    const t = stations[i];
    const pt = pointAtProgress(path, t, totalLen);
    // Width envelope is measured back from the FRONT (absolute distance),
    // not as a fraction of the flowed length: the body keeps a steady
    // width, and only the bulging head travels with the leading edge.
    const behind = progress - t;
    const growth = 1 + 0.18 * Math.max(0, 1 - behind / 0.12);
    const wobble =
      Math.sin((t - vPhase) * 34 + wobbleSeed) * 0.15 +
      Math.sin((t - vPhase) * 95 + wobbleSeed * 1.31) * 0.07 +
      Math.sin((t - vPhase) * 180 + wobbleSeed * 2.7) * 0.04;
    // Leading edge gets extra raggedness
    const edgeFray = behind < 0.06 ? Math.sin(t * 250 + wobbleSeed * 5) * 0.12 : 0;
    // Wider on flatter terrain (small angle = flat)
    const localSlope = Math.abs(Math.sin(pt.angle));
    const terrainWidth = 1 + (1 - localSlope) * 0.3;
    let widthMul = Math.max(0.32, (growth + wobble + edgeFray) * terrainWidth);
    // Severed downstream mud dries up: taper its width to nothing past the
    // dike as severFade -> 0, so it fades away in place instead of reversing.
    if (fading && t > severT) {
      const shoulder = Math.min(1, (t - severT) / 0.05); // smooth neck at the dike
      widthMul *= (1 - shoulder * (1 - severFade));
    }
    const perpAngle = pt.angle + Math.PI / 2;
    samples.push({
      x: pt.x, y: pt.y, t, angle: pt.angle,
      nx: Math.cos(perpAngle), ny: Math.sin(perpAngle),
      widthMul
    });
  }
  return samples;
}

// Traces one ribbon layer (a fraction of the full body half-width) from
// precomputed samples — cheap to call repeatedly per layer since all the
// trig/pointAtProgress work already happened once in computeLaharSamples.
function traceLaharRibbon(context, samples, halfWidth, scaleFrac) {
  context.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const hw = halfWidth * scaleFrac * s.widthMul;
    const x = s.x + s.nx * hw, y = s.y + s.ny * hw;
    if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i];
    const hw = halfWidth * scaleFrac * s.widthMul;
    const x = s.x - s.nx * hw, y = s.y - s.ny * hw;
    context.lineTo(x, y);
  }
  context.closePath();
}

// ----- Downstream conveyor -----
// Every surface feature (speckle, raft, flow line, ripple band) is given a
// position that ADVANCES along the channel with time instead of sitting at
// a fixed t. `cycle` wraps 0..1 so the feature is born at the source, rides
// to the current front, fades, and respawns at the top — a continuous
// conveyor with zero per-frame bookkeeping. Speed scales with lahar volume
// so a raging flow visibly rushes while a dying one crawls.
function laharFlowSpeed(intensity) {
  return 0.05 + intensity * 0.09; // channel-lengths per second
}
// The conveyor phase is INTEGRATED frame by frame (phase += speed * dt), so
// it can only ever grow. Computing it as `ambientTime * currentSpeed`
// looked equivalent but was not: the speed follows the rain volume, and
// every time the volume dropped the product shrank — sliding the entire
// surface texture back toward the crater, by more the longer the session
// had been running. That was the "rubber-band" backward pull.
let laharFlowPhase = 0, laharFlowLastT = null;
function advanceLaharFlowPhase(intensity) {
  const dt = laharFlowLastT === null ? 0 : Math.max(0, Math.min(0.1, ambientTime - laharFlowLastT));
  laharFlowLastT = ambientTime;
  laharFlowPhase += laharFlowSpeed(intensity) * dt;
}
function flowCycle(baseT, speedMul) {
  return (baseT + laharFlowPhase * speedMul) % 1;
}
// Smooth fade-in near the source and fade-out just behind the front, so
// nothing pops into or out of existence.
function flowFade(cycle) {
  return Math.min(1, cycle * 6) * Math.min(1, (1 - cycle) * 5);
}

// Longitudinal flow lines: thin, lighter streaks stretched ALONG the
// current, riding downstream. These are the strongest cue that a viscous
// sheet is sliding, far more so than stationary specks.
function drawFlowLines(context, path, totalLen, progress, halfWidth, seed, intensity, count) {
  const rand = mulberry32(seed);
  for (let k = 0; k < count; k++) {
    const baseT = rand(), perpFrac = (rand() - 0.5) * 1.1, speedMul = 0.8 + rand() * 0.5;
    const lenT = 0.03 + rand() * 0.04;
    const cycle = flowCycle(baseT, speedMul, intensity);
    const tEnd = cycle * progress;
    const tStart = Math.max(0, tEnd - lenT);
    if (tEnd - tStart < 0.005) continue;
    const alpha = flowFade(cycle) * (0.16 + intensity * 0.2);
    context.beginPath();
    const steps = 4;
    for (let s = 0; s <= steps; s++) {
      const t = tStart + (tEnd - tStart) * (s / steps);
      const pt = pointAtProgress(path, t, totalLen);
      const perp = pt.angle + Math.PI / 2;
      const off = halfWidth * perpFrac;
      const x = pt.x + Math.cos(perp) * off, y = pt.y + Math.sin(perp) * off;
      if (s === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.globalAlpha = alpha;
    context.strokeStyle = '#efe6d2';
    context.lineWidth = 1.2 + rand() * 1.2;
    context.lineCap = 'round';
    context.stroke();
  }
  context.globalAlpha = 1;
}

// Transverse ripple bands: shallow crescents across the flow that travel
// downstream — the standing-wave / surge-crest look of fast wet mud.
// A light crest and a dark trough are drawn one step apart.
function drawRippleBands(context, path, totalLen, progress, halfWidth, seed, intensity, count) {
  for (let k = 0; k < count; k++) {
    const cycle = flowCycle(k / count + seed * 0.13, 1.15, intensity);
    const t = cycle * progress;
    if (t < 0.03 || t > progress * 0.97) continue;
    const pt = pointAtProgress(path, t, totalLen);
    const alpha = flowFade(cycle) * (0.18 + intensity * 0.22);
    const hw = halfWidth * (0.55 + 0.25 * Math.sin(ambientTime * 2 + k));
    context.save();
    context.translate(pt.x, pt.y);
    context.rotate(pt.angle);
    context.lineCap = 'round';
    context.globalAlpha = alpha;
    context.strokeStyle = 'rgba(255,246,228,0.9)';
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(-1, -hw);
    context.quadraticCurveTo(6, 0, -1, hw);
    context.stroke();
    context.strokeStyle = 'rgba(28,20,14,0.9)';
    context.lineWidth = 2.2;
    context.beginPath();
    context.moveTo(-4, -hw * 0.9);
    context.quadraticCurveTo(3, 0, -4, hw * 0.9);
    context.stroke();
    context.restore();
  }
  context.globalAlpha = 1;
}

// Churning flow front: real lahar snouts are bulging, boulder-laden walls
// that lurch forward, tumble rocks along their lip, and fling mud. Drawn
// in the front's local frame (x = downstream, y = across).
function drawLaharSnout(context, front, halfWidth, intensity, seed, fadeAlpha, spreadFactor) {
  const lurch = 1 + 0.03 * Math.sin(ambientTime * 3.1 + seed);
  // rx runs downstream (short: a wall of mud, not a tongue), ry runs
  // across the channel (wide, slightly beyond the body so it bulges).
  const rx = (halfWidth * 0.55 + spreadFactor * 6) * lurch;
  const ry = (halfWidth * 1.08 + spreadFactor * 10) * lurch;
  const dark = lerpColor('#5d554b', '#1f170f', intensity);
  const body = lerpColor('#8a8275', '#4a3a2c', intensity);
  const lip  = lerpColor('#b9b0a0', '#7c6a56', intensity);

  context.save();
  context.translate(front.x, front.y);
  context.rotate(front.angle);
  context.globalAlpha = fadeAlpha;

  // Ground shadow pushed slightly ahead of the wall of mud
  context.fillStyle = 'rgba(0,0,0,0.22)';
  context.beginPath(); context.ellipse(3, 3, rx * 1.05, ry * 0.9, 0, 0, Math.PI * 2); context.fill();

  // Bulging snout body, lit from behind/above so the leading face is dark
  const g = context.createRadialGradient(-rx * 0.35, -ry * 0.3, 1, 0, 0, rx);
  g.addColorStop(0, lip);
  g.addColorStop(0.6, body);
  g.addColorStop(1, dark);
  context.fillStyle = g;
  context.beginPath(); context.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); context.fill();

  // Rolling lip: a lighter crescent that tumbles over the front edge
  const roll = (ambientTime * 1.6 + seed) % 1;
  context.globalAlpha = fadeAlpha * 0.65 * Math.sin(roll * Math.PI); // 0 at both ends, so no visible snap-back
  context.strokeStyle = 'rgba(245,236,220,0.9)';
  context.lineWidth = 2;
  context.beginPath();
  context.ellipse(rx * (0.15 + roll * 0.35), 0, rx * 0.55, ry * 0.75, 0, -1.1, 1.1);
  context.stroke();

  // Tumbling boulders along the lip — each orbits/rotates on its own
  const rand = mulberry32(seed * 31 + 7);
  const boulders = 4;
  for (let b = 0; b < boulders; b++) {
    const lane = (b - (boulders - 1) / 2) / boulders;   // across the front
    const spin = ambientTime * (2.2 + rand() * 1.5) + rand() * 6;
    const bx = rx * (0.55 + 0.25 * rand());          // fixed seat on the lip
    const by = ry * lane * 1.6 + Math.sin(spin) * 1.5; // bob, but never slide back
    const bs = 2.6 + rand() * 2.4 + intensity * 1.2;
    context.globalAlpha = fadeAlpha * 0.95;
    context.save();
    context.translate(bx, by);
    context.rotate(spin);
    context.fillStyle = '#5a5047';
    context.strokeStyle = 'rgba(20,14,8,0.7)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(-bs, -bs * 0.6); context.lineTo(bs * 0.6, -bs); context.lineTo(bs, bs * 0.4); context.lineTo(-bs * 0.4, bs);
    context.closePath(); context.fill(); context.stroke();
    context.fillStyle = 'rgba(255,255,255,0.28)';
    context.beginPath(); context.arc(-bs * 0.3, -bs * 0.35, bs * 0.35, 0, Math.PI * 2); context.fill();
    context.restore();
  }

  // Mud flung ahead of the wall: short-lived droplets arcing forward
  const drops = 6;
  for (let d = 0; d < drops; d++) {
    const life = (ambientTime * (1.4 + (d % 3) * 0.3) + d / drops + seed * 0.07) % 1;
    const spread = ((d % 4) - 1.5) / 1.5;
    const dx = rx * 0.7 + life * (12 + intensity * 12);
    const dy = spread * ry * 0.7 * (0.6 + life);
    const lift = Math.sin(life * Math.PI) * (6 + intensity * 5);
    const a = fadeAlpha * (1 - life) * 0.8;
    if (a < 0.02) continue;
    context.globalAlpha = a;
    context.fillStyle = d % 3 === 0 ? 'rgba(235,225,205,0.9)' : body;
    context.beginPath();
    context.ellipse(dx, dy - lift * 0.4, 2.6 - life * 1.2, 1.6 - life * 0.6, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function drawLaharFlow(context) {
  context.save(); context.lineCap = 'round'; context.lineJoin = 'round';
  advanceLaharFlowPhase(state.laharVolume / 100); // once per frame; branches reuse the same phase

  // Danger palette: as laharVolume climbs, the mud reads darker, wetter,
  // and more ominous instead of a flat static brown — purely a color
  // interpolation layered on the ribbon fill technique, so channel
  // geometry/collision are completely untouched.
  const intensity = state.laharVolume / 100;
  /* ---- SMOLDERING PALETTE ----
     The flow now reads as hot volcanic material rather than cold grey mud,
     but deliberately stays MUD: the layers run dark reddish-brown on the
     outside and only turn crimson/burnt-orange toward the centre, where a
     real lahar's hot interior would be. Nothing here is a bright lava
     yellow — the brightest tone is a burnt orange that only shows at high
     volume, so a small flow still looks like heavy wet ash.

     Only colours change: widths, samples and geometry are untouched, so
     collision, pathing and the forward-only movement are unaffected. */
  /* TONED DOWN. The first pass made the core so wide and saturated that the
     flow read as bright lava — the thing this must not look like. The crust
     tones now stay genuinely muddy and the hot tones are darker and far
     more restrained, so heat shows as seams within dark material rather
     than as a glowing river. */
  const outerColor = lerpColor('#544539', '#241811', intensity);   // cool crust
  const midColor   = lerpColor('#5c4033', '#36201a', intensity);   // dark mud, faint red
  const innerColor = lerpColor('#6b3c28', '#4d2416', intensity);   // deep reddish-brown
  const sheenColor = lerpColor('#8a5334', '#7a3316', intensity);   // dull burnt orange

  const leveeColor = lerpColor('#40312a', '#1e120d', intensity);

  // Slow flicker for the hot areas. One shared value per frame, so the
  // glow pulses together like a single mass of heat rather than each patch
  // strobing on its own — and it costs one sin() per frame, not per patch.
  const heatPulse = 0.72 + Math.sin(ambientTime * 2.3) * 0.16
                         + Math.sin(ambientTime * 5.7) * 0.07;

  // Body width follows volume: a full-flood flow is fat, a stalled/draining
  // one visibly thins in place (the front never retreats, see recedeSpd).
  const bodyHalf = 14 + intensity * 11;

  for (let i = 0; i < channelPaths.length; i++) {
    const progress = state.laharProgresses[i];
    if (progress <= 0) continue;

    const severFade = state.severFade ? state.severFade[i] : 1;
    const severT = state.severT ? state.severT[i] : 1;
    const severing = severFade < 1 && severT < progress;

    const samples = computeLaharSamples(channelPaths[i], CHANNEL_LENS[i], progress, i * 2.17 + 0.6, severT, severFade);

    // Outer danger-glow halo: hot orange-brown aura that intensifies with lahar volume
    if (intensity > 0.2) {
      traceLaharRibbon(context, samples, bodyHalf, 1.48);
      context.globalAlpha = 0.15 * intensity;
      context.fillStyle = lerpColor('#c07030', '#ff5500', intensity);
      context.fill();
    }

    // Base body: soft shadow -> mid mud -> lit core, now shaped as an
    // organic undulating ribbon instead of a constant-width pipe so the
    // banks visibly bulge and narrow like a real viscous flow.
    traceLaharRibbon(context, samples, bodyHalf, 1.0);
    context.globalAlpha = 0.62; context.fillStyle = outerColor; context.fill();
    context.globalAlpha = 1;
    traceLaharRibbon(context, samples, bodyHalf, 0.71); context.fillStyle = midColor; context.fill();
    traceLaharRibbon(context, samples, bodyHalf, 0.38); context.fillStyle = innerColor; context.fill();

    /* Molten core: a narrow band of glowing material down the centre of the
       flow, brightest where the mud is deepest. 'lighter' makes it read as
       emitted heat rather than painted-on colour, and because it is clipped
       to the same ribbon it can never spill outside the flow. */
    if (intensity > 0.12) {
      context.save();
      context.globalCompositeOperation = 'lighter';
      // Narrow and faint: a seam of heat, not a channel of lava.
      traceLaharRibbon(context, samples, bodyHalf, 0.20);
      context.globalAlpha = 0.10 * intensity * heatPulse;
      context.fillStyle = '#7a2708';
      context.fill();
      traceLaharRibbon(context, samples, bodyHalf, 0.075);
      context.globalAlpha = 0.13 * intensity * heatPulse;
      context.fillStyle = '#b8480f';
      context.fill();
      context.restore();
    }

    /* Glowing cracks between the cooler crust plates. Drawn as short
       segments along the existing sample list, so no extra geometry is
       generated — a handful of strokes per channel. */
    if (intensity > 0.2) {
      context.save();
      context.globalCompositeOperation = 'lighter';
      context.lineCap = 'round';
      for (let k = 2; k < samples.length - 2; k += 3) {
        const a = samples[k], bS = samples[k + 1];
        if (!a || !bS) continue;
        // Deterministic per-segment variation, so cracks sit in fixed places
        // on the flow instead of crawling about between frames.
        const wob = Math.sin(k * 2.7 + i * 1.3);
        const flick = 0.55 + 0.45 * Math.sin(ambientTime * 3.1 + k * 0.9 + i);
        const off = wob * bodyHalf * 0.34 * a.widthMul;
        const nx = -(bS.y - a.y), ny = (bS.x - a.x);
        const nl = Math.hypot(nx, ny) || 1;
        context.globalAlpha = 0.085 * intensity * flick * heatPulse;
        context.strokeStyle = wob > 0 ? '#ff7a2a' : '#c93d10';
        context.lineWidth = 1.6 + Math.abs(wob) * 1.8;
        context.beginPath();
        context.moveTo(a.x + (nx / nl) * off, a.y + (ny / nl) * off);
        context.lineTo(bS.x + (nx / nl) * off * 0.6, bS.y + (ny / nl) * off * 0.6);
        context.stroke();
      }
      context.restore();
    }

    // Glossy wet-mud sheen — wider and brighter for that viscous slick look
    traceLaharRibbon(context, samples, bodyHalf, 0.17);
    context.globalAlpha = 0.20; context.fillStyle = sheenColor; context.fill();
    // Bright specular highlight that appears as the flow peaks
    if (intensity > 0.45) {
      context.globalAlpha = 0.07 * intensity * heatPulse;
      context.fillStyle = '#d99a63';   // warm glint, kept subtle
      context.fill();
    }
    context.globalAlpha = 1;

    // Surge pulse bands: periodic darker waves traveling downstream
    // within the flow body, selling viscous internal movement
    const surgeCount = 4;
    for (let sIdx = 0; sIdx < surgeCount; sIdx++) {
      const cycle = (ambientTime * 0.11 + sIdx / surgeCount + i * 0.37) % 1;
      const surgeT = cycle * progress;
      if (surgeT < 0.02 || surgeT > progress * 0.95) continue;
      const surgePt = pointAtProgress(channelPaths[i], surgeT, CHANNEL_LENS[i]);
      const surgeAlpha = Math.sin(cycle * Math.PI) * 0.18 * intensity;
      if (surgeAlpha < 0.01) continue;
      context.save();
      context.translate(surgePt.x, surgePt.y);
      context.rotate(surgePt.angle);
      context.globalAlpha = surgeAlpha;
      context.fillStyle = '#2a2118';
      context.beginPath();
      context.ellipse(0, 0, 4, bodyHalf * 0.7, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    // Sediment levees: a thin darker line traced along the outer banks,
    // reading as raised deposited material along the flow's edges.
    context.globalAlpha = 0.5;
    context.strokeStyle = leveeColor;
    context.lineWidth = 1.6;
    context.beginPath();
    samples.forEach((s, idx) => {
      const hw = bodyHalf * s.widthMul;
      const x = s.x + s.nx * hw, y = s.y + s.ny * hw;
      if (idx === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
    context.beginPath();
    samples.forEach((s, idx) => {
      const hw = bodyHalf * s.widthMul;
      const x = s.x - s.nx * hw, y = s.y - s.ny * hw;
      if (idx === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
    context.globalAlpha = 1;

    // Longitudinal flow lines + transverse ripple crests, both riding
    // downstream — the core "this sheet of mud is sliding" cues.
    drawFlowLines(context, channelPaths[i], CHANNEL_LENS[i], progress, bodyHalf * 0.75, 3100 + i * 77, intensity, 9);
    drawRippleBands(context, channelPaths[i], CHANNEL_LENS[i], progress, bodyHalf, i + 1, intensity, 6);

    // Mud clumps + foam speckles: revealed progressively as the front
    // advances, with a gentle sinusoidal wobble for a "roiling" feel.
    // Each fleck now RIDES the conveyor (see flowCycle) and is stretched
    // along the current rather than across it — smeared foam streaks.
    const speckles = getMudTexture(i);
    speckles.forEach(s => {
      const cycle = flowCycle(s.t, s.speedMul, intensity);
      const tt = cycle * progress;
      const pt = pointAtProgress(channelPaths[i], tt, CHANNEL_LENS[i]);
      const wobble = Math.sin(ambientTime * 1.3 + s.wobbleSeed) * 2.2;
      const perpAngle = pt.angle + Math.PI / 2;
      const offset = s.perp + wobble;
      const px = pt.x + Math.cos(perpAngle) * offset;
      const py = pt.y + Math.sin(perpAngle) * offset * 0.6;
      context.globalAlpha = flowFade(cycle);
      context.fillStyle = s.isFoam ? 'rgba(226,220,206,0.65)' : 'rgba(50,42,34,0.34)';
      context.beginPath();
      context.ellipse(px, py, s.size * 1.6, s.size * 0.5, pt.angle, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;

    // Crust rafts: larger irregular dark chunks drifting on the surface,
    // slowly rotating in place — reads as settling debris/ash chunks
    // riding along in the flow, distinct from the fine speckle texture.
    const crusts = getCrustTexture(i);
    crusts.forEach(c => {
      const cycle = flowCycle(c.t, c.speedMul, intensity);
      const pt = pointAtProgress(channelPaths[i], cycle * progress, CHANNEL_LENS[i]);
      const perpAngle = pt.angle + Math.PI / 2;
      const px = pt.x + Math.cos(perpAngle) * c.perp;
      const py = pt.y + Math.sin(perpAngle) * c.perp * 0.6;
      const alpha = flowFade(cycle) * 0.55;
      if (alpha <= 0.01) return;
      context.save();
      context.translate(px, py);
      context.rotate(c.rotSeed + ambientTime * c.rotSpeed);
      context.globalAlpha = alpha;
      context.fillStyle = 'rgba(40,33,26,0.85)';
      context.beginPath();
      c.verts.forEach((v, idx) => {
        const x = Math.cos(v.a) * c.size * v.r, y = Math.sin(v.a) * c.size * v.r * 0.7;
        if (idx === 0) context.moveTo(x, y); else context.lineTo(x, y);
      });
      context.closePath();
      context.fill();
      context.restore();
    });
    context.globalAlpha = 1;

    // Steam wisps: at high intensity the mud reads as hot, so a few soft
    // wisps rise from its surface and drift/fade — ties into the
    // volcanic theme (hot pyroclastic material mixing with rainwater).
    if (intensity > 0.45) {
      const vents = getSteamVents(i);
      vents.forEach(v => {
        if (v.t > progress) return;
        const life = ((ambientTime * v.speed) + v.offset) % 1;
        const pt = pointAtProgress(channelPaths[i], v.t, CHANNEL_LENS[i]);
        const perpAngle = pt.angle + Math.PI / 2;
        const baseX = pt.x + Math.cos(perpAngle) * v.perp;
        const baseY = pt.y + Math.sin(perpAngle) * v.perp * 0.6;
        const vy = baseY - life * v.riseHeight;
        const vx = baseX + v.driftX * life;
        const alpha = Math.min(1, life * 4) * Math.min(1, (1 - life) * 2.5) * ((intensity - 0.45) / 0.55) * 0.35;
        if (alpha <= 0.01) return;
        const r = (6 + life * 10) * v.scale;
        const steamGrad = context.createRadialGradient(vx, vy, 0, vx, vy, r);
        steamGrad.addColorStop(0, `rgba(230,225,215,${alpha})`);
        steamGrad.addColorStop(1, 'rgba(230,225,215,0)');
        context.fillStyle = steamGrad;
        context.beginPath(); context.arc(vx, vy, r, 0, Math.PI * 2); context.fill();
      });
    }

    const front = pointAtProgress(channelPaths[i], progress, CHANNEL_LENS[i]);
    const reveal = (state.headReveal && state.headReveal[i] !== undefined) ? state.headReveal[i] : 1;
    const spread = getChannelSpread(progress);
    const overFactor = spread.overFactor * reveal, radius = spread.radius;
    if (overFactor > 0 && !severing) {
      const jitter = getFanJitter(i);

      // Outer danger-red halo at high lahar volume — reads as near-lava heat
      if (intensity > 0.55) {
        traceDeltaFan(context, front, radius * 1.5, jitter, i * 3.1 + 4);
        context.globalAlpha = 1;
        const dangerGrad = context.createRadialGradient(front.x, front.y, 0, front.x, front.y, radius * 1.6);
        dangerGrad.addColorStop(0, `rgba(190,55,15,${0.24 * overFactor * intensity})`);
        dangerGrad.addColorStop(1, 'rgba(190,55,15,0)');
        context.fillStyle = dangerGrad;
        context.fill();
      }

      // Distributary rivulets — thin braided streams threading outward
      // beyond the main fan body, drawn first so the fan body overlaps
      // their base and only their outer reach shows past the margin.
      drawRivulets(context, front, radius, overFactor, getRivulets(i), midColor);

      // Deposition fan: irregular, digitate silhouette (not a clean
      // ellipse) that pushes further downstream than to the sides, with
      // feathered edges via a soft outer wash pass beneath the main fill.
      traceDeltaFan(context, front, radius * 1.22, jitter, i * 3.1 + 1);
      const washGrad = context.createRadialGradient(front.x, front.y, 0, front.x, front.y, radius * 1.22);
      washGrad.addColorStop(0, `rgba(96, 84, 71, ${0.22 * overFactor})`);
      washGrad.addColorStop(1, 'rgba(96, 84, 71, 0)');
      context.fillStyle = washGrad;
      context.fill();

      traceDeltaFan(context, front, radius, jitter, i * 3.1 + 1);
      const fanGrad = context.createRadialGradient(front.x, front.y, 0, front.x, front.y, radius);
      fanGrad.addColorStop(0,   `rgba(130, 118, 106, ${0.7 * overFactor})`);
      fanGrad.addColorStop(0.4, `rgba(110,  97,  83, ${0.5 * overFactor})`);
      fanGrad.addColorStop(0.75,`rgba(96,  83,  70, ${0.28 * overFactor})`);
      fanGrad.addColorStop(1,   'rgba(88, 76, 64, 0)');
      context.fillStyle = fanGrad;
      context.fill();

      // Coarse debris concentrated at the fan's margin — real lahars drop
      // their heaviest material first as the flow decelerates and
      // spreads, leaving boulder-strewn lobe edges.
      if (overFactor > 0.25) {
        const boulderRand = mulberry32(4200 + i * 61);
        jitter.forEach((jv, idx) => {
          if (boulderRand() > 0.6) return; // sparse, not every vertex
          const angle = (idx / jitter.length) * Math.PI * 2;
          const forwardBias = 1 + 0.6 * Math.max(0, Math.cos(angle - front.angle));
          const r = radius * jv * forwardBias * 0.94;
          const bx = front.x + Math.cos(angle) * r;
          const by = front.y + Math.sin(angle) * r * 0.58;
          const bs = 2.5 + boulderRand() * 2.5;
          context.globalAlpha = 0.6 * overFactor;
          context.fillStyle = '#4a4038';
          context.beginPath(); context.ellipse(bx, by, bs, bs * 0.75, angle, 0, Math.PI * 2); context.fill();
          context.fillStyle = 'rgba(255,255,255,0.14)';
          context.beginPath(); context.ellipse(bx - bs * 0.3, by - bs * 0.3, bs * 0.35, bs * 0.25, 0, 0, Math.PI * 2); context.fill();
        });
        context.globalAlpha = 1;
      }

      // Lobate flow front: two secondary bulges, offset to either side
      // of the main heading and slowly pulsing in size, layer on top of
      // the digitate fan for an uneven, muscular leading edge.
      [-1, 1].forEach(side => {
        const lobeAngle = front.angle + side * 0.62;
        const lobePulse = 0.82 + 0.18 * Math.sin(ambientTime * 1.4 + i * 1.7 + side);
        const lobeR = radius * 0.55 * lobePulse;
        const lx = front.x + Math.cos(lobeAngle) * radius * 0.42;
        const ly = front.y + Math.sin(lobeAngle) * radius * 0.42 * 0.58;
        const lobeGrad = context.createRadialGradient(lx, ly, 0, lx, ly, lobeR);
        lobeGrad.addColorStop(0,   `rgba(120, 108, 96, ${0.5 * overFactor})`);
        lobeGrad.addColorStop(1,   'rgba(88, 76, 64, 0)');
        context.fillStyle = lobeGrad;
        context.beginPath();
        context.ellipse(lx, ly, lobeR, lobeR * 0.6, 0, 0, Math.PI * 2);
        context.fill();
      });

      // Denser bubbling foam ring — more flecks at varied radii and sizes
      // Foam flecks are pushed OUTWARD from the front (born near the
      // centre, dying at the margin) rather than orbiting it — an orbit
      // sends half the flecks back upstream, which reads as reversal.
      const foamCount = 12;
      for (let f = 0; f < foamCount; f++) {
        const fa = (f / foamCount) * Math.PI * 2 + i * 0.7;
        const life = (ambientTime * (0.45 + (f % 3) * 0.12) + f / foamCount) % 1;
        const fr = radius * (0.25 + life * 0.7);
        const fx = front.x + Math.cos(fa) * fr;
        const fy = front.y + Math.sin(fa) * fr * 0.58;
        context.globalAlpha = (0.52 + (f % 3) * 0.18) * overFactor * Math.sin(life * Math.PI);
        context.fillStyle = f % 4 === 0 ? 'rgba(245,238,224,0.95)' : (f % 4 === 1 ? 'rgba(218,206,190,0.78)' : 'rgba(200,188,170,0.6)');
        context.beginPath();
        context.ellipse(fx, fy, 3.2 + (f % 3) * 0.8, 2.4, 0, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    }
    // Churning, boulder-laden snout in place of the old flat front disc
    drawLaharSnout(context, front, bodyHalf, intensity, i + 1, (severing ? severFade : 1) * reveal, overFactor);
  }
  context.restore();

  // Spray: elongated mud droplets that fly with the current (velocity is
  // integrated in simulate()), fading as they land.
  state.flowParticles.forEach(p => {
    const a = Math.max(0, p.life);
    if (a <= 0.01) return;
    context.save();
    context.globalAlpha = a * 0.85;
    context.translate(p.x, p.y);
    context.rotate(p.angle || 0);
    context.fillStyle = p.light ? '#d8cfbc' : '#3f3831';
    context.beginPath(); context.ellipse(0, 0, 3.2, 1.6, 0, 0, Math.PI * 2); context.fill();
    context.restore();
  });
}

// Branch flow texture cache (speckles, crusts) for visual density
const BRANCH_TEXTURE_CACHE = {};
function getBranchTexture(idx) {
  if (!BRANCH_TEXTURE_CACHE[idx]) {
    const rand = mulberry32(8300 + idx * 197);
    const count = 10;
    const speckles = [];
    for (let s = 0; s < count; s++) {
      speckles.push({
        t: rand() * 0.95,
        perp: (rand() - 0.5) * 6,
        size: 1.2 + rand() * 1.8,
        isFoam: rand() > 0.65,
        wobbleSeed: rand() * Math.PI * 2,
        speedMul: 0.8 + rand() * 0.6
      });
    }
    BRANCH_TEXTURE_CACHE[idx] = speckles;
  }
  return BRANCH_TEXTURE_CACHE[idx];
}

// Computes organic ribbon samples along a branch flow
function computeBranchSamples(path, totalLen, progress, branchIndex, severT, severFade) {
  // Fixed stations + exact front vertex (see computeLaharSamples).
  const SAMPLE_STEP = 0.03;
  const fading = (severFade !== undefined && severFade < 1 && severT !== undefined && severT < progress);
  const samples = [];
  const baseHalfWidth = 5.5 + progress * 4.5; // half width grows from 5.5px to 10px
  const stations = [];
  for (let t = 0; t < progress - 1e-6; t += SAMPLE_STEP) stations.push(t);
  stations.push(progress);

  for (let s = 0; s < stations.length; s++) {
    const t = stations[s];
    const pt = pointAtProgress(path, t, totalLen);

    // Fork expansion at origin (smoothly joins parent channel)
    const forkFlare = t < 0.18 ? 1 + (1 - t / 0.18) * 0.75 : 1;
    // Front snout bulge, measured back from the front
    const behind = progress - t;
    const snoutBulge = 1 + Math.max(0, 1 - behind / 0.15) * 0.35;
    // Viscous traveling wave
    const wobble = Math.sin((t - ambientTime * 0.08) * 42 + branchIndex * 1.8) * 0.13 +
                   Math.sin((t - ambientTime * 0.08) * 110 + branchIndex * 3.1) * 0.05;

    let widthMul = Math.max(0.4, (forkFlare * snoutBulge + wobble));
    if (fading && t > severT) {
      const shoulder = Math.min(1, (t - severT) / 0.06);
      widthMul *= (1 - shoulder * (1 - severFade));
    }
    const perpAngle = pt.angle + Math.PI / 2;
    samples.push({
      x: pt.x, y: pt.y, t, angle: pt.angle,
      nx: Math.cos(perpAngle), ny: Math.sin(perpAngle),
      hw: baseHalfWidth * widthMul
    });
  }
  return samples;
}

// Traces one ribbon polygon from branch samples
function traceBranchRibbon(context, samples, scaleMul) {
  context.beginPath();
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const hw = s.hw * scaleMul;
    const x = s.x + s.nx * hw, y = s.y + s.ny * hw;
    if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i];
    const hw = s.hw * scaleMul;
    const x = s.x - s.nx * hw, y = s.y - s.ny * hw;
    context.lineTo(x, y);
  }
  context.closePath();
}

// Distributary branch flows — rendered as organic, undulating mud ribbons
// with sediment levees, traveling current glints, texture speckles, and lobate snouts.
function drawBranchFlows(context) {
  if (!branchPaths.length || !state.branchProgresses) return;
  const intensity = state.laharVolume / 100;
  const outerColor = lerpColor('#7a736a', '#33291f', intensity);
  const midColor   = lerpColor('#8f887c', '#4a3a2c', intensity);
  const innerColor = lerpColor('#a89f92', '#6b5847', intensity);
  const sheenColor = lerpColor('#c9c1b0', '#8a7862', intensity);
  const leveeColor = lerpColor('#4a3f30', '#241a10', intensity);

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  for (let i = 0; i < branchPaths.length; i++) {
    const progress = state.branchProgresses[i];
    if (progress <= 0.01) continue;

    const br = branchPaths[i];
    const bSeverFade = state.brSeverFade ? state.brSeverFade[i] : 1;
    const bSeverT = state.brSeverT ? state.brSeverT[i] : 1;
    const samples = computeBranchSamples(br.path, br.len, progress, i, bSeverT, bSeverFade);
    if (samples.length < 2) continue;

    // 1. Soft Ground Shadow underneath branch banks
    context.save();
    context.fillStyle = 'rgba(0, 0, 0, 0.18)';
    context.beginPath();
    traceBranchRibbon(context, samples, 1.25);
    context.fill();
    context.restore();

    // 2. Multi-tier Viscous Mud Layers
    // Outer bank layer
    traceBranchRibbon(context, samples, 1.0);
    context.globalAlpha = 0.65;
    context.fillStyle = outerColor;
    context.fill();

    // Mid dense mud core
    traceBranchRibbon(context, samples, 0.72);
    context.globalAlpha = 1.0;
    context.fillStyle = midColor;
    context.fill();

    // Inner lit flow core
    traceBranchRibbon(context, samples, 0.40);
    context.fillStyle = innerColor;
    context.fill();

    // Glossy wet mud sheen streak
    traceBranchRibbon(context, samples, 0.18);
    context.globalAlpha = 0.45;
    context.fillStyle = sheenColor;
    context.fill();
    context.globalAlpha = 1.0;

    // 3. Sediment Levees: Raised darker lines along both branch margins
    context.strokeStyle = leveeColor;
    context.lineWidth = 1.2;
    context.globalAlpha = 0.55;
    context.beginPath();
    samples.forEach((s, idx) => {
      const x = s.x + s.nx * s.hw, y = s.y + s.ny * s.hw;
      if (idx === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();

    context.beginPath();
    samples.forEach((s, idx) => {
      const x = s.x - s.nx * s.hw, y = s.y - s.ny * s.hw;
      if (idx === 0) context.moveTo(x, y); else context.lineTo(x, y);
    });
    context.stroke();
    context.globalAlpha = 1.0;

    // 4. Downstream current glints traveling along the branch
    drawFlowLines(context, br.path, br.len, progress, samples[samples.length - 1].hw * 0.7, 5200 + i * 53, intensity, 4);
    const streakCount = 2;
    for (let sIdx = 0; sIdx < streakCount; sIdx++) {
      const cycle = (ambientTime * 0.22 + sIdx / streakCount + i * 0.47) % 1;
      const st = cycle * progress;
      if (st < 0.02 || st > progress * 0.94) continue;
      const spt = pointAtProgress(br.path, st, br.len);
      context.save();
      context.translate(spt.x, spt.y);
      context.rotate(spt.angle);
      context.globalAlpha = Math.sin(cycle * Math.PI) * 0.32 * (0.5 + intensity * 0.5);
      context.fillStyle = '#fff4d8';
      context.beginPath();
      context.ellipse(0, 0, 7, 1.4, 0, 0, Math.PI * 2);
      context.fill();
      context.restore();
    }

    // 5. Surface mud speckles and pumice foam granules
    const speckles = getBranchTexture(i);
    speckles.forEach(sp => {
      const cycle = flowCycle(sp.t, sp.speedMul, intensity);
      const pt = pointAtProgress(br.path, cycle * progress, br.len);
      const wobble = Math.sin(ambientTime * 1.8 + sp.wobbleSeed) * 1.5;
      const perpAngle = pt.angle + Math.PI / 2;
      const px = pt.x + Math.cos(perpAngle) * (sp.perp + wobble);
      const py = pt.y + Math.sin(perpAngle) * (sp.perp + wobble) * 0.7;
      context.globalAlpha = flowFade(cycle) * 0.7;
      context.fillStyle = sp.isFoam ? 'rgba(235, 228, 215, 0.75)' : 'rgba(40, 32, 24, 0.45)';
      context.beginPath();
      context.ellipse(px, py, sp.size * 1.5, sp.size * 0.55, pt.angle, 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1.0;

    // 6. Lobate Leading Edge Snout (Snout Mound + Bubbling Foamy Front)
    const frontPt = samples[samples.length - 1];
    const snoutR = 7 + progress * 6;
    const brReveal = (state.brHeadReveal && state.brHeadReveal[i] !== undefined) ? state.brHeadReveal[i] : 1;
    context.globalAlpha = brReveal;
    
    // Snout mud puddle
    const snoutGrad = context.createRadialGradient(frontPt.x, frontPt.y, 0, frontPt.x, frontPt.y, snoutR * 1.3);
    snoutGrad.addColorStop(0, midColor);
    snoutGrad.addColorStop(0.7, outerColor);
    snoutGrad.addColorStop(1, 'rgba(51, 41, 31, 0)');
    context.fillStyle = snoutGrad;
    context.beginPath();
    context.ellipse(frontPt.x, frontPt.y, snoutR * 1.3, snoutR * 0.85, frontPt.angle, 0, Math.PI * 2);
    context.fill();

    // Solid snout core
    context.fillStyle = midColor;
    context.beginPath();
    context.ellipse(frontPt.x, frontPt.y, snoutR * 0.9, snoutR * 0.58, frontPt.angle, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;

    // Foamy bubbling rim at the snout
    const foamDots = 5;
    for (let f = 0; f < foamDots; f++) {
      const fa = frontPt.angle + ((f - (foamDots - 1) / 2) / foamDots) * 1.4;
      const fr = snoutR * 0.9 + Math.sin(ambientTime * 4.5 + f * 1.6) * 1.5;
      const fx = frontPt.x + Math.cos(fa) * fr;
      const fy = frontPt.y + Math.sin(fa) * fr * 0.7;
      context.globalAlpha = (0.65 + Math.sin(ambientTime * 6 + f) * 0.25) * brReveal;
      context.fillStyle = f % 2 === 0 ? 'rgba(245, 238, 224, 0.95)' : 'rgba(215, 202, 185, 0.8)';
      context.beginPath();
      context.ellipse(fx, fy, 2.2, 1.6, fa, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1.0;

    // 7. Active battering feedback (splashes & foam) when branch reaches target
    if (progress > BRANCH_DAMAGE_START) {
      context.globalAlpha = 0.5 + 0.3 * Math.sin(ambientTime * 7 + i);
      context.fillStyle = 'rgba(250, 240, 220, 0.9)';
      for (let k = 0; k < 3; k++) {
        const life = (ambientTime * 1.2 + k / 3) % 1;
        const ka = frontPt.angle + (k - 1) * 0.6;
        const kx = frontPt.x + Math.cos(ka) * (4 + life * 8);
        const ky = frontPt.y + Math.sin(ka) * (4 + life * 8) * 0.7;
        context.beginPath();
        context.arc(kx, ky, 1.8 + k * 0.5, 0, Math.PI * 2);
        context.fill();
      }
    }
  }

  context.globalAlpha = 1;
  context.restore();
}

// Mud pooling around structures that are taking lahar damage — the mud
// visually accumulates at the base as hp decreases, with debris specks.
/* Mud piling up behind a fully-blocking dike line. Reads state.damPools[i]
   (0..1, grown while the channel is capped) and draws a thick muddy pool
   just upstream of the dike band, widening SIDEWAYS along the dike as it
   fills — the visual cue that the dike is holding the lahar back and the
   flow is searching for another way around. Purely cosmetic; the block
   itself is done in simulate(). */
function drawDikeAccumulation(context) {
  if (!state.damPools) return;
  const intensity = state.laharVolume / 100;
  const outer = lerpColor('#6f685e', '#2c2318', intensity);
  const mid   = lerpColor('#8a8276', '#463726', intensity);
  const sheen = lerpColor('#b9b09e', '#7c6a54', intensity);

  for (let i = 0; i < channelPaths.length; i++) {
    const pool = state.damPools[i];
    if (!pool || pool < 0.03) continue;

    // Locate the fully-blocking band on this channel.
    const bands = dikeBandsForPath(channelPaths[i], CHANNEL_LENS[i]);
    let band = null;
    for (const b of bands) { if (b.coverage >= DIKE_CAP_COVERAGE) { band = b; break; } }
    if (!band) continue;

    const ang = Math.atan2(band.ny, band.nx); // local +x = along the dike, +y = upstream
    const rx = DIKE_CHANNEL_HALF + 8 + pool * 26;  // spread sideways along the dike as it fills
    const ry = 9 + pool * 26;                        // depth of mud held behind it
    const cy = ry * 0.55;                            // sit the pool just upstream of the wall

    context.save();
    context.translate(band.x, band.y);
    context.rotate(ang);

    // Outer wet apron
    context.globalAlpha = 0.5 + 0.3 * pool;
    context.fillStyle = outer;
    context.beginPath();
    context.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
    // Body
    context.globalAlpha = 0.85;
    context.fillStyle = mid;
    context.beginPath();
    context.ellipse(0, cy, rx * 0.82, ry * 0.82, 0, 0, Math.PI * 2);
    context.fill();
    // Rising level line near the wall + a slick sheen that grows with fill
    context.globalAlpha = 0.35 + 0.25 * pool;
    context.fillStyle = sheen;
    context.beginPath();
    context.ellipse(0, cy * 0.6, rx * 0.6, ry * 0.4, 0, 0, Math.PI * 2);
    context.fill();

    // Ripples arriving from upstream and piling up against the wall —
    // they must travel TOWARD the dike (downstream), never back up the slope.
    context.strokeStyle = sheen;
    context.lineWidth = 1.4;
    for (let r = 0; r < 3; r++) {
      const phase = (ambientTime * 0.6 + r / 3) % 1;   // 0 = far upstream, 1 = at the wall
      context.globalAlpha = 0.18 * pool * Math.sin(phase * Math.PI);
      const yy = cy + (1 - phase) * ry * 0.8;
      const ww = rx * (0.4 + phase * 0.5);
      context.beginPath();
      context.ellipse(0, yy, ww, ry * 0.16, 0, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }
  context.globalAlpha = 1;
}

function drawMudPooling(context) {
  const intensity = state.laharVolume / 100;
  if (intensity < 0.05) return;
  const mudColor = lerpColor('#7a736a', '#4a3a2c', intensity);
  const mudDark = lerpColor('#5c554c', '#33291f', intensity);

  function drawPoolAt(x, y, groundY, hp, maxHp) {
    if (hp >= maxHp || hp <= 0) return;
    const dmgRatio = 1 - hp / maxHp;
    if (dmgRatio < 0.08) return;
    const poolW = 28 + dmgRatio * 36;
    const poolH = 6 + dmgRatio * 10;
    const mudHeight = dmgRatio * 18;

    // Base mud pool
    context.save();
    context.globalAlpha = 0.55 + dmgRatio * 0.35;
    context.fillStyle = mudColor;
    context.beginPath();
    context.ellipse(x, groundY, poolW, poolH, 0, 0, Math.PI * 2);
    context.fill();

    // Rising mud on the structure base
    context.fillStyle = mudDark;
    context.globalAlpha = 0.4 + dmgRatio * 0.4;
    context.fillRect(x - poolW * 0.7, groundY - mudHeight, poolW * 1.4, mudHeight);

    // Small debris specks in the pool
    const rand = mulberry32(Math.floor(x * 7 + y * 13));
    const speckCount = Math.floor(dmgRatio * 6);
    for (let s = 0; s < speckCount; s++) {
      const sx = x + (rand() - 0.5) * poolW * 1.4;
      const sy = groundY + (rand() - 0.5) * poolH * 0.8;
      context.fillStyle = rand() > 0.5 ? '#3a3228' : '#5c5348';
      context.globalAlpha = 0.5 + rand() * 0.3;
      context.beginPath();
      context.ellipse(sx, sy, 1.5 + rand() * 2.5, 1 + rand() * 1.5, rand() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  // Pool around damaged houses
  state.houses.forEach(h => {
    if (h.lost) return;
    const style = HOUSE_STYLES[(h.style || 0) % HOUSE_STYLES.length];
    drawPoolAt(h.x, h.y, h.y + style.groundOffset, h.hp, 100);
  });
  // Pool around damaged landmarks
  if (state.church && !state.church.lost && state.church.hp < 100)
    drawPoolAt(state.church.x, state.church.y, state.church.y + 52, state.church.hp, 100);
  if (state.school && !state.school.lost && state.school.hp < 100)
    drawPoolAt(state.school.x, state.school.y, state.school.y + 14, state.school.hp, 100);
  if (state.robot && !state.robot.lost && state.robot.hp < 100)
    drawPoolAt(state.robot.x + 10, state.robot.y, state.robot.y + 66, state.robot.hp, 100);
  if (state.monument && !state.monument.lost && state.monument.hp < 100)
    drawPoolAt(state.monument.x, state.monument.y, state.monument.y + 52, state.monument.hp, 100);
}

// Rocks and tree-trunk logs carried along within the lahar body — a
// purely decorative particle layer (see the spawn/update logic in
// simulate()) that adds visual mass and danger to the flow.
function drawDebris(context) {
  context.save();
  state.debris.forEach(p => {
    // Subtle motion streak behind fast-moving debris — a short, tapering,
    // low-opacity smear opposite the direction of travel, selling a sense
    // of speed within the flow without needing a full particle trail.
    const speed = Math.hypot(p.vy, p.drift);
    if (speed > 6) {
      const trailLen = Math.min(16, speed * 0.9);
      const trailAngle = Math.atan2(p.vy, p.drift);
      context.save();
      context.globalAlpha = Math.min(1, p.life * 1.6) * 0.18;
      context.strokeStyle = '#3a332b';
      context.lineWidth = Math.max(1.5, p.size * 0.35);
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(p.x, p.y);
      context.lineTo(p.x - Math.cos(trailAngle) * trailLen, p.y - Math.sin(trailAngle) * trailLen);
      context.stroke();
      context.restore();
    }

    context.save();
    context.globalAlpha = Math.min(1, p.life * 1.6);
    context.translate(p.x, p.y);
    context.rotate(p.angle);
    if (p.type === 'ash') {
      // Small floating ash/pumice clumps — lighter and more buoyant-
      // looking than rocks, adding fine texture variety on the surface.
      context.fillStyle = '#8a8178';
      context.beginPath(); context.ellipse(0, 0, p.size, p.size * 0.75, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = 'rgba(255,255,255,0.2)';
      context.beginPath(); context.ellipse(-p.size * 0.25, -p.size * 0.2, p.size * 0.4, p.size * 0.28, 0, 0, Math.PI * 2); context.fill();
    } else {
      // Rocks — each uses its own randomized vertex jitter (set at spawn
      // time) so every rock reads as a genuinely unique jagged chunk
      // rather than a repeated stamped hexagon.
      context.fillStyle = '#5c574e';
      context.beginPath();
      const sides = p.vertJitter ? p.vertJitter.length : 6;
      for (let s = 0; s < sides; s++) {
        const ang = (s / sides) * Math.PI * 2;
        const r = p.size * (p.vertJitter ? p.vertJitter[s] : (0.72 + (s % 2) * 0.28));
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r * 0.8;
        if (s === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.closePath();
      context.fill();
      context.strokeStyle = 'rgba(0,0,0,0.22)'; context.lineWidth = 1;
      context.stroke();
      context.fillStyle = 'rgba(255,255,255,0.15)';
      context.beginPath(); context.ellipse(-p.size * 0.25, -p.size * 0.25, p.size * 0.3, p.size * 0.2, 0, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  });
  context.restore();
}

// Short-lived mud-water splash droplets kicked up wherever the flow is
// actively battering a structure (spawned from laharContactDamage).
function drawSplashes(context) {
  context.save();
  const mudColor = lerpColor('#9e8870', '#b8541a', state.laharVolume / 100);
  state.splashes.forEach(p => {
    context.globalAlpha = Math.max(0, p.life) * 0.85;
    context.fillStyle = mudColor;
    context.beginPath();
    context.ellipse(p.x, p.y, p.size, p.size * 0.65, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
    context.fill();
    // Tiny bright specular on each droplet
    context.globalAlpha = Math.max(0, p.life) * 0.35;
    context.fillStyle = 'rgba(255,240,200,0.7)';
    context.beginPath();
    context.arc(p.x - p.size * 0.25, p.y - p.size * 0.2, p.size * 0.28, 0, Math.PI * 2);
    context.fill();
  });
  context.restore();
}

// ---------------- PLACEMENT FEEDBACK: RIPPLES & DRAG PREVIEW ----------------

// A brief expanding double-ring "confirmed!" flash at the moment a tool is
// placed. Stateless like the smoke/ash puffs: each ripple stores only its
// birth moment on the always-advancing ambient clock, and its radius/alpha
// are pure functions of (ambientTime - startTime) — no per-frame update
// loop needed, and pruning expired ripples is just a filter done here.
const RIPPLE_DURATION = 0.7;
function drawRipples(context) {
  if (state.ripples.length === 0) return;
  state.ripples = state.ripples.filter(r => ambientTime - r.startTime < RIPPLE_DURATION);
  context.save();
  state.ripples.forEach(r => {
    const t = (ambientTime - r.startTime) / RIPPLE_DURATION;
    const radius = 6 + t * 46;
    const alpha = Math.max(0, 1 - t);
    context.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
    context.lineWidth = 3 * (1 - t) + 0.5;
    context.beginPath(); context.arc(r.x, r.y, radius, 0, Math.PI * 2); context.stroke();
    context.strokeStyle = `rgba(120, 200, 255, ${alpha * 0.5})`;
    context.lineWidth = 1.5;
    context.beginPath(); context.arc(r.x, r.y, radius * 0.6, 0, Math.PI * 2); context.stroke();
  });
  context.restore();
}

// Live in-scene placement guide, drawn every frame while a tool is armed
// (dragPreviewPos is set on canvas hover/tap and cleared on deselect). Shows
// the tool's actual effect radius and a translucent preview of the tool
// itself, plus a red ✕ when the spot is still up on the volcano/sky.
function drawDragPreview(context) {
  if (!dragPreviewPos) return;
  const { x, y, valid, type } = dragPreviewPos;
  const def = TOOL_DEFS[type];
  if (!def) return;

  context.save();
  const pulse = 1 + Math.sin(ambientTime * 6) * 0.04;
  context.strokeStyle = valid ? 'rgba(74, 222, 128, 0.85)' : 'rgba(248, 113, 113, 0.85)';
  context.fillStyle = valid ? 'rgba(74, 222, 128, 0.12)' : 'rgba(248, 113, 113, 0.12)';
  context.lineWidth = 2.5;
  context.setLineDash([6, 5]);
  context.beginPath();
  context.arc(x, y, def.radius * pulse, 0, Math.PI * 2);
  context.fill(); context.stroke();
  context.setLineDash([]);
  context.restore();

  context.save();
  context.globalAlpha = 0.55;
  context.translate(x, y);
  drawItemShape(context, type, 1, 1);
  context.restore();

  // ---- Live diversion preview ----
  // For the tools that bend the flow, show BEFORE dropping which channel
  // will be affected and which way the mud will be pushed from here — the
  // direction depends on the side of the channel being hovered, so the
  // arrow flips as the player moves across it.
  if (valid && def.deflectStrength) {
    const info = nearestFlowInfo(x, y);
    if (info && info.dist < def.deflectRange) {
      const dx = info.nx * info.divertSide, dy = info.ny * info.divertSide;
      context.save();
      context.globalAlpha = 0.75;
      context.strokeStyle = '#ffb454';
      context.lineWidth = 3;
      context.setLineDash([]);
      context.beginPath();
      context.moveTo(x + dx * 10, y + dy * 10);
      context.lineTo(x + dx * 44, y + dy * 44);
      context.stroke();
      context.beginPath();
      context.moveTo(x + dx * 54, y + dy * 54);
      context.lineTo(x + dx * 40 - dy * 8, y + dy * 40 + dx * 8);
      context.lineTo(x + dx * 40 + dy * 8, y + dy * 40 - dx * 8);
      context.closePath();
      context.fillStyle = '#ffb454';
      context.fill();
      // Mark the stretch of channel that will actually be moved.
      context.globalAlpha = 0.5;
      context.fillStyle = '#ffe6a3';
      context.beginPath();
      context.arc(info.x, info.y, 5, 0, Math.PI * 2);
      context.fill();
      context.restore();
    } else {
      context.save();
      context.globalAlpha = 0.8;
      context.fillStyle = '#fca5a5';
      context.font = "bold 13px Nunito, 'Baloo 2', sans-serif";
      context.textAlign = 'center';
      context.fillText('no channel in reach', x, y + def.radius + 16);
      context.restore();
    }
  }

  if (!valid) {
    context.save();
    context.globalAlpha = 0.9;
    context.fillStyle = '#f87171';
    context.font = 'bold 26px Arial';
    context.textAlign = 'center';
    context.fillText('✕', x, y - def.radius - 12);
    context.restore();
  }
}

// Maps continuous HP (0-100) to a discrete visual damage tier:
//   0 = normal/minor (100-68 hp), 1 = heavy (67-35 hp),
//   2 = severe (34-1 hp), 3 = destroyed (0 hp / lost)
function getDamageStage(hp, lost) {
  if (lost || hp <= 0) return 3;
  if (hp <= 45) return 2;   // was 34 — heavy damage reads sooner
  if (hp <= 82) return 1;   // was 67 — first cracks appear early enough to act on
  return 0;
}

/* Soft ash/soot staining for a damaged facade.
   Originally a plain fillRect, which showed up as an obvious translucent
   SQUARE sitting on the building. A first attempt feathered the edges with
   a 'destination-out' pass, but that erased the SCENE underneath and punched
   a black hole instead. This uses a radial gradient that reaches zero alpha
   before its own bounds, so it fades out on every side with no erasing and
   no hard edge — grime settling on a wall rather than a panel laid over it. */
function drawAshStain(ctx, cx, topY, w, h, alpha, seed) {
  const rand = mulberry32(seed || 77);
  const cy = topY + h * 0.62;
  ctx.save();
  // Squash the circle into the facade's proportions.
  ctx.translate(cx, cy);
  ctx.scale(1, Math.max(0.35, h / w));
  const r = w * 0.62;
  const g = ctx.createRadialGradient(0, 0, r * 0.12, 0, 0, r);
  g.addColorStop(0,    `rgba(44, 36, 27, ${alpha})`);
  g.addColorStop(0.55, `rgba(44, 36, 27, ${alpha * 0.62})`);
  g.addColorStop(0.82, `rgba(44, 36, 27, ${alpha * 0.18})`);
  g.addColorStop(1,    'rgba(44, 36, 27, 0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  // A couple of softer streaks so the grime is not perfectly symmetrical.
  for (let i = 0; i < 3; i++) {
    const sx = (rand() - 0.5) * w * 0.6;
    const sr = r * (0.22 + rand() * 0.2);
    const sg = ctx.createRadialGradient(sx, r * 0.15, 0, sx, r * 0.15, sr);
    sg.addColorStop(0, `rgba(38, 31, 23, ${alpha * 0.5})`);
    sg.addColorStop(1, 'rgba(38, 31, 23, 0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(sx, r * 0.15, sr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// Draws procedural jagged crack lines on walls/surfaces.
function drawCracks(ctx, x, y, w, h, stage, seed) {
  if (stage < 1) return;
  const rand = mulberry32(seed || 1234);
  ctx.save();
  ctx.strokeStyle = stage >= 2 ? 'rgba(30,22,14,0.7)' : 'rgba(40,30,20,0.5)';
  ctx.lineCap = 'round';
  const count = stage === 1 ? 2 + Math.floor(rand() * 2) : 4 + Math.floor(rand() * 3);
  for (let i = 0; i < count; i++) {
    const sx = x + (0.15 + rand() * 0.7) * w;
    const sy = y + (0.1 + rand() * 0.8) * h;
    ctx.lineWidth = stage >= 2 ? 1.4 + rand() * 0.8 : 0.8 + rand() * 0.5;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    const segs = 2 + Math.floor(rand() * 3);
    let curX = sx, curY = sy;
    for (let s = 0; s < segs; s++) {
      curX += (rand() - 0.5) * (8 + stage * 5);
      curY += rand() * (5 + stage * 4);
      ctx.lineTo(curX, curY);
    }
    ctx.stroke();
    // Branching fork on some cracks
    if (rand() > 0.45 && stage >= 2) {
      ctx.beginPath();
      ctx.moveTo(curX, curY);
      ctx.lineTo(curX + (rand() - 0.5) * 10, curY + rand() * 7);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// Draws a broken/shattered window with dark interior & fracture lines
function drawBrokenWindow(ctx, x, y, w, h, stage) {
  ctx.save();
  ctx.fillStyle = stage >= 2 ? '#1e1b18' : '#332d26';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = stage >= 2 ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + w, y + h);
  ctx.moveTo(x + w, y + 2); ctx.lineTo(x + 2, y + h);
  if (stage >= 2) {
    ctx.moveTo(x + w * 0.5, y); ctx.lineTo(x + w * 0.2, y + h);
    ctx.moveTo(x, y + h * 0.5); ctx.lineTo(x + w, y + h * 0.3);
  }
  ctx.stroke();
  ctx.restore();
}

// Draws textured mud accumulation rising up a structure's base
function drawMudOnStructure(ctx, x, y, w, mudHeight, stage) {
  if (stage < 1 || mudHeight <= 0) return;
  const intensity = state.laharVolume / 100;
  const mudColor = lerpColor('#7a736a', '#4a3a2c', Math.max(0.3, intensity));
  const mudDark = lerpColor('#554d44', '#2d2319', Math.max(0.3, intensity));
  ctx.save();
  ctx.globalAlpha = 0.65 + stage * 0.12;
  ctx.fillStyle = mudColor;
  ctx.beginPath();
  const halfW = w / 2 + 4;
  ctx.moveTo(x - halfW, y + 4);
  const steps = 22;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    // Taper: the deposit is deepest in the middle and thins to nothing at
    // each end, so it banks against the wall instead of ending in a cut.
    const taper = Math.pow(Math.sin(t * Math.PI), 0.65);
    const wave = Math.sin(t * Math.PI * 3 + x * 0.2) * (2 + stage * 1.5);
    ctx.lineTo(x - halfW + t * (halfW * 2), y - (mudHeight * taper) + wave * taper);
  }
  ctx.lineTo(x + halfW, y + 4);
  ctx.lineTo(x - halfW, y + 4);
  ctx.closePath();
  ctx.fill();

  // Darker deposit line
  ctx.strokeStyle = mudDark;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const wave = Math.sin(t * Math.PI * 3 + x * 0.2) * (2 + stage * 1.5);
    const px = x - halfW + t * (halfW * 2);
    const py = y - mudHeight + wave;
    if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
}

// Scattered rubble chunks & debris around damaged or destroyed buildings
function drawStructureDebris(ctx, x, groundY, stage, seed) {
  if (stage < 2) return;
  const rand = mulberry32(seed || 5432);
  ctx.save();
  const count = stage === 2 ? 6 + Math.floor(rand() * 4) : 14 + Math.floor(rand() * 8);
  for (let i = 0; i < count; i++) {
    const dx = (rand() - 0.5) * (stage === 3 ? 56 : 42);
    const dy = (rand() - 0.3) * (stage === 3 ? 16 : 10);
    const size = 1.8 + rand() * (stage === 3 ? 4.5 : 3.0);
    const colPicker = rand();
    ctx.fillStyle = colPicker > 0.6 ? '#6b645a' : (colPicker > 0.3 ? '#8a7e72' : '#4a4238');
    ctx.globalAlpha = 0.65 + rand() * 0.3;
    ctx.beginPath();
    const sides = 3 + Math.floor(rand() * 3);
    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const r = size * (0.65 + rand() * 0.5);
      const px = x + dx + Math.cos(a) * r;
      const py = groundY + dy + Math.sin(a) * r * 0.7;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Generic procedural rubble pile for destroyed structures
function drawGenericRubblePile(ctx, x, groundY, w, h, baseColor, roofColor, seed) {
  const rand = mulberry32(seed || 9876);
  ctx.save();

  // 1. Mud/ash mound base
  const mudGrad = ctx.createRadialGradient(x, groundY, 4, x, groundY, w * 0.85);
  mudGrad.addColorStop(0, '#5a5045');
  mudGrad.addColorStop(0.6, '#483f35');
  mudGrad.addColorStop(1, 'rgba(60,52,43,0.85)');
  ctx.fillStyle = mudGrad;
  ctx.beginPath();
  ctx.ellipse(x, groundY - 2, w * 0.75, h * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Broken wall masonry & collapsed slab fragments
  for (let i = 0; i < 7; i++) {
    const ox = (rand() - 0.5) * w * 0.8;
    const oy = groundY - 4 - rand() * (h * 0.6);
    const fw = 8 + rand() * 14;
    const fh = 4 + rand() * 8;
    const ang = (rand() - 0.5) * 0.7;
    ctx.save();
    ctx.translate(x + ox, oy);
    ctx.rotate(ang);
    ctx.fillStyle = i % 2 === 0 ? baseColor : '#524b42';
    ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
    ctx.strokeStyle = '#2d2720';
    ctx.lineWidth = 1;
    ctx.strokeRect(-fw / 2, -fh / 2, fw, fh);
    ctx.restore();
  }

  // 3. Broken roof / splinter fragments
  for (let i = 0; i < 5; i++) {
    const rx = x + (rand() - 0.5) * w * 0.7;
    const ry = groundY - 6 - rand() * (h * 0.7);
    const rsize = 7 + rand() * 12;
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate((rand() - 0.5) * 1.2);
    ctx.fillStyle = i % 2 === 0 ? roofColor : '#423a32';
    ctx.beginPath();
    ctx.moveTo(-rsize / 2, rsize / 3);
    ctx.lineTo(rsize / 2, -rsize / 3);
    ctx.lineTo(rsize / 3, rsize / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // 4. Mud coating over lower rubble
  const mudWash = ctx.createLinearGradient(x, groundY - h * 0.4, x, groundY + 4);
  mudWash.addColorStop(0, 'rgba(74,62,50,0)');
  mudWash.addColorStop(0.7, 'rgba(74,62,50,0.75)');
  mudWash.addColorStop(1, 'rgba(56,46,36,0.95)');
  ctx.fillStyle = mudWash;
  ctx.beginPath();
  ctx.ellipse(x, groundY, w * 0.78, h * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawChurch(c) {
  if (!c) return;
  ctx.save();
  let shakeX = c.shakeT > 0 ? Math.sin(state.time * 40) * 5 * c.shakeT : 0;
  if (c.shakeT > 0) c.shakeT -= 0.04;
  const x = c.x + shakeX, y = c.y;
  const stage = getDamageStage(c.hp, c.lost);

  // Optional per-town size multiplier (TOWN_MAPS[...].churchScale), applied
  // about the building's ground point so it grows upward from the same spot.
  const cScale = (TOWN_MAPS[gameSettings.town] || {}).churchScale || 1;
  if (cScale !== 1) { ctx.translate(x, y + 50); ctx.scale(cScale, cScale); ctx.translate(-x, -(y + 50)); }

  // Drop shadow beneath the church
  drawGroundShadow(ctx, x, y + 52, 90, 14, 1.05);

  const isBacolor = gameSettings.town === 'bacolor';
  const churchArt = isBacolor ? bacolorChurchImg : churchImg;
  const artW = isBacolor ? 250 : 170;
  const artH = isBacolor ? 138 : 100;

  ctx.globalAlpha = stage === 3 ? 0.92 : 1;

  if (churchArt.complete && churchArt.naturalHeight !== 0) {
    ctx.drawImage(churchArt, x - artW / 2, y + 50 - artH, artW, artH);
  }

  // Visual damage stages on the church:
  if (stage === 1) {
    // Stage 1: Minor cracks across bell tower and stone facade + mud at ground line
    drawCracks(ctx, x - artW * 0.35, y + 50 - artH * 0.7, artW * 0.7, artH * 0.5, 1, 101);
    drawMudOnStructure(ctx, x, y + 50, artW * 0.85, 12, 1);
  } else if (stage === 2) {
    // Stage 2: Heavy crack networks, ash smudges, and lahar mud rising significantly
    drawCracks(ctx, x - artW * 0.4, y + 50 - artH * 0.85, artW * 0.8, artH * 0.7, 2, 202);
    // Dark volcanic ash wash — soft-edged so it stains rather than boxes.
    drawAshStain(ctx, x, y + 50 - artH * 0.62, artW * 0.8, artH * 0.46, 0.34, 202);
    drawMudOnStructure(ctx, x, y + 50, artW * 0.9, 28, 2);
    drawStructureDebris(ctx, x, y + 52, 2, 303);
  } else if (stage === 3) {
    // Stage 3 (Destroyed / Buried): Iconic San Guillermo half-buried state
    // Massive volcanic mud deposit burying lower 55% of the church!
    drawCracks(ctx, x - artW * 0.4, y + 50 - artH * 0.9, artW * 0.8, artH * 0.6, 2, 404);
    
    // Deep lahar mud dune burying the lower half of the church
    const mudGrad = ctx.createLinearGradient(x, y + 50 - artH * 0.55, x, y + 52);
    mudGrad.addColorStop(0, '#5a5043');
    mudGrad.addColorStop(0.35, '#483f34');
    mudGrad.addColorStop(1, '#33291f');
    ctx.fillStyle = mudGrad;
    ctx.beginPath();
    ctx.moveTo(x - artW * 0.55, y + 52);
    ctx.quadraticCurveTo(x - artW * 0.25, y + 50 - artH * 0.58, x, y + 50 - artH * 0.52);
    ctx.quadraticCurveTo(x + artW * 0.3, y + 50 - artH * 0.62, x + artW * 0.55, y + 52);
    ctx.closePath();
    ctx.fill();

    // Dark sediment crust along the mud dune ridge
    ctx.strokeStyle = '#241a10';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - artW * 0.55, y + 52);
    ctx.quadraticCurveTo(x - artW * 0.25, y + 50 - artH * 0.58, x, y + 50 - artH * 0.52);
    ctx.quadraticCurveTo(x + artW * 0.3, y + 50 - artH * 0.62, x + artW * 0.55, y + 52);
    ctx.stroke();

    // Heavy debris & fallen stone fragments
    drawStructureDebris(ctx, x, y + 52, 3, 505);
  }

  if (!c.lost) {
    /* Placed from the artwork's actual top rather than a fixed offset.
       Bacolor's church is drawn 138px tall against 100px elsewhere, so the
       old y-62 sat 26px INSIDE the Bacolor sprite. */
    queueHPBar(x, (y + 50 - artH) - 12, 52, 7, c.hp, landmarkColor('church'), 'church');
  }
  ctx.restore();
}

function drawSchool(s) {
  if (!s) return;
  ctx.save();
  let shakeX = s.shakeT > 0 ? Math.sin(state.time * 40) * 4 * s.shakeT : 0;
  if (s.shakeT > 0) s.shakeT -= 0.04;
  const x = s.x + shakeX, y = s.y;
  const stage = getDamageStage(s.hp, s.lost);

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  drawGroundShadow(ctx, x, y + 14, 30, 7);

  ctx.globalAlpha = stage === 3 ? 0.88 : 1;

  /* Bacolor uses the DHVSU artwork in place of the generic school. It goes
     through the same damage treatment as the other image-based landmarks —
     tilt and sink as it fails, ash staining, cracks, mud banked at the base
     — so it degrades like everything else rather than sitting pristine
     until it vanishes. */
  const dhvsu = gameSettings.town === 'bacolor' && bacolorSchoolImg.complete
                && bacolorSchoolImg.naturalWidth > 0;
  if (dhvsu && stage !== 3) {
    const artW = 132;
    const artH = artW * (bacolorSchoolImg.naturalHeight / bacolorSchoolImg.naturalWidth);
    const tilt = stage === 1 ? 0.018 : stage === 2 ? 0.045 : 0;
    const sink = stage === 2 ? 4 : 0;
    ctx.save();
    if (tilt) { ctx.translate(x, y + 14); ctx.rotate(tilt); ctx.translate(-x, -(y + 14)); }
    ctx.drawImage(bacolorSchoolImg, x - artW / 2, y + 14 - artH + sink, artW, artH);
    if (stage >= 1) {
      drawAshStain(ctx, x, y + 14 - artH * 0.55 + sink, artW * 0.82, artH * 0.5,
                   stage === 1 ? 0.16 : 0.32, 617);
      drawCracks(ctx, x - artW * 0.3, y + 14 - artH * 0.78 + sink,
                 artW * 0.6, artH * 0.55, stage, 733);
    }
    ctx.restore();
    if (stage === 2) drawMudOnStructure(ctx, x, y + 14, artW * 0.8, 16, stage);
    // Bar placed off the real artwork height, not a fixed offset.
    queueHPBar(x, (y + 14 - artH) - 12, 52, 7, s.hp, landmarkColor('school'), 'school');
    ctx.restore();
    return;
  }

  if (stage === 3) {
    // Stage 3 (Destroyed): Collapsed school rubble
    drawGenericRubblePile(ctx, x, y + 14, 52, 28, '#726d64', '#7a2838', 771);
    drawStructureDebris(ctx, x, y + 14, 3, 882);
  } else {
    // Base School Building with progressive damage
    const wallCol = stage >= 2 ? '#9ca3af' : (stage === 1 ? '#d1d5db' : '#eaf4f4');
    const trimCol = stage >= 2 ? '#6b7280' : (stage === 1 ? '#8da366' : '#b5ce88');
    const roofCol = stage >= 2 ? '#7a2b40' : (stage === 1 ? '#943550' : '#b04060');

    // Walls
    ctx.fillStyle = wallCol;
    ctx.fillRect(x - 22, y - 8, 44, 22);

    if (stage >= 2) {
      // Wall breach / collapsed section
      ctx.fillStyle = '#2b2723';
      ctx.fillRect(x - 6, y - 4, 12, 18);
    }

    // Eaves / Trim
    ctx.fillStyle = trimCol;
    ctx.fillRect(x - 24, y - 12, 48, 4);
    ctx.fillRect(x - 22, y - 8, 4, 22);
    ctx.fillRect(x + 18, y - 8, 4, 22);

    // Maroon Gable Roof
    ctx.fillStyle = roofCol;
    ctx.beginPath();
    if (stage >= 2) {
      // Sagging, damaged roof profile
      ctx.moveTo(x - 26, y - 12);
      ctx.lineTo(x - 4, y - 22);
      ctx.lineTo(x + 4, y - 19);
      ctx.lineTo(x + 24, y - 10);
    } else {
      ctx.moveTo(x - 26, y - 12);
      ctx.lineTo(x, y - 26);
      ctx.lineTo(x + 26, y - 12);
    }
    ctx.closePath();
    ctx.fill();

    if (stage === 0) {
      // Roof ridge highlight
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 22, y - 12); ctx.lineTo(x, y - 26); ctx.lineTo(x + 22, y - 12);
      ctx.stroke();
    }

    // Windows & Door
    if (stage === 0) {
      ctx.fillStyle = '#2b2d42';
      ctx.fillRect(x - 12, y + 2, 6, 6);
      ctx.fillRect(x + 6, y + 2, 6, 6);
      ctx.fillRect(x - 3, y + 4, 6, 10);
      ctx.fillStyle = 'rgba(200,240,255,0.45)';
      ctx.fillRect(x - 11, y + 3, 3, 2);
      ctx.fillRect(x + 7, y + 3, 3, 2);
    } else if (stage === 1) {
      drawBrokenWindow(ctx, x - 12, y + 2, 6, 6, 1);
      ctx.fillStyle = '#2b2d42';
      ctx.fillRect(x + 6, y + 2, 6, 6);
      ctx.fillRect(x - 3, y + 4, 6, 10);
      drawCracks(ctx, x - 20, y - 6, 40, 18, 1, 331);
      drawMudOnStructure(ctx, x, y + 14, 46, 6, 1);
    } else if (stage === 2) {
      drawBrokenWindow(ctx, x - 12, y + 2, 6, 6, 2);
      drawBrokenWindow(ctx, x + 6, y + 2, 6, 6, 2);
      ctx.fillStyle = '#1e1c1a';
      ctx.fillRect(x - 3, y + 4, 6, 10);
      drawCracks(ctx, x - 20, y - 6, 40, 18, 2, 442);
      drawMudOnStructure(ctx, x, y + 14, 48, 12, 2);
      drawStructureDebris(ctx, x, y + 14, 2, 553);
    }
  }

  if (!s.lost) {
    queueHPBar(x, y - 34, 44, 7, s.hp, landmarkColor('school'), 'school');
  }
  ctx.restore();
}

function drawBaboRobot(r) {
  if (!r) return;
  ctx.save();
  let shakeX = r.shakeT > 0 ? Math.sin(state.time * 40) * 4 * r.shakeT : 0;
  if (r.shakeT > 0) r.shakeT -= 0.04;
  const x = r.x + shakeX, y = r.y;
  const stage = getDamageStage(r.hp, r.lost);

  // Optional per-town size multiplier (TOWN_MAPS[...].robotScale), applied
  // about the robot's ground point so it scales from where it stands.
  const rScale = (TOWN_MAPS[gameSettings.town] || {}).robotScale || 1;
  if (rScale !== 1) { ctx.translate(x, y + 66); ctx.scale(rScale, rScale); ctx.translate(-x, -(y + 66)); }

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  drawGroundShadow(ctx, x + 10, y + 66, 80, 12);

  ctx.globalAlpha = stage === 3 ? 0.9 : 1;

  if (robotImg.complete && robotImg.naturalHeight !== 0) {
    if (stage === 3) {
      // Stage 3: Toppled / sunken robot in deep lahar mud
      ctx.save();
      ctx.translate(x + 10, y + 60);
      ctx.rotate(-0.35); // Tilted into ground
      ctx.translate(-(x + 10), -(y + 60));
      ctx.drawImage(robotImg, x - 100, y - 25, 220, 100);
      ctx.restore();

      // Heavy mud covering lower half of the fallen robot
      const mudGrad = ctx.createLinearGradient(x, y + 25, x, y + 68);
      mudGrad.addColorStop(0, '#5a5043');
      mudGrad.addColorStop(1, '#33291f');
      ctx.fillStyle = mudGrad;
      ctx.beginPath();
      ctx.ellipse(x + 10, y + 54, 95, 22, 0, 0, Math.PI * 2);
      ctx.fill();

      // Scrap debris & cracks
      drawCracks(ctx, x - 60, y - 10, 140, 60, 2, 919);
      drawStructureDebris(ctx, x + 10, y + 66, 3, 818);
    } else {
      if (stage >= 1) {
        // Tilt slightly under pressure
        const tilt = stage === 2 ? -0.06 : -0.02;
        ctx.translate(x + 10, y + 66);
        ctx.rotate(tilt);
        ctx.translate(-(x + 10), -(y + 66));
      }

      ctx.drawImage(robotImg, x - 100, y - 35, 220, 100);

      if (stage === 1) {
        drawCracks(ctx, x - 50, y - 20, 120, 65, 1, 616);
        drawMudOnStructure(ctx, x + 10, y + 66, 120, 12, 1);
      } else if (stage === 2) {
        drawCracks(ctx, x - 60, y - 25, 140, 75, 2, 717);
        drawMudOnStructure(ctx, x + 10, y + 66, 140, 26, 2);
        drawStructureDebris(ctx, x + 10, y + 66, 2, 818);
      }
    }
  }

  if (!r.lost) {
    queueHPBar(x + 10, (y - 35) - 12, 40, 7, r.hp, landmarkColor('robot'), 'robot');
  }
  ctx.restore();
}

function drawMonument(m) {
  if (!m) return;
  ctx.save();
  let shakeX = m.shakeT > 0 ? Math.sin(state.time * 40) * 4 * m.shakeT : 0;
  if (m.shakeT > 0) m.shakeT -= 0.04;
  const x = m.x + shakeX, y = m.y;
  const stage = getDamageStage(m.hp, m.lost);

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  drawGroundShadow(ctx, x, y + 52, 50, 10);

  ctx.globalAlpha = stage === 3 ? 0.9 : 1;

  if (monumentImg.complete && monumentImg.naturalHeight !== 0) {
    if (stage === 3) {
      // Fallen monument
      ctx.save();
      ctx.translate(x, y + 50);
      ctx.rotate(0.42);
      ctx.translate(-x, -(y + 50));
      ctx.drawImage(monumentImg, x - 60, y - 25, 120, 90);
      ctx.restore();

      // Mud dune over fallen pedestal
      const mudGrad = ctx.createLinearGradient(x, y + 30, x, y + 54);
      mudGrad.addColorStop(0, '#5a5043');
      mudGrad.addColorStop(1, '#33291f');
      ctx.fillStyle = mudGrad;
      ctx.beginPath();
      ctx.ellipse(x, y + 46, 56, 16, 0, 0, Math.PI * 2);
      ctx.fill();

      drawCracks(ctx, x - 40, y + 10, 80, 40, 2, 731);
      drawStructureDebris(ctx, x, y + 52, 3, 942);
    } else {
      if (stage >= 1) {
        const tilt = stage === 2 ? 0.04 : 0.015;
        ctx.translate(x, y + 52);
        ctx.rotate(tilt);
        ctx.translate(-x, -(y + 52));
      }

      ctx.drawImage(monumentImg, x - 60, y - 40, 120, 90);

      if (stage === 1) {
        drawCracks(ctx, x - 30, y + 10, 60, 38, 1, 511);
        drawMudOnStructure(ctx, x, y + 52, 65, 8, 1);
      } else if (stage === 2) {
        drawCracks(ctx, x - 35, y + 5, 70, 45, 2, 622);
        drawMudOnStructure(ctx, x, y + 52, 75, 18, 2);
        drawStructureDebris(ctx, x, y + 52, 2, 733);
      }
    }
  }

  if (!m.lost) {
    queueHPBar(x, (y - 40) - 12, 40, 7, m.hp, landmarkColor('monument'), 'monument');
  }
  ctx.restore();
}

// Draws the balustrade railing for a single edge (side -1 = far/upper,
// side 1 = near/lower) of a bridge segment. Pulled out of drawBridgeSpan
// so the near-side rail can be re-drawn later, after traffic, to sit in
// front of the cars visually (see BRIDGE_NEAR_RAIL_SEGMENTS below).
// yOffset shifts the whole railing up(-)/down(+) independent of the deck
// edge it's anchored to — used to nudge the near rail without moving the
// actual road edge.
function drawBridgeRailing(context, x1, x2, deckY, side, yOffset = 0) {
  const rh = BRIDGE_ROAD_HALF;
  const railH = 14;
  const segW = x2 - x1;
  const barCount = Math.max(4, Math.round(segW / 10));
  const edgeY = deckY + side * rh + yOffset;
  const capY = edgeY + side * railH;

  // Base concrete curb
  context.strokeStyle = '#cbd5e1';
  context.lineWidth = 3.5;
  context.lineCap = 'butt';
  context.beginPath();
  context.moveTo(x1, edgeY + side * 1.5);
  context.lineTo(x2, edgeY + side * 1.5);
  context.stroke();

  // Vertical concrete balusters
  context.strokeStyle = '#e2e8f0';
  context.lineWidth = 1.6;
  context.lineCap = 'round';
  for (let i = 0; i <= barCount; i++) {
    const px = x1 + segW * (i / barCount);
    context.beginPath();
    context.moveTo(px, edgeY);
    context.lineTo(px, capY);
    context.stroke();
  }

  // Top cap rail
  context.strokeStyle = '#f8fafc';
  context.lineWidth = 3.2;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(x1, capY);
  context.lineTo(x2, capY);
  context.stroke();

  // Shadow groove beneath cap rail
  context.strokeStyle = 'rgba(0, 0, 0, 0.22)';
  context.lineWidth = 1.2;
  context.beginPath();
  context.moveTo(x1, capY - side * 1.0);
  context.lineTo(x2, capY - side * 1.0);
  context.stroke();
}

let BRIDGE_NEAR_RAIL_SEGMENTS = [];
const NEAR_RAIL_Y_OFFSET = -15;

function drawBridgeNearRail() {
  if (!BRIDGE_NEAR_RAIL_SEGMENTS.length) return;
  ctx.save();
  ctx.globalAlpha = state.bridge && state.bridge.lost ? 0.9 : 1;
  BRIDGE_NEAR_RAIL_SEGMENTS.forEach(seg => {
    drawBridgeRailing(ctx, seg.x1, seg.x2, seg.deckY, 1, NEAR_RAIL_Y_OFFSET);
  });
  ctx.restore();
  BRIDGE_NEAR_RAIL_SEGMENTS = [];
}

function drawBridgeSpan(context, x1, x2, deckY, brokenLeftEnd, brokenRightEnd) {
  const segW = x2 - x1;
  if (segW <= 4) return;
  const rh = BRIDGE_ROAD_HALF;

  // 1. Reinforced Concrete Support Piers with Water/Silt Stains
  const pillarCount = Math.max(1, Math.round(segW / 85));
  for (let i = 0; i <= pillarCount; i++) {
    const px = x1 + segW * (i / pillarCount);
    
    // Pier Capital (Widened top mount)
    context.fillStyle = '#64748b';
    context.fillRect(px - 9, deckY + rh, 18, 5);
    
    // Main Pier Column
    const pierGrad = context.createLinearGradient(px - 7, 0, px + 7, 0);
    pierGrad.addColorStop(0, '#94a3b8');
    pierGrad.addColorStop(0.4, '#cbd5e1');
    pierGrad.addColorStop(1, '#475569');
    context.fillStyle = pierGrad;
    context.fillRect(px - 7, deckY + rh + 4, 14, 28);
    
    // Silt / Tide Stain near base
    context.fillStyle = 'rgba(120, 80, 45, 0.45)';
    context.fillRect(px - 7, deckY + rh + 22, 14, 10);

    // Pier Base Footing
    context.fillStyle = '#334155';
    context.fillRect(px - 9, deckY + rh + 30, 18, 4);

    // Streetlamp post atop each pier (Far rail side)
    const lampX = px;
    const lampBaseY = deckY - rh - 12;
    context.strokeStyle = '#475569';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(lampX, deckY - rh);
    context.lineTo(lampX, lampBaseY);
    context.lineTo(lampX + 3, lampBaseY - 4);
    context.stroke();

    // Glowing Streetlamp Lantern
    if (state.skyTransition > 0.2 || state.raining) {
      const lampGlow = context.createRadialGradient(lampX + 3, lampBaseY - 4, 1, lampX + 3, lampBaseY - 4, 12);
      lampGlow.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
      lampGlow.addColorStop(0.4, 'rgba(251, 191, 36, 0.45)');
      lampGlow.addColorStop(1, 'rgba(251, 191, 36, 0)');
      context.fillStyle = lampGlow;
      context.beginPath();
      context.arc(lampX + 3, lampBaseY - 4, 12, 0, Math.PI * 2);
      context.fill();
    }
    context.fillStyle = '#fef08a';
    context.beginPath();
    context.arc(lampX + 3, lampBaseY - 4, 2, 0, Math.PI * 2);
    context.fill();
  }

  // 2. Under-deck Structural Girders (Steel / Concrete I-beams)
  context.fillStyle = '#334155';
  context.fillRect(x1, deckY + rh - 2, segW, 6);
  context.fillStyle = '#1e293b';
  context.fillRect(x1, deckY + rh + 2, segW, 2.5);

  // 3. Road Deck Surface with Asphalt Texture
  const deckGrad = context.createLinearGradient(0, deckY - rh, 0, deckY + rh);
  deckGrad.addColorStop(0,   '#64748b');
  deckGrad.addColorStop(0.2, '#475569');
  deckGrad.addColorStop(0.8, '#334155');
  deckGrad.addColorStop(1,   '#1e293b');
  context.fillStyle = deckGrad;
  roundRectCtx(context, x1, deckY - rh, segW, rh * 2, 3);
  context.fill();
  context.strokeStyle = 'rgba(0, 0, 0, 0.4)';
  context.lineWidth = 1.5;
  context.stroke();

  // 4. Lane Markings & Highway Shoulder Lines
  context.save();
  context.beginPath();
  roundRectCtx(context, x1, deckY - rh, segW, rh * 2, 3);
  context.clip();

  // Solid White Edge Shoulder Lines
  context.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  context.lineWidth = 1.4;
  context.beginPath();
  context.moveTo(x1, deckY - rh + 2); context.lineTo(x2, deckY - rh + 2);
  context.moveTo(x1, deckY + rh - 2); context.lineTo(x2, deckY + rh - 2);
  context.stroke();

  // Double Yellow Median Divider
  context.strokeStyle = '#facc15';
  context.lineWidth = 1.6;
  context.beginPath();
  context.moveTo(x1, deckY - 1.8); context.lineTo(x2, deckY - 1.8);
  context.moveTo(x1, deckY + 1.8); context.lineTo(x2, deckY + 1.8);
  context.stroke();

  // Dashed White Lane Lines
  context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  context.lineWidth = 1.4;
  context.setLineDash([10, 8]);
  const laneY1 = deckY - rh * 0.52, laneY2 = deckY + rh * 0.52;
  context.beginPath();
  context.moveTo(x1, laneY1); context.lineTo(x2, laneY1);
  context.moveTo(x1, laneY2); context.lineTo(x2, laneY2);
  context.stroke();
  context.setLineDash([]);

  // Asphalt Expansion Joints over Pillars
  context.strokeStyle = 'rgba(15, 23, 42, 0.65)';
  context.lineWidth = 2;
  for (let i = 0; i <= pillarCount; i++) {
    const px = x1 + segW * (i / pillarCount);
    context.beginPath();
    context.moveTo(px, deckY - rh);
    context.lineTo(px, deckY + rh);
    context.stroke();
  }

  context.restore();

  // 5. Far Balustrade Railing (Drawn behind vehicles)
  drawBridgeRailing(context, x1, x2, deckY, -1);
  BRIDGE_NEAR_RAIL_SEGMENTS.push({ x1, x2, deckY });

  // 6. Snapped/Broken Concrete Edge with Exposed Twisted Rebar
  function drawBrokenEdge(edgeX, dir) {
    context.save();
    context.fillStyle = '#475569';
    context.beginPath();
    context.moveTo(edgeX, deckY - rh);
    context.lineTo(edgeX + dir * 14, deckY - rh * 0.4);
    context.lineTo(edgeX + dir * 5, deckY + rh * 0.1);
    context.lineTo(edgeX + dir * 18, deckY + rh * 0.6);
    context.lineTo(edgeX, deckY + rh);
    context.closePath();
    context.fill();

    // Jagged concrete shadow
    context.fillStyle = '#1e293b';
    context.beginPath();
    context.moveTo(edgeX + dir * 4, deckY - rh * 0.2);
    context.lineTo(edgeX + dir * 12, deckY + rh * 0.3);
    context.lineTo(edgeX + dir * 6, deckY + rh * 0.5);
    context.closePath();
    context.fill();

    // Exposed rusted rebar wires protruding into the gap
    context.strokeStyle = '#b45309';
    context.lineWidth = 1.6;
    context.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const ry = deckY - rh + 3 + i * (rh * 2 - 6) / 4;
      context.beginPath();
      context.moveTo(edgeX + dir * 2, ry);
      context.lineTo(edgeX + dir * (12 + (i % 3) * 6), ry + ((i % 2 === 0) ? 5 : -4));
      context.stroke();
    }
    context.restore();
  }

  if (brokenLeftEnd) drawBrokenEdge(x1, 1);
  if (brokenRightEnd) drawBrokenEdge(x2, -1);
}

function drawBridge(b) {
  if (!b) return;
  ctx.save();
  let shakeX = b.shakeT > 0 ? Math.sin(state.time * 40) * 4 * b.shakeT : 0;
  if (b.shakeT > 0) b.shakeT -= 0.04;

  const spanHalf = BRIDGE_SPAN_HALF;
  const deckY = b.y;
  const leftX = b.x - spanHalf + shakeX, rightX = b.x + spanHalf + shakeX;
  const midX = b.x + shakeX;
  const stage = getDamageStage(b.hp, b.lost);

  ctx.globalAlpha = b.lost ? 0.9 : 1;

  if (!b.lost) {
    drawBridgeSpan(ctx, leftX, rightX, deckY, false, false);
    if (stage === 1) {
      drawCracks(ctx, b.x - 60, deckY - BRIDGE_ROAD_HALF + 2, 120, BRIDGE_ROAD_HALF * 2 - 4, 1, 606);
    } else if (stage === 2) {
      drawCracks(ctx, b.x - 80, deckY - BRIDGE_ROAD_HALF + 2, 160, BRIDGE_ROAD_HALF * 2 - 4, 2, 707);
      drawStructureDebris(ctx, b.x, deckY + BRIDGE_ROAD_HALF, 2, 808);
    }
    queueHPBar(b.x, deckY - BRIDGE_ROAD_HALF - 24, 90, 7, b.hp, landmarkColor('bridge'), 'bridge');
  } else {
    // Collapsed: two shorter stubs with a gap in the middle, jagged
    // broken ends, and a rubble pile sitting in the gap.
    const gapHalf = (rightX - leftX) * 0.16;
    drawBridgeSpan(ctx, leftX, midX - gapHalf, deckY, false, true);
    drawBridgeSpan(ctx, midX + gapHalf, rightX, deckY, true, false);

    ctx.fillStyle = 'rgba(90,80,68,0.85)';
    ctx.beginPath();
    ctx.ellipse(midX, deckY + BRIDGE_ROAD_HALF - 4, gapHalf * 0.9, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,54,46,0.7)';
    [-0.6, -0.3, 0, 0.3, 0.6].forEach((f, i) => {
      ctx.beginPath();
      ctx.arc(midX + f * gapHalf, deckY + BRIDGE_ROAD_HALF - 11 + (i % 2) * 7, 3 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
    });
    drawStructureDebris(ctx, midX, deckY + BRIDGE_ROAD_HALF, 3, 909);
  }

  ctx.restore();
}

// ----- House styles: five distinct Filipino house archetypes -----
// Each house cycles through these (see loadTownMap's `style: i %
// HOUSE_STYLES.length`) so a town full of houses reads as a varied
// neighborhood — bahay kubo, GI-sheet concrete bungalows, wooden capiz
// houses, a sari-sari store house, and a concrete hollow-block house —
// rather than the same box repeated with different paint. Each entry's
// `draw` handles its own walls/roof/windows/features across 4 distinct
// damage stages (Normal -> Damaged -> Heavily Damaged -> Destroyed Rubble);
// `groundOffset` positions the drop shadow at that style's actual ground
// line (the bahay kubo sits higher on stilts), and `hpBarOffset` positions
// the shared HP bar above each style's own roofline.
/* ---------------------------------------------------------------
   Shared ground shadow for every structure (houses, church, school,
   robot, monument, landmark props).

   The scene's key light comes from the LEFT (see the volcano's lit
   left flank), so shadows lean to the RIGHT. Two parts, the way a
   real cast shadow reads:
     - a soft, offset penumbra that fades out at its edge, and
     - a tight, darker contact shadow directly under the base
       (ambient occlusion), which is what visually "sits" an object
       on the ground instead of letting it float.
   Both are radial gradients squashed into ellipses, so there are no
   hard rims like the old flat two-ellipse stack.
   --------------------------------------------------------------- */
function drawGroundShadow(context, x, y, rx, ry, strength = 1, lean = 0.26) {
  // DISABLED. The offset cast shadow made buildings read as hovering above
  // the ground rather than standing on it. Kept as a no-op rather than
  // deleting every call site, so it can be reinstated from one place.
  return;
  /* eslint-disable no-unreachable */
  if (rx <= 0 || ry <= 0) return;
  context.save();
  context.translate(x + rx * lean, y);
  context.scale(1, ry / rx);
  const soft = context.createRadialGradient(0, 0, rx * 0.12, 0, 0, rx);
  soft.addColorStop(0,    `rgba(28,22,15,${0.30 * strength})`);
  soft.addColorStop(0.55, `rgba(28,22,15,${0.16 * strength})`);
  soft.addColorStop(1,    'rgba(28,22,15,0)');
  context.fillStyle = soft;
  context.beginPath(); context.arc(0, 0, rx, 0, Math.PI * 2); context.fill();
  context.restore();

  context.save();
  context.translate(x, y);
  context.scale(1, ry / rx);
  const contact = context.createRadialGradient(0, 0, 0, 0, 0, rx * 0.52);
  contact.addColorStop(0, `rgba(14,10,6,${0.40 * strength})`);
  contact.addColorStop(1, 'rgba(14,10,6,0)');
  context.fillStyle = contact;
  context.beginPath(); context.arc(0, 0, rx * 0.52, 0, Math.PI * 2); context.fill();
  context.restore();
}

// Visual size of the houses. Purely cosmetic: collision, damage, the HP
// bar and the goal-panel dots all key off each house's ground point
// (h.x, h.y), which is the scale origin below, so shrinking the drawing
// changes nothing about how the game plays.
const HOUSE_SCALE = 0.8;

const HOUSE_STYLES = [
  { // 0: Bahay kubo — elevated nipa hut on stilts, thatched roof
    groundOffset: 20, hpBarOffset: -44, emojiOffset: -22,
    draw(ctx, x, y, color, lost, stage = 0) {
      if (stage === 3) {
        // Stage 3 (Destroyed): Collapsed nipa hut rubble pile
        drawGenericRubblePile(ctx, x, y + 20, 48, 22, '#5c564c', '#5c5348', 101);
        // Broken stilt poles sticking out at angles
        ctx.save();
        ctx.strokeStyle = '#4a4038';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - 18, y + 16); ctx.lineTo(x - 6, y + 6);
        ctx.moveTo(x + 12, y + 18); ctx.lineTo(x + 22, y + 8);
        ctx.moveTo(x - 4, y + 12); ctx.lineTo(x + 8, y + 4);
        ctx.stroke();
        // Shredded thatch fragments
        ctx.fillStyle = '#8c7648';
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.ellipse(x - 12 + i * 8, y + 10 + (i % 2) * 4, 6, 3, (i - 1.5) * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        return;
      }

      const wall = stage >= 2 ? '#6b655c' : (stage === 1 ? '#b8a994' : color);
      const wood = stage >= 2 ? '#4a4038' : (stage === 1 ? '#5c4129' : '#6b4a30');
      const roofCol = stage >= 2 ? '#6e6354' : (stage === 1 ? '#ad8b4f' : '#c9a15c');

      // Stilts
      ctx.fillStyle = wood;
      if (stage >= 2) {
        // Leaning / snapped stilts
        ctx.fillRect(x - 16, y + 4, 4, 14);
        ctx.fillRect(x + 10, y + 1, 4, 17);
        ctx.fillRect(x - 4, y + 5, 4, 13);
      } else {
        ctx.fillRect(x - 16, y + 2, 4, 16);
        ctx.fillRect(x + 12, y + 2, 4, 16);
        ctx.fillRect(x - 3, y + 4, 4, 14);
      }

      // Floor platform
      ctx.fillStyle = stage >= 2 ? '#5c564c' : (stage === 1 ? '#735738' : '#8a6a45');
      ctx.fillRect(x - 19, y - 1, 38, 4);

      // Ladder
      if (stage < 2) {
        ctx.strokeStyle = wood; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x + 19, y + 1); ctx.lineTo(x + 24, y + 16);
        ctx.moveTo(x + 24, y + 1); ctx.lineTo(x + 29, y + 16);
        for (let r = 0; r < 3; r++) {
          const ly = y + 5 + r * 4;
          ctx.moveTo(x + 20, ly); ctx.lineTo(x + 28, ly);
        }
        ctx.stroke();
      } else {
        // Fallen ladder
        ctx.strokeStyle = wood; ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x + 18, y + 14); ctx.lineTo(x + 30, y + 16);
        ctx.moveTo(x + 19, y + 18); ctx.lineTo(x + 31, y + 20);
        ctx.stroke();
      }

      // Woven sawali walls
      ctx.fillStyle = wall;
      ctx.fillRect(x - 17, y - 14, 34, 14);
      if (stage === 0) {
        ctx.strokeStyle = 'rgba(80,55,25,0.28)'; ctx.lineWidth = 1;
        for (let wy = -12; wy < -1; wy += 3) {
          ctx.beginPath(); ctx.moveTo(x - 17, y + wy); ctx.lineTo(x + 17, y + wy); ctx.stroke();
        }
      } else if (stage >= 1) {
        drawCracks(ctx, x - 17, y - 14, 34, 14, stage, 12);
        if (stage >= 2) {
          // Torn hole in sawali wall
          ctx.fillStyle = '#2d2419';
          ctx.fillRect(x - 5, y - 10, 8, 8);
        }
      }

      // Window opening (no glass, just a shuttered gap)
      if (stage >= 2) {
        drawBrokenWindow(ctx, x - 13, y - 11, 8, 7, 2);
      } else {
        ctx.fillStyle = stage === 1 ? '#3a3630' : '#241c14';
        ctx.fillRect(x - 13, y - 11, 8, 7);
        if (stage === 0) {
          ctx.strokeStyle = '#8a6a45'; ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - 9, y - 11); ctx.lineTo(x - 9, y - 4);
          ctx.moveTo(x - 13, y - 7.5); ctx.lineTo(x - 5, y - 7.5);
          ctx.stroke();
        }
      }

      // Door
      ctx.fillStyle = stage >= 2 ? '#1e1c18' : (stage === 1 ? '#332e28' : '#4a3520');
      ctx.fillRect(x + 2, y - 11, 8, 10);

      // Steep thatched (nipa) roof
      ctx.fillStyle = roofCol;
      ctx.beginPath();
      if (stage >= 2) {
        // Drooping / collapsed left side of thatched roof
        ctx.moveTo(x - 24, y - 10);
        ctx.lineTo(x - 4, y - 32);
        ctx.lineTo(x + 24, y - 14);
      } else {
        ctx.moveTo(x - 24, y - 14);
        ctx.lineTo(x, y - 38);
        ctx.lineTo(x + 24, y - 14);
      }
      ctx.closePath(); ctx.fill();

      if (stage === 0) {
        ctx.strokeStyle = 'rgba(120,90,40,0.4)'; ctx.lineWidth = 1;
        const layers = 6;
        for (let l = 1; l < layers; l++) {
          const t = l / layers;
          const ly = -14 - t * 24;
          const halfW = 24 * (1 - t);
          ctx.beginPath(); ctx.moveTo(x - halfW, y + ly); ctx.lineTo(x + halfW, y + ly); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,235,180,0.3)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x - 20, y - 14.6); ctx.lineTo(x, y - 37); ctx.lineTo(x + 20, y - 14.6); ctx.stroke();
      }

      // Mud on lower stilts/platform
      if (stage >= 1) {
        drawMudOnStructure(ctx, x, y + 18, 38, stage === 1 ? 8 : 16, stage);
      }
    }
  },
  { // 1: Concrete bungalow with a corrugated GI-sheet roof
    groundOffset: 16, hpBarOffset: -28, emojiOffset: -18,
    draw(ctx, x, y, color, lost, stage = 0) {
      if (stage === 3) {
        // Stage 3: Collapsed concrete bungalow rubble
        drawGenericRubblePile(ctx, x, y + 16, 50, 24, '#726d64', '#5c5851', 202);
        // Bent corrugated GI sheet fragments
        ctx.save();
        ctx.strokeStyle = '#8b929a';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(x - 18, y + 6); ctx.lineTo(x - 4, y - 2); ctx.lineTo(x + 8, y + 8);
        ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + 18, y + 12);
        ctx.stroke();
        ctx.restore();
        return;
      }

      const wall = stage >= 2 ? '#6b665d' : (stage === 1 ? '#c4beb5' : color);
      const roofCol = stage >= 2 ? '#4d4b46' : (stage === 1 ? '#787d84' : '#9aa0a6');

      // Walls
      ctx.fillStyle = wall;
      ctx.fillRect(x - 20, y - 8, 40, 24);

      if (stage >= 2) {
        // Wall breach / structural hole
        ctx.fillStyle = '#221f1b';
        ctx.fillRect(x - 4, y, 9, 14);
      }

      // Concrete base trim
      ctx.fillStyle = stage >= 2 ? '#4a463f' : (stage === 1 ? '#8c867b' : '#c9c4ba');
      ctx.fillRect(x - 20, y + 12, 40, 4);

      // Jalousie window
      if (stage >= 1) {
        drawBrokenWindow(ctx, x - 17, y - 4, 12, 10, stage);
      } else {
        ctx.fillStyle = '#89bcd6';
        ctx.fillRect(x - 17, y - 4, 12, 10);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
        for (let s = 0; s < 4; s++) { ctx.beginPath(); ctx.moveTo(x - 17, y - 4 + s * 2.5); ctx.lineTo(x - 5, y - 4 + s * 2.5); ctx.stroke(); }
      }

      // Second small window
      if (stage >= 2) {
        drawBrokenWindow(ctx, x + 6, y - 4, 10, 8, 2);
      } else {
        ctx.fillStyle = stage === 1 ? '#556066' : '#89bcd6';
        ctx.fillRect(x + 6, y - 4, 10, 8);
      }

      // Door
      ctx.fillStyle = stage >= 2 ? '#221e1a' : (stage === 1 ? '#443525' : '#5a4632');
      ctx.fillRect(x - 5, y + 4, 9, 12);

      // Low-pitch GI sheet roof
      ctx.fillStyle = roofCol;
      ctx.beginPath();
      if (stage >= 2) {
        // Buckled / peeled GI roof
        ctx.moveTo(x - 24, y - 8);
        ctx.lineTo(x - 14, y - 17);
        ctx.lineTo(x + 14, y - 22);
        ctx.lineTo(x + 22, y - 4);
      } else {
        ctx.moveTo(x - 24, y - 8);
        ctx.lineTo(x - 16, y - 20);
        ctx.lineTo(x + 16, y - 20);
        ctx.lineTo(x + 24, y - 8);
      }
      ctx.closePath(); ctx.fill();

      if (stage === 0) {
        ctx.strokeStyle = 'rgba(60,65,70,0.4)'; ctx.lineWidth = 1;
        const stripes = 9;
        for (let s = 0; s <= stripes; s++) {
          const t = s / stripes;
          const bx = -24 + t * 48, tx = -16 + t * 32;
          ctx.beginPath(); ctx.moveTo(x + bx, y - 8); ctx.lineTo(x + tx, y - 20); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x - 16, y - 20); ctx.lineTo(x + 16, y - 20); ctx.stroke();
      }

      if (stage >= 1) {
        drawCracks(ctx, x - 20, y - 8, 40, 24, stage, 22);
        drawMudOnStructure(ctx, x, y + 16, 42, stage === 1 ? 7 : 15, stage);
      }
    }
  },
  { // 2: Wooden house with capiz-shell sliding windows
    groundOffset: 16, hpBarOffset: -40, emojiOffset: -20,
    draw(ctx, x, y, color, lost, stage = 0) {
      if (stage === 3) {
        // Stage 3: Collapsed wooden house rubble
        drawGenericRubblePile(ctx, x, y + 16, 48, 24, '#5c5348', '#423226', 303);
        // Splintered timber beams
        ctx.save();
        ctx.strokeStyle = '#4a3828'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - 16, y + 14); ctx.lineTo(x - 2, y + 4);
        ctx.moveTo(x - 4, y + 6); ctx.lineTo(x + 18, y + 12);
        ctx.stroke();
        ctx.restore();
        return;
      }

      const wall = stage >= 2 ? '#5c5449' : (stage === 1 ? '#a8947e' : color);
      const roofCol = stage >= 2 ? '#483329' : (stage === 1 ? '#63392c' : '#7a4a3a');

      // Wooden plank walls
      ctx.fillStyle = wall;
      ctx.fillRect(x - 20, y - 10, 40, 26);
      if (stage === 0) {
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
        for (let wy = -8; wy < 14; wy += 4) { ctx.beginPath(); ctx.moveTo(x - 20, y + wy); ctx.lineTo(x + 20, y + wy); ctx.stroke(); }
      }

      if (stage >= 2) {
        // Missing plank section / dark interior
        ctx.fillStyle = '#221912';
        ctx.fillRect(x + 4, y + 2, 10, 10);
      }

      // Capiz-shell window
      if (stage >= 1) {
        drawBrokenWindow(ctx, x - 17, y - 6, 13, 12, stage);
      } else {
        ctx.fillStyle = '#ece3cf';
        ctx.fillRect(x - 17, y - 6, 13, 12);
        ctx.strokeStyle = 'rgba(120,95,60,0.6)'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x - 17, y); ctx.lineTo(x - 4, y);
        ctx.moveTo(x - 10.5, y - 6); ctx.lineTo(x - 10.5, y + 6);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x - 16, y - 5, 5, 5);
      }

      // Door
      ctx.fillStyle = stage >= 2 ? '#1e1610' : (stage === 1 ? '#3d2817' : '#5a3d24');
      ctx.fillRect(x + 4, y - 2, 10, 14);

      // Eave shadow
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x - 22, y - 12, 44, 3);

      // Hip roof
      ctx.fillStyle = roofCol;
      ctx.beginPath();
      if (stage >= 2) {
        // Sagging caved-in roof
        ctx.moveTo(x - 27, y - 12);
        ctx.lineTo(x - 6, y - 24);
        ctx.lineTo(x + 8, y - 30);
        ctx.lineTo(x + 27, y - 12);
      } else {
        ctx.moveTo(x - 27, y - 12);
        ctx.lineTo(x - 8, y - 32);
        ctx.lineTo(x + 8, y - 32);
        ctx.lineTo(x + 27, y - 12);
      }
      ctx.closePath(); ctx.fill();

      if (stage === 0) {
        ctx.strokeStyle = 'rgba(255,220,190,0.3)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x - 8, y - 32); ctx.lineTo(x + 8, y - 32); ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x - 27, y - 12); ctx.lineTo(x - 8, y - 32); ctx.moveTo(x + 27, y - 12); ctx.lineTo(x + 8, y - 32); ctx.stroke();
      }

      if (stage >= 1) {
        drawCracks(ctx, x - 20, y - 10, 40, 26, stage, 33);
        drawMudOnStructure(ctx, x, y + 16, 42, stage === 1 ? 7 : 14, stage);
      }
    }
  },
  { // 3: Sari-sari store house — a small storefront window built into the house
    groundOffset: 16, hpBarOffset: -22, emojiOffset: -16,
    draw(ctx, x, y, color, lost, stage = 0) {
      if (stage === 3) {
        // Stage 3: Collapsed sari-sari store rubble
        drawGenericRubblePile(ctx, x, y + 16, 50, 24, '#635c52', '#54261e', 404);
        // Broken 'STORE' sign splinter
        ctx.save();
        ctx.translate(x - 6, y + 6);
        ctx.rotate(0.35);
        ctx.fillStyle = '#9e2a2b';
        ctx.fillRect(-8, -3, 16, 6);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 5px Arial'; ctx.textAlign = 'center';
        ctx.fillText('STORE', 0, 1);
        ctx.restore();
        return;
      }

      const wall = stage >= 2 ? '#665e54' : (stage === 1 ? '#c7bdb0' : color);
      const roofCol = stage >= 2 ? '#48201a' : (stage === 1 ? '#632e26' : '#7a3b30');

      // Walls
      ctx.fillStyle = wall;
      ctx.fillRect(x - 20, y - 8, 40, 24);

      // Store counter opening
      ctx.fillStyle = stage >= 2 ? '#1a140e' : (stage === 1 ? '#2b1f14' : '#241c14');
      ctx.fillRect(x - 17, y - 4, 22, 10);

      if (stage < 2) {
        // Counter ledge
        ctx.fillStyle = stage === 1 ? '#664d30' : '#8a6a45';
        ctx.fillRect(x - 18, y + 6, 24, 3);
        // Hanging snack items
        const snackColors = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a'];
        snackColors.forEach((c, s2) => { ctx.fillStyle = c; ctx.fillRect(x - 15 + s2 * 5, y - 4, 3, 6); });
        // Sign board
        ctx.save();
        if (stage === 1) {
          ctx.translate(x - 8, y - 11);
          ctx.rotate(-0.08); // Slight tilt on damaged sign
          ctx.translate(-(x - 8), -(y - 11));
        }
        ctx.fillStyle = '#e63946';
        ctx.fillRect(x - 18, y - 14, 20, 6);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 6px Arial'; ctx.textAlign = 'center';
        ctx.fillText('STORE', x - 8, y - 10);
        ctx.restore();
      } else {
        // Collapsed counter
        ctx.fillStyle = '#4a3520';
        ctx.fillRect(x - 18, y + 8, 14, 3);
        // Tilted broken sign hanging by one nail
        ctx.save();
        ctx.translate(x - 18, y - 14);
        ctx.rotate(0.45);
        ctx.fillStyle = '#9e2a2b';
        ctx.fillRect(0, 0, 18, 5);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 5px Arial'; ctx.textAlign = 'center';
        ctx.fillText('STO', 9, 4);
        ctx.restore();
      }

      // Small side window
      if (stage >= 1) {
        drawBrokenWindow(ctx, x + 9, y - 4, 8, 8, stage);
      } else {
        ctx.fillStyle = '#a8e4f8';
        ctx.fillRect(x + 9, y - 4, 8, 8);
      }

      // Roof
      ctx.fillStyle = roofCol;
      ctx.beginPath();
      if (stage >= 2) {
        ctx.moveTo(x - 24, y - 6);
        ctx.lineTo(x + 2, y - 18);
        ctx.lineTo(x + 24, y - 8);
      } else {
        ctx.moveTo(x - 24, y - 8);
        ctx.lineTo(x, y - 24);
        ctx.lineTo(x + 24, y - 8);
      }
      ctx.closePath(); ctx.fill();

      if (stage === 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x - 19, y - 8); ctx.lineTo(x, y - 24); ctx.lineTo(x + 19, y - 8); ctx.stroke();
      }

      if (stage >= 1) {
        drawCracks(ctx, x - 20, y - 8, 40, 24, stage, 44);
        drawMudOnStructure(ctx, x, y + 16, 42, stage === 1 ? 8 : 16, stage);
      }
    }
  },
  { // 4: Concrete hollow-block (CHB) house — boxy, flat parapet roof
    groundOffset: 16, hpBarOffset: -25, emojiOffset: -16,
    draw(ctx, x, y, color, lost, stage = 0) {
      if (stage === 3) {
        // Stage 3: Collapsed CHB house rubble pile with hollow blocks
        drawGenericRubblePile(ctx, x, y + 16, 50, 24, '#6b665c', '#545048', 505);
        // Exposed hollow blocks with holes
        ctx.save();
        ctx.fillStyle = '#4a463e';
        ctx.strokeStyle = '#2d2a25';
        ctx.lineWidth = 1;
        for (let b = 0; b < 3; b++) {
          const bx = x - 12 + b * 11, by = y + 8 + (b % 2) * 4;
          ctx.fillRect(bx, by, 8, 5); ctx.strokeRect(bx, by, 8, 5);
          ctx.fillStyle = '#24211c';
          ctx.fillRect(bx + 1.5, by + 1.5, 2, 2); ctx.fillRect(bx + 4.5, by + 1.5, 2, 2);
          ctx.fillStyle = '#4a463e';
        }
        ctx.restore();
        return;
      }

      const wall = stage >= 2 ? '#615c54' : (stage === 1 ? '#aba396' : color);

      // Walls with a block grid texture
      ctx.fillStyle = wall;
      ctx.fillRect(x - 20, y - 14, 40, 30);
      if (stage === 0) {
        ctx.strokeStyle = 'rgba(0,0,0,0.1)'; ctx.lineWidth = 1;
        for (let by = -12; by < 14; by += 5) { ctx.beginPath(); ctx.moveTo(x - 20, y + by); ctx.lineTo(x + 20, y + by); ctx.stroke(); }
        for (let bx = -20; bx <= 20; bx += 10) { ctx.beginPath(); ctx.moveTo(x + bx, y - 14); ctx.lineTo(x + bx, y + 16); ctx.stroke(); }
      }

      if (stage >= 2) {
        // Wall block blowout / hole
        ctx.fillStyle = '#1c1a17';
        ctx.fillRect(x + 6, y - 2, 10, 14);
      }

      // Flat roof / parapet cap
      ctx.fillStyle = stage >= 2 ? '#47433c' : (stage === 1 ? '#8f887c' : '#b8b2a4');
      if (stage >= 2) {
        // Crumbled broken parapet
        ctx.fillRect(x - 22, y - 17, 26, 5);
        ctx.fillRect(x + 10, y - 16, 12, 4);
      } else {
        ctx.fillRect(x - 22, y - 17, 44, 5);
      }

      // Awning window
      if (stage >= 1) {
        drawBrokenWindow(ctx, x - 15, y - 8, 12, 10, stage);
      } else {
        ctx.fillStyle = '#a8d8e8';
        ctx.fillRect(x - 15, y - 8, 12, 10);
        ctx.fillStyle = '#8a8478';
        ctx.beginPath(); ctx.moveTo(x - 17, y - 8); ctx.lineTo(x - 13, y - 13); ctx.lineTo(x - 1, y - 13); ctx.lineTo(x - 3, y - 8); ctx.closePath(); ctx.fill();
      }

      // Door
      ctx.fillStyle = stage >= 2 ? '#1e1a16' : (stage === 1 ? '#332b24' : '#4a3f36');
      ctx.fillRect(x + 4, y - 4, 10, 16);

      if (stage >= 1) {
        drawCracks(ctx, x - 20, y - 14, 40, 30, stage, 55);
        drawMudOnStructure(ctx, x, y + 16, 42, stage === 1 ? 8 : 16, stage);
      }
    }
  },
  { // 5: Bahay na bato — Spanish-era ancestral house (Angeles' Sto. Rosario
    // district, old Bacolor): adobe-stone ground floor, overhanging wooden
    // upper floor with capiz sliding windows and ventanillas, tiled roof.
    groundOffset: 16, hpBarOffset: -56, emojiOffset: -28,
    draw(ctx, x, y, color, lost, stage = 0) {
      if (stage === 3) {
        drawGenericRubblePile(ctx, x, y + 16, 54, 24, '#7d7266', '#7a4a34', 611);
        ctx.save();
        // Toppled adobe blocks and charred hardwood beams
        ctx.fillStyle = '#a89c86'; ctx.strokeStyle = '#5e5446'; ctx.lineWidth = 1;
        [[-16, 6], [-4, 10], [9, 5]].forEach(([bx, by]) => { ctx.fillRect(x + bx, y + by, 10, 6); ctx.strokeRect(x + bx, y + by, 10, 6); });
        ctx.strokeStyle = '#3a2418'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - 20, y + 14); ctx.lineTo(x - 2, y + 2); ctx.moveTo(x + 4, y + 14); ctx.lineTo(x + 22, y + 6); ctx.stroke();
        // Scattered capiz panes
        ctx.fillStyle = 'rgba(236,228,205,0.8)';
        for (let i = 0; i < 4; i++) ctx.fillRect(x - 10 + i * 7, y + 9 + (i % 2) * 3, 3, 3);
        ctx.restore();
        return;
      }
      const stone = stage >= 2 ? '#6d665c' : (stage === 1 ? '#a89e8c' : '#c4b79f');
      const wood  = stage >= 2 ? '#4a3a30' : (stage === 1 ? '#6e4a34' : '#7d4b2f');
      const woodD = stage >= 2 ? '#352a23' : '#5a3520';
      const tile  = stage >= 2 ? '#6b4a3c' : (stage === 1 ? '#8f5a44' : '#a85a3e');
      const capiz = stage >= 2 ? '#8f877a' : '#ede4c8';

      // Ground floor: adobe stone with block courses
      ctx.fillStyle = stone; ctx.fillRect(x - 21, y - 6, 42, 22);
      ctx.strokeStyle = 'rgba(60,45,30,0.25)'; ctx.lineWidth = 1;
      for (let r = 0; r < 4; r++) {
        const ly = y - 2 + r * 5;
        ctx.beginPath(); ctx.moveTo(x - 21, ly); ctx.lineTo(x + 21, ly); ctx.stroke();
        for (let b = -21 + (r % 2) * 5; b < 21; b += 10) { ctx.beginPath(); ctx.moveTo(x + b, ly); ctx.lineTo(x + b, ly + 5); ctx.stroke(); }
      }
      // Zaguan: arched carriage entrance
      ctx.fillStyle = stage >= 2 ? '#15110e' : '#2a1f18';
      ctx.beginPath(); ctx.moveTo(x - 6, y + 16); ctx.lineTo(x - 6, y + 4); ctx.arc(x, y + 4, 6, Math.PI, 0); ctx.lineTo(x + 6, y + 16); ctx.closePath(); ctx.fill();
      // Barred ground-floor window
      ctx.fillStyle = '#2d2620'; ctx.fillRect(x + 10, y - 1, 8, 8);
      ctx.strokeStyle = '#8a8070'; ctx.lineWidth = 1;
      for (let b = 0; b < 3; b++) { ctx.beginPath(); ctx.moveTo(x + 12 + b * 2.5, y - 1); ctx.lineTo(x + 12 + b * 2.5, y + 7); ctx.stroke(); }

      // Overhanging wooden upper floor (volada) on corbels
      ctx.fillStyle = woodD; ctx.fillRect(x - 25, y - 8, 50, 3);
      for (let cx2 = -22; cx2 <= 22; cx2 += 11) { ctx.beginPath(); ctx.moveTo(x + cx2 - 2, y - 5); ctx.lineTo(x + cx2, y - 1); ctx.lineTo(x + cx2 + 2, y - 5); ctx.fill(); }
      ctx.fillStyle = wood; ctx.fillRect(x - 25, y - 32, 50, 24);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      for (let p = -30; p < -8; p += 4) { ctx.beginPath(); ctx.moveTo(x - 25, y + p); ctx.lineTo(x + 25, y + p); ctx.stroke(); }
      // Capiz sliding windows (two wide bays) with small-pane grid
      [-20, 5].forEach(wx => {
        ctx.fillStyle = capiz; ctx.fillRect(x + wx, y - 29, 15, 11);
        ctx.strokeStyle = woodD; ctx.lineWidth = 1;
        for (let gx = 3; gx < 15; gx += 3) { ctx.beginPath(); ctx.moveTo(x + wx + gx, y - 29); ctx.lineTo(x + wx + gx, y - 18); ctx.stroke(); }
        for (let gy = 3; gy < 11; gy += 4) { ctx.beginPath(); ctx.moveTo(x + wx, y - 29 + gy); ctx.lineTo(x + wx + 15, y - 29 + gy); ctx.stroke(); }
        ctx.strokeRect(x + wx, y - 29, 15, 11);
        // Ventanilla balusters beneath the sill
        ctx.strokeStyle = stage >= 2 ? '#2a201a' : '#e2d6b8';
        for (let v = 1; v < 15; v += 2.5) { ctx.beginPath(); ctx.moveTo(x + wx + v, y - 16); ctx.lineTo(x + wx + v, y - 11); ctx.stroke(); }
      });
      if (stage >= 2) {
        ctx.fillStyle = '#1a140f'; ctx.fillRect(x - 6, y - 28, 11, 12);   // blown-out upper wall
        drawBrokenWindow(ctx, x + 5, y - 29, 15, 11, stage);
      } else if (stage === 1) {
        drawBrokenWindow(ctx, x - 20, y - 29, 15, 11, stage);
      }

      // Hipped tile roof with deep eaves
      ctx.fillStyle = tile;
      ctx.beginPath(); ctx.moveTo(x - 30, y - 32); ctx.lineTo(x - 12, y - 45); ctx.lineTo(x + 12, y - 45); ctx.lineTo(x + 30, y - 32); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,25,15,0.35)'; ctx.lineWidth = 1;
      for (let r = 1; r <= 3; r++) {
        const t = r / 4;
        ctx.beginPath(); ctx.moveTo(x - 30 + 18 * t, y - 32 - 13 * t); ctx.lineTo(x + 30 - 18 * t, y - 32 - 13 * t); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,230,200,0.35)'; ctx.beginPath(); ctx.moveTo(x - 12, y - 45); ctx.lineTo(x + 12, y - 45); ctx.stroke();
      if (stage >= 2) { ctx.fillStyle = '#2a1a12'; ctx.beginPath(); ctx.moveTo(x + 4, y - 44); ctx.lineTo(x + 18, y - 35); ctx.lineTo(x + 6, y - 33); ctx.closePath(); ctx.fill(); }

      if (stage >= 1) {
        drawCracks(ctx, x - 21, y - 6, 42, 22, stage, 61);
        drawMudOnStructure(ctx, x, y + 16, 46, stage === 1 ? 8 : 16, stage);
      }
    }
  },
  { // 6: Two-storey concrete house (Angeles City): steel-grille balcony,
    // grilled windows, aircon unit, green GI roof — the standard urban
    // Pampanga family house.
    groundOffset: 16, hpBarOffset: -52, emojiOffset: -26,
    draw(ctx, x, y, color, lost, stage = 0) {
      if (stage === 3) {
        drawGenericRubblePile(ctx, x, y + 16, 52, 24, '#6e6a62', '#2f5a42', 622);
        ctx.save();
        // Twisted balcony grille and a slab chunk
        ctx.strokeStyle = '#2b4d38'; ctx.lineWidth = 1.4;
        ctx.beginPath(); for (let g = 0; g < 5; g++) { ctx.moveTo(x - 14 + g * 4, y + 12 + (g % 2) * 2); ctx.lineTo(x - 10 + g * 4, y + 4 + (g % 3)); } ctx.stroke();
        ctx.fillStyle = '#8e887c'; ctx.fillRect(x + 4, y + 6, 16, 6);
        ctx.fillStyle = '#5f5a52'; ctx.fillRect(x + 8, y + 2, 6, 4);
        ctx.restore();
        return;
      }
      const wall  = stage >= 2 ? '#635e56' : (stage === 1 ? '#aca496' : color);
      const wall2 = stage >= 2 ? '#56514a' : (stage === 1 ? '#9c9487' : lerpColor(color, '#ffffff', 0.35));
      const steel = stage >= 2 ? '#2a2f2c' : '#2f6b48';
      const roof  = stage >= 2 ? '#3a473f' : (stage === 1 ? '#3f6650' : '#2f7a55');
      const glass = stage >= 2 ? '#3a3f44' : '#9fd0e8';

      // Ground floor
      ctx.fillStyle = wall; ctx.fillRect(x - 21, y - 4, 42, 20);
      // Door + grilled window
      ctx.fillStyle = stage >= 2 ? '#14110e' : '#3d3229'; ctx.fillRect(x + 7, y - 1, 10, 17);
      ctx.fillStyle = '#8a7c6c'; ctx.fillRect(x + 8, y, 8, 1);
      if (stage >= 2) drawBrokenWindow(ctx, x - 15, y - 1, 13, 9, stage);
      else {
        ctx.fillStyle = glass; ctx.fillRect(x - 15, y - 1, 13, 9);
        ctx.strokeStyle = steel; ctx.lineWidth = 1;
        for (let g = 0; g <= 13; g += 3.25) { ctx.beginPath(); ctx.moveTo(x - 15 + g, y - 1); ctx.lineTo(x - 15 + g, y + 8); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(x - 15, y + 3.5); ctx.lineTo(x - 2, y + 3.5); ctx.stroke();
      }
      // Floor slab line
      ctx.fillStyle = stage >= 2 ? '#3f3b35' : '#b9b3a6'; ctx.fillRect(x - 23, y - 6, 46, 3);

      // Second storey
      ctx.fillStyle = wall2; ctx.fillRect(x - 21, y - 28, 42, 22);
      // Balcony: slab + steel grille railing
      ctx.fillStyle = stage >= 2 ? '#3f3b35' : '#aaa497'; ctx.fillRect(x - 24, y - 12, 26, 3);
      ctx.strokeStyle = steel; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - 24, y - 19); ctx.lineTo(x + 2, y - 19); ctx.stroke();
      for (let g = -23; g <= 1; g += 3) { ctx.beginPath(); ctx.moveTo(x + g, y - 19); ctx.lineTo(x + g, y - 12); ctx.stroke(); }
      // Balcony door (sliding glass) behind the railing
      ctx.fillStyle = glass; ctx.fillRect(x - 18, y - 26, 12, 13);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(x - 12, y - 26); ctx.lineTo(x - 12, y - 13); ctx.stroke();
      // Upper window with grille + aircon unit
      if (stage >= 1) drawBrokenWindow(ctx, x + 6, y - 25, 12, 9, stage);
      else {
        ctx.fillStyle = glass; ctx.fillRect(x + 6, y - 25, 12, 9);
        ctx.strokeStyle = steel; for (let g = 0; g <= 12; g += 3) { ctx.beginPath(); ctx.moveTo(x + 6 + g, y - 25); ctx.lineTo(x + 6 + g, y - 16); ctx.stroke(); }
      }
      if (stage < 2) {
        ctx.fillStyle = '#d9d6cf'; ctx.fillRect(x + 8, y - 14, 9, 6);
        ctx.strokeStyle = '#8f8b84'; ctx.lineWidth = 0.8;
        for (let f = 1; f < 6; f += 1.5) { ctx.beginPath(); ctx.moveTo(x + 8, y - 14 + f); ctx.lineTo(x + 17, y - 14 + f); ctx.stroke(); }
      }
      if (stage >= 2) { ctx.fillStyle = '#16120f'; ctx.fillRect(x + 4, y - 4, 9, 9); }

      // Hip roof, green GI sheets
      ctx.fillStyle = roof;
      ctx.beginPath(); ctx.moveTo(x - 26, y - 28); ctx.lineTo(x - 8, y - 40); ctx.lineTo(x + 8, y - 40); ctx.lineTo(x + 26, y - 28); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1;
      for (let c2 = -22; c2 <= 22; c2 += 4) { ctx.beginPath(); ctx.moveTo(x + c2, y - 28); ctx.lineTo(x + c2 * 0.35, y - 40); ctx.stroke(); }
      ctx.fillStyle = stage >= 2 ? '#2c2925' : '#e8e4da'; ctx.fillRect(x - 27, y - 29, 54, 2);   // fascia / gutter
      if (stage >= 2) { ctx.fillStyle = '#1d1a16'; ctx.beginPath(); ctx.moveTo(x - 6, y - 40); ctx.lineTo(x + 10, y - 39); ctx.lineTo(x + 2, y - 31); ctx.closePath(); ctx.fill(); }

      if (stage >= 1) {
        drawCracks(ctx, x - 21, y - 4, 42, 20, stage, 62);
        drawMudOnStructure(ctx, x, y + 16, 46, stage === 1 ? 8 : 16, stage);
      }
    }
  },
  { // 7: "Apartment" row house (Angeles): two attached rental units under a
    // flat parapet roof with a rooftop water tank — the ubiquitous city
    // rental block.
    groundOffset: 16, hpBarOffset: -38, emojiOffset: -20,
    draw(ctx, x, y, color, lost, stage = 0) {
      if (stage === 3) {
        drawGenericRubblePile(ctx, x, y + 16, 56, 24, '#6b675f', '#8f8a80', 633);
        ctx.save();
        ctx.fillStyle = '#9a958a'; ctx.fillRect(x - 18, y + 6, 18, 5); ctx.fillRect(x + 4, y + 9, 14, 4);  // parapet slabs
        ctx.fillStyle = '#2f5d8a'; ctx.beginPath(); ctx.ellipse(x + 12, y + 4, 6, 4, 0.5, 0, Math.PI * 2); ctx.fill(); // fallen tank
        ctx.restore();
        return;
      }
      const unitA = stage >= 2 ? '#5f5b54' : (stage === 1 ? '#a89f92' : color);
      const unitB = stage >= 2 ? '#56524b' : (stage === 1 ? '#9d9588' : lerpColor(color, '#f3efe6', 0.6));
      const glass = stage >= 2 ? '#34383c' : '#a9d3e6';
      const grille = stage >= 2 ? '#2b2b2b' : '#3a4d7a';

      // Two units
      ctx.fillStyle = unitA; ctx.fillRect(x - 26, y - 20, 26, 36);
      ctx.fillStyle = unitB; ctx.fillRect(x, y - 20, 26, 36);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x - 0.5, y - 20, 1, 36);   // party wall
      // Per-unit door + grilled window
      [-26, 0].forEach((ux, k) => {
        ctx.fillStyle = stage >= 2 ? '#14110e' : (k ? '#5a4a3c' : '#3d3229'); ctx.fillRect(x + ux + 4, y, 8, 16);
        if (stage >= 2 && k === 0) drawBrokenWindow(ctx, x + ux + 15, y - 12, 9, 9, stage);
        else {
          ctx.fillStyle = glass; ctx.fillRect(x + ux + 15, y - 12, 9, 9);
          ctx.strokeStyle = grille; ctx.lineWidth = 1;
          for (let g = 0; g <= 9; g += 3) { ctx.beginPath(); ctx.moveTo(x + ux + 15 + g, y - 12); ctx.lineTo(x + ux + 15 + g, y - 3); ctx.stroke(); }
          ctx.beginPath(); ctx.moveTo(x + ux + 15, y - 7.5); ctx.lineTo(x + ux + 24, y - 7.5); ctx.stroke();
        }
        // Electric meter box
        ctx.fillStyle = '#c9c4ba'; ctx.fillRect(x + ux + 15, y + 2, 4, 4);
      });
      if (stage >= 2) { ctx.fillStyle = '#16120f'; ctx.fillRect(x + 4, y - 14, 8, 10); }

      // Parapet roof + water tank
      ctx.fillStyle = stage >= 2 ? '#45413a' : (stage === 1 ? '#8f887c' : '#b6b0a3');
      if (stage >= 2) { ctx.fillRect(x - 28, y - 23, 30, 4); ctx.fillRect(x + 8, y - 22, 20, 3); }
      else ctx.fillRect(x - 28, y - 23, 56, 4);
      if (stage < 2) {
        ctx.fillStyle = '#2f5d8a'; ctx.fillRect(x + 12, y - 33, 10, 10);
        ctx.fillStyle = '#3f74a8'; ctx.beginPath(); ctx.ellipse(x + 17, y - 33, 5, 1.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#6b6660'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 13, y - 23); ctx.lineTo(x + 13, y - 33); ctx.moveTo(x + 21, y - 23); ctx.lineTo(x + 21, y - 33); ctx.stroke();
      }
      // Clothesline strung across the front
      if (stage === 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x - 24, y - 6); ctx.quadraticCurveTo(x - 12, y - 3, x - 2, y - 6); ctx.stroke();
        ['#e46a6a', '#f2e394', '#7fb7e0'].forEach((cl, i) => { ctx.fillStyle = cl; ctx.fillRect(x - 21 + i * 6, y - 5 + (i % 2) * 0.5, 3, 4); });
      }

      if (stage >= 1) {
        drawCracks(ctx, x - 26, y - 20, 52, 36, stage, 63);
        drawMudOnStructure(ctx, x, y + 16, 56, stage === 1 ? 8 : 16, stage);
      }
    }
  },
  { // 8: Lahar-raised house (Bacolor): the original ground floor lies buried
    // under grey lahar sand — only its old GI roof ridge still shows — and
    // a new storey has been built on top, reached by a short stair.
    groundOffset: 16, hpBarOffset: -50, emojiOffset: -24,
    draw(ctx, x, y, color, lost, stage = 0) {
      // Lahar sand mound around the house (drawn in every stage)
      ctx.fillStyle = stage >= 2 ? '#8f8a80' : '#c6bdac';
      ctx.beginPath(); ctx.ellipse(x, y + 11, 34, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(70,60,50,0.18)';
      ctx.beginPath(); ctx.ellipse(x, y + 13, 34, 4, 0, 0, Math.PI); ctx.fill();
      // Old buried roof: the rusty GI gable of the original house, its
      // eaves swallowed by the sand — the tell-tale Bacolor silhouette.
      const oldRoof = stage >= 2 ? '#5a463a' : '#8f5636';
      ctx.fillStyle = oldRoof;
      ctx.beginPath(); ctx.moveTo(x - 30, y + 11); ctx.lineTo(x - 20, y + 3); ctx.lineTo(x - 22, y - 1); ctx.lineTo(x + 22, y - 1); ctx.lineTo(x + 20, y + 3); ctx.lineTo(x + 30, y + 11); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 1;
      for (let c2 = -26; c2 <= 26; c2 += 4) { ctx.beginPath(); ctx.moveTo(x + c2, y + 10); ctx.lineTo(x + c2 * 0.72, y + 3); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(255,220,190,0.35)'; ctx.beginPath(); ctx.moveTo(x - 22, y - 1); ctx.lineTo(x + 22, y - 1); ctx.stroke();
      // Sand lapping over the buried eaves
      ctx.fillStyle = stage >= 2 ? '#8f8a80' : '#c6bdac';
      ctx.beginPath(); ctx.moveTo(x - 34, y + 11); ctx.quadraticCurveTo(x - 22, y + 6, x - 12, y + 9); ctx.quadraticCurveTo(x, y + 12, x + 12, y + 9); ctx.quadraticCurveTo(x + 22, y + 6, x + 34, y + 11); ctx.lineTo(x + 34, y + 16); ctx.lineTo(x - 34, y + 16); ctx.closePath(); ctx.fill();

      if (stage === 3) {
        drawGenericRubblePile(ctx, x, y + 10, 46, 20, '#75706a', '#3a6b8a', 644);
        ctx.save();
        ctx.fillStyle = '#9a958c'; ctx.fillRect(x - 12, y + 2, 14, 6); ctx.fillRect(x + 6, y + 5, 10, 4);
        ctx.restore();
        return;
      }
      const wall = stage >= 2 ? '#605b53' : (stage === 1 ? '#aaa293' : color);
      const roof = stage >= 2 ? '#3b4a55' : (stage === 1 ? '#3f6a86' : '#3a7ea0');
      const glass = stage >= 2 ? '#34383c' : '#a4d2ea';

      // New storey, sitting on the old roof
      ctx.fillStyle = wall; ctx.fillRect(x - 18, y - 24, 36, 26);
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      for (let by = -20; by < 2; by += 5) { ctx.beginPath(); ctx.moveTo(x - 18, y + by); ctx.lineTo(x + 18, y + by); ctx.stroke(); }
      // Door at the top of the stair, window with bars
      ctx.fillStyle = stage >= 2 ? '#14110e' : '#3d3229'; ctx.fillRect(x + 8, y - 14, 8, 16);
      if (stage >= 1) drawBrokenWindow(ctx, x - 13, y - 18, 11, 9, stage);
      else {
        ctx.fillStyle = glass; ctx.fillRect(x - 13, y - 18, 11, 9);
        ctx.strokeStyle = '#4a5a70'; ctx.lineWidth = 1;
        for (let g = 0; g <= 11; g += 2.75) { ctx.beginPath(); ctx.moveTo(x - 13 + g, y - 18); ctx.lineTo(x - 13 + g, y - 9); ctx.stroke(); }
      }
      if (stage >= 2) { ctx.fillStyle = '#16120f'; ctx.fillRect(x - 4, y - 8, 9, 9); }
      // Concrete stair climbing the sand to the door
      ctx.fillStyle = stage >= 2 ? '#4c4842' : '#b8b2a5';
      for (let st = 0; st < 4; st++) ctx.fillRect(x + 18 + st * 3, y + 2 + st * 2.5, 10 - st * 1.5, 2.5);
      // New GI roof (blue) with corrugations
      ctx.fillStyle = roof;
      ctx.beginPath(); ctx.moveTo(x - 23, y - 24); ctx.lineTo(x, y - 36); ctx.lineTo(x + 23, y - 24); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      for (let c2 = -19; c2 <= 19; c2 += 4) { ctx.beginPath(); ctx.moveTo(x + c2, y - 24); ctx.lineTo(x + c2 * 0.15, y - 35); ctx.stroke(); }
      if (stage >= 2) { ctx.fillStyle = '#1d1a16'; ctx.beginPath(); ctx.moveTo(x - 2, y - 35); ctx.lineTo(x + 12, y - 30); ctx.lineTo(x + 2, y - 26); ctx.closePath(); ctx.fill(); }

      if (stage >= 1) {
        drawCracks(ctx, x - 18, y - 24, 36, 26, stage, 64);
        drawMudOnStructure(ctx, x, y + 2, 40, stage === 1 ? 6 : 12, stage);
      }
    }
  },
  { // 9: Half-concrete, half-wood upland house (Porac): hollow-block base,
    // wooden-plank upper walls, rusted GI roof, a water drum by the wall —
    // the typical barangay house on the volcano's foot-slopes.
    groundOffset: 16, hpBarOffset: -44, emojiOffset: -22,
    draw(ctx, x, y, color, lost, stage = 0) {
      if (stage === 3) {
        drawGenericRubblePile(ctx, x, y + 16, 50, 22, '#6a655c', '#7a4a34', 655);
        ctx.save();
        ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - 18, y + 12); ctx.lineTo(x - 4, y + 4); ctx.moveTo(x + 2, y + 14); ctx.lineTo(x + 18, y + 8); ctx.stroke();
        ctx.fillStyle = '#7a756c'; ctx.strokeStyle = '#3f3b35'; ctx.lineWidth = 1;
        ctx.fillRect(x - 10, y + 8, 8, 5); ctx.strokeRect(x - 10, y + 8, 8, 5); ctx.fillRect(x + 6, y + 10, 8, 5); ctx.strokeRect(x + 6, y + 10, 8, 5);
        ctx.restore();
        return;
      }
      const block = stage >= 2 ? '#5e5a52' : (stage === 1 ? '#8f8a7e' : '#a9a498');
      const plank = stage >= 2 ? '#4a3a2c' : (stage === 1 ? '#6f4c30' : '#8a5a33');
      const roof  = stage >= 2 ? '#5a4032' : (stage === 1 ? '#7d4c36' : '#9a5a3c');

      // Hollow-block base
      ctx.fillStyle = block; ctx.fillRect(x - 19, y + 1, 38, 15);
      ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 1;
      for (let by = 5; by < 16; by += 5) { ctx.beginPath(); ctx.moveTo(x - 19, y + by); ctx.lineTo(x + 19, y + by); ctx.stroke(); }
      for (let bx = -19; bx <= 19; bx += 9.5) { ctx.beginPath(); ctx.moveTo(x + bx, y + 1); ctx.lineTo(x + bx, y + 16); ctx.stroke(); }
      // Wooden upper walls (horizontal planks)
      ctx.fillStyle = plank; ctx.fillRect(x - 19, y - 16, 38, 17);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      for (let py = -13; py < 1; py += 3) { ctx.beginPath(); ctx.moveTo(x - 19, y + py); ctx.lineTo(x + 19, y + py); ctx.stroke(); }
      // Shuttered wooden window (propped open) + door spanning both halves
      if (stage >= 2) drawBrokenWindow(ctx, x - 14, y - 12, 10, 8, stage);
      else {
        ctx.fillStyle = '#2b2119'; ctx.fillRect(x - 14, y - 12, 10, 8);
        ctx.fillStyle = stage === 1 ? '#5c4632' : '#a9743f';
        ctx.beginPath(); ctx.moveTo(x - 15, y - 12); ctx.lineTo(x - 11, y - 17); ctx.lineTo(x - 1, y - 17); ctx.lineTo(x - 3, y - 12); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = stage >= 2 ? '#14110e' : '#3a2a1e'; ctx.fillRect(x + 6, y - 9, 9, 25);
      if (stage >= 2) { ctx.fillStyle = '#16120f'; ctx.fillRect(x - 6, y - 6, 8, 9); }
      // Blue water drum by the wall
      if (stage < 2) {
        ctx.fillStyle = '#2f5d8a'; ctx.fillRect(x + 20, y + 5, 7, 11);
        ctx.fillStyle = '#4a7db0'; ctx.beginPath(); ctx.ellipse(x + 23.5, y + 5, 3.5, 1.3, 0, 0, Math.PI * 2); ctx.fill();
      }
      // Rusted GI gable roof with patches
      ctx.fillStyle = roof;
      ctx.beginPath(); ctx.moveTo(x - 25, y - 16); ctx.lineTo(x, y - 31); ctx.lineTo(x + 25, y - 16); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)';
      for (let c2 = -21; c2 <= 21; c2 += 4) { ctx.beginPath(); ctx.moveTo(x + c2, y - 16); ctx.lineTo(x + c2 * 0.15, y - 30); ctx.stroke(); }
      ctx.fillStyle = 'rgba(200,110,60,0.45)';
      ctx.beginPath(); ctx.ellipse(x - 9, y - 21, 5, 2.5, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 11, y - 19, 4, 2, 0.3, 0, Math.PI * 2); ctx.fill();
      if (stage >= 2) { ctx.fillStyle = '#1d1a16'; ctx.beginPath(); ctx.moveTo(x - 4, y - 29); ctx.lineTo(x + 10, y - 25); ctx.lineTo(x + 1, y - 19); ctx.closePath(); ctx.fill(); }

      if (stage >= 1) {
        drawCracks(ctx, x - 19, y - 16, 38, 32, stage, 65);
        drawMudOnStructure(ctx, x, y + 16, 42, stage === 1 ? 8 : 16, stage);
      }
    }
  },
  { // 10: Aeta cogon hut (Porac uplands): a low hut whose steep cogon-grass
    // roof reaches almost to the ground, over split-bamboo walls and a
    // small raised floor.
    groundOffset: 16, hpBarOffset: -40, emojiOffset: -20,
    draw(ctx, x, y, color, lost, stage = 0) {
      if (stage === 3) {
        drawGenericRubblePile(ctx, x, y + 16, 44, 20, '#5e5a4e', '#6f6340', 666);
        ctx.save();
        ctx.fillStyle = '#8c7a48';
        for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(x - 14 + i * 7, y + 9 + (i % 2) * 4, 6, 2.5, (i - 2) * 0.35, 0, Math.PI * 2); ctx.fill(); }
        ctx.strokeStyle = '#6b5a30'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x - 12, y + 14); ctx.lineTo(x + 2, y + 4); ctx.moveTo(x + 6, y + 14); ctx.lineTo(x + 16, y + 6); ctx.stroke();
        ctx.restore();
        return;
      }
      const thatch = stage >= 2 ? '#6a6250' : (stage === 1 ? '#9a8a5a' : '#b39a5c');
      const thatchD = stage >= 2 ? '#4f4a3c' : (stage === 1 ? '#7d6e44' : '#8f7a45');
      const bamboo = stage >= 2 ? '#5a5244' : (stage === 1 ? '#8a7a52' : '#b09a5e');

      // Short bamboo posts and floor
      ctx.fillStyle = '#6b5a30';
      ctx.fillRect(x - 14, y + 8, 3, 8); ctx.fillRect(x + 11, y + 8, 3, 8); ctx.fillRect(x - 1, y + 9, 3, 7);
      ctx.fillStyle = '#7d6a3c'; ctx.fillRect(x - 17, y + 6, 34, 3);
      // Split-bamboo walls (vertical slats)
      ctx.fillStyle = bamboo; ctx.fillRect(x - 15, y - 6, 30, 12);
      ctx.strokeStyle = 'rgba(60,45,20,0.35)'; ctx.lineWidth = 1;
      for (let sx = -14; sx < 15; sx += 2.5) { ctx.beginPath(); ctx.moveTo(x + sx, y - 6); ctx.lineTo(x + sx, y + 6); ctx.stroke(); }
      // Low doorway
      ctx.fillStyle = stage >= 2 ? '#14110e' : '#2a2015'; ctx.fillRect(x + 4, y - 4, 7, 10);
      if (stage >= 2) { ctx.fillStyle = '#16120f'; ctx.fillRect(x - 10, y - 4, 7, 7); }
      // Steep cogon roof reaching low, with layered thatch rows
      ctx.fillStyle = thatch;
      ctx.beginPath(); ctx.moveTo(x - 24, y + 2); ctx.lineTo(x - 4, y - 28); ctx.lineTo(x + 4, y - 28); ctx.lineTo(x + 24, y + 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = thatchD; ctx.lineWidth = 1.2;
      for (let r = 1; r <= 4; r++) {
        const t = r / 5;
        ctx.beginPath();
        ctx.moveTo(x - 24 + 20 * t, y + 2 - 30 * t);
        for (let k = 0; k <= 6; k++) { const px = x - 24 + 20 * t + (48 - 40 * t) * (k / 6); ctx.lineTo(px, y + 2 - 30 * t + (k % 2) * 1.2); }
        ctx.stroke();
      }
      // Ridge tie
      ctx.strokeStyle = '#5a4a28'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 6, y - 28); ctx.lineTo(x + 6, y - 28); ctx.stroke();
      if (stage >= 2) { ctx.fillStyle = '#1d1a16'; ctx.beginPath(); ctx.moveTo(x - 2, y - 27); ctx.lineTo(x + 12, y - 16); ctx.lineTo(x + 1, y - 14); ctx.closePath(); ctx.fill(); }

      if (stage >= 1) {
        drawCracks(ctx, x - 15, y - 6, 30, 12, stage, 66);
        drawMudOnStructure(ctx, x, y + 16, 40, stage === 1 ? 8 : 16, stage);
      }
    }
  }
];

function drawHouse(h) {
  ctx.save();
  let shakeX = h.shakeT > 0 ? Math.sin(state.time * 40) * 4 * h.shakeT : 0;
  if (h.shakeT > 0) h.shakeT -= 0.04;
  const x = h.x + shakeX, y = h.y;
  const style = HOUSE_STYLES[(h.style || 0) % HOUSE_STYLES.length];
  const stage = getDamageStage(h.hp, h.lost);

  // Soft, light-directional ground shadow (see drawGroundShadow).
  drawGroundShadow(ctx, x, y + style.groundOffset, 34, 10);

  // Structural tilt for damaged houses (stages 1 & 2)
  if (stage >= 1 && stage < 3) {
    const tiltAngle = stage === 1 ? 0.018 : 0.048;
    const tiltDir = ((h.id || 0) % 2 === 0) ? 1 : -1;
    ctx.translate(x, y + style.groundOffset);
    ctx.rotate(tiltAngle * tiltDir);
    ctx.translate(-x, -(y + style.groundOffset));
  }

  ctx.globalAlpha = stage === 3 ? 0.92 : 1;
  // Scale the sprite about its ground-contact point so it shrinks upward
  // and stays planted; debris is drawn inside the same transform so it
  // scales with the house.
  ctx.save();
  const gy = y + style.groundOffset;
  ctx.translate(x, gy); ctx.scale(HOUSE_SCALE, HOUSE_SCALE); ctx.translate(-x, -gy);
  style.draw(ctx, x, y, h.color, h.lost, stage);
  if (stage >= 2) {
    drawStructureDebris(ctx, x, y + style.groundOffset, stage, (h.id || 1) * 997 + 31);
  }
  ctx.restore();

  // HP bar is NOT scaled — it stays a consistent, readable size across the
  // town — but its height above the house tracks the smaller sprite.
  if (!h.lost) {
    queueHPBar(x, gy + (style.hpBarOffset - style.groundOffset) * HOUSE_SCALE, 40, 7, h.hp, null, 'h' + h.id);
  }
  ctx.restore();
}

/* ---------------- TOOL EFFECT VISUALS ----------------
   Every tool draws a footprint on the ground showing exactly what it is
   doing to the flow, so the mechanics are readable without a tutorial:

     shovel — the dug cut (a dark trench laid across the channel) plus a
              curved arrow pointing the way the mud is being pushed; the
              whole thing lights up amber while mud is actually running
              through it.
     dike   — a heavy embankment ring; it both blocks and nudges, so it
              gets the arrow too, at a shorter length.
     sandbag— a shield ring showing the area it is soaking damage for.
     tree   — a soft green root-hold ring (permanent, so drawn faintly at
              all times and brightly while the flow is in it).

   Purely cosmetic: nothing in here is read back by the simulation. */
// Renders a municipality's extra local-landmark art (municipal hall, museum,
// university, wet market, town signs) as scenery — each anchored at its ground
// base with a soft shadow, aspect preserved from the source image. Purely
// decorative: no damage or goal logic, so gameplay balance is unchanged.
// Positions/sizes live in TOWN_MAPS[...].props and are easy to tweak.
/* Landmark props are full structures: they take lahar damage, show an HP
   bar, and pass through the same four visual states as every other
   building (Normal -> Damaged -> Heavily Damaged -> Destroyed).

   Because these are photographic sprites rather than procedural drawings,
   the stages are expressed by treating the image itself: it tilts and
   picks up soot and cracks as it fails, sinks into the mud, and finally
   collapses into a rubble pile with a smoking ruin where it stood. */
function drawTownProps(context) {
  if (!state.props || !state.props.length) return;

  for (const p of state.props) {
    const img = p.img;
    if (!img || !img.complete || !img.naturalHeight) continue;
    const w = p.w;
    const h = w * (img.naturalHeight / img.naturalWidth);
    const stage = getDamageStage(p.hp, p.lost);

    // Impact shudder, shared with the other structures.
    let shakeX = 0;
    if (p.shakeT > 0) { shakeX = Math.sin(state.time * 40) * 4 * p.shakeT; p.shakeT -= 0.04; }
    const x = p.x + shakeX;

    context.save();
    drawGroundShadow(context, x, p.y + 2, w * 0.44 * (stage === 3 ? 0.75 : 1), Math.max(5, w * 0.11));

    if (stage === 3) {
      // ---- Destroyed: nothing left standing but rubble and smoke.
      drawGenericRubblePile(context, x, p.y, w * 0.52, h * 0.26, '#6a6055', '#5a5148', 400 + p.id * 37);
      drawStructureDebris(context, x, p.y, 3, 700 + p.id * 91);
      // Lingering smoke from the ruin.
      for (let i = 0; i < 3; i++) {
        const t = (ambientTime * 0.35 + i / 3) % 1;
        context.globalAlpha = (1 - t) * 0.20;
        context.fillStyle = '#6b6b6b';
        context.beginPath();
        context.arc(x + Math.sin(t * 4 + i) * 7, p.y - 12 - t * 44, 7 + t * 13, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    } else {
      // ---- Standing: tilt further and sink lower as it fails.
      const tilt = stage === 1 ? 0.022 : stage === 2 ? 0.055 : 0;
      const sink = stage === 2 ? 4 : 0;
      if (tilt) {
        context.translate(x, p.y);
        context.rotate(tilt);
        context.translate(-x, -p.y);
      }
      context.drawImage(img, x - w / 2, p.y - h + sink, w, h);

      if (stage >= 1) {
        // Soot/mud wash over the facade, heavier at stage 2. Clipped to the
        // sprite's box so it stains the building, not the grass behind it.
        drawAshStain(context, x, p.y - h * 0.48 + sink, w * 0.94, h * 0.48,
                     stage === 1 ? 0.18 : 0.36, 311 + p.id * 53);
        drawCracks(context, x - w * 0.34, p.y - h * 0.72 + sink, w * 0.68, h * 0.6, stage, 311 + p.id * 53);
      }
      if (stage === 2) {
        // Mud piled against the base and a little rubble shed at the foot.
        context.globalAlpha = 0.55;
        context.fillStyle = '#4a4034';
        context.beginPath();
        context.ellipse(x, p.y, w * 0.42, Math.max(4, h * 0.08), 0, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        drawStructureDebris(context, x, p.y, 2, 700 + p.id * 91);
      }
    }
    context.restore();

    // ---- HP bar above the building (hidden once it's rubble).
    if (stage !== 3) {
      queueHPBar(x, p.y - h - 12, Math.max(34, w * 0.6), 7, p.hp, landmarkColor('prop', p.id), 'p' + p.id);
    }
  }
}

/* =====================================================================
   TOOL IMPACT SYSTEM  —  "what is this tool actually doing for me?"
   ---------------------------------------------------------------------
   Every deployed tool keeps a running, honest record of the work it has
   done, in the same unit the player already understands: structure HP.

     item.saved    HP of damage this tool has soaked for nearby buildings
                   (exact — taken straight from applyBarrierShield's own
                   arithmetic, not an estimate)
     item.heldT    seconds it has held a channel fully capped (dikes)
     item.steerT   seconds it has actively steered a flow (shovels/dikes)
     item.slowT    seconds it has been dragging on a flow (trees)
     item.pushPx   how far it has physically moved the channel sideways

   Those numbers are surfaced three ways, so the value of a tool is
   visible in the moment AND after the fact:

     1. a floating "+N" that rises off a tool the instant it takes a hit
        for a building (batched to ~0.7s so it never becomes a firehose);
     2. a live guard link — a soft arc drawn from the tool to each
        building it is currently covering, which flashes on every hit, so
        "this sandbag is protecting those two houses" is unambiguous;
     3. an end-of-round Defense Report listing every tool type deployed,
        what it cost, and what it saved — including which single tool was
        the most valuable of the run.

   Nothing here feeds back into the simulation: damage, wear, budget and
   flow behaviour are all computed exactly as before. This module only
   OBSERVES and reports. ===================================================================== */

// Floating impact numbers. Stateless-style like the ripples: each entry
// stores only its birth moment on the ambient clock, so its position and
// fade are pure functions of age and no per-frame bookkeeping is needed.
const IMPACT_TEXT_LIFE = 1.5;
function spawnImpactText(x, y, text, color) {
  state.impactTexts.push({ x, y, text, color, startTime: ambientTime });
}

function drawImpactTexts(context) {
  if (!state.impactTexts || !state.impactTexts.length) return;
  state.impactTexts = state.impactTexts.filter(t => ambientTime - t.startTime < IMPACT_TEXT_LIFE);
  context.save();
  context.textAlign = 'center';
  state.impactTexts.forEach(t => {
    const age = (ambientTime - t.startTime) / IMPACT_TEXT_LIFE;
    const y = t.y - 10 - age * 26;
    const alpha = age < 0.15 ? age / 0.15 : Math.max(0, 1 - (age - 0.15) / 0.85);
    context.globalAlpha = alpha;
    context.font = "bold 15px Nunito, 'Baloo 2', sans-serif";
    context.lineWidth = 3.5; context.strokeStyle = 'rgba(12,20,14,0.75)';
    context.strokeText(t.text, t.x, y);
    context.fillStyle = t.color;
    context.fillText(t.text, t.x, y);
  });
  context.restore();
}

// Batches a tool's absorbed damage into readable chunks instead of
// emitting a number every frame.
function creditToolSave(item, amount, x, y) {
  if (!(amount > 0)) return;
  item.saved = (item.saved || 0) + amount;
  item.guardX = x; item.guardY = y; item.guardT = ambientTime;
  item.savePending = (item.savePending || 0) + amount;
  if (item.savePending >= 3 && ambientTime - (item.saveTextT || 0) > 0.7) {
    spawnImpactText(item.x, item.y - 18, `+${Math.round(item.savePending)}`, '#8ef2a8');
    item.savePending = 0; item.saveTextT = ambientTime;
  }
}

// Live guard links: while a shield tool is covering structures, a soft arc
// connects it to each one, brightening the moment it takes a hit for them.
// This is the clearest possible statement of "this is what I am for".
function drawGuardLinks(context) {
  if (!state.placedItems.length) return;
  const targets = [];
  state.houses.forEach(h => { if (!h.lost) targets.push(h); });
  [state.church, state.school, state.robot, state.monument].forEach(b => { if (b && !b.lost) targets.push(b); });
  if (!targets.length) return;

  context.save();
  context.lineCap = 'round';
  state.placedItems.forEach(item => {
    if (item.dead) return;
    const def = TOOL_DEFS[item.type];
    if (!def || !def.shield) return;
    const r = def.shieldRadius || def.radius;
    const hpFrac = item.hp === Infinity ? 1 : Math.max(0, item.hp / 100);
    const growFrac = item.type === 'tree' ? treeGrow(item) : 1;
    const power = hpFrac * growFrac;
    if (power < 0.05) return;
    // Flash briefly whenever this tool has just soaked a hit.
    const hit = Math.max(0, 1 - (ambientTime - (item.guardT || -99)) / 0.5);

    targets.forEach(b => {
      const d = Math.hypot(b.x - item.x, b.y - item.y);
      if (d >= r || d < 1) return;
      const closeness = 1 - d / r;
      const alpha = (0.16 + 0.3 * closeness * power) + hit * 0.4 * closeness;
      context.globalAlpha = Math.min(0.7, alpha);
      context.strokeStyle = item.type === 'tree' ? '#8fe08a' : '#9fd8ff';
      context.lineWidth = 1.2 + closeness * 1.6 + hit * 1.2;
      context.setLineDash([5, 6]);
      context.lineDashOffset = -ambientTime * 14;
      // Bow the link so several links from one tool stay distinguishable
      const mx = (item.x + b.x) / 2, my = (item.y + b.y) / 2;
      const nx = -(b.y - item.y) / d, ny = (b.x - item.x) / d;
      context.beginPath();
      context.moveTo(item.x, item.y);
      context.quadraticCurveTo(mx + nx * 9, my + ny * 9, b.x, b.y + 4);
      context.stroke();
      // A small shield pip on the building end while it is covered
      context.setLineDash([]);
      context.globalAlpha = Math.min(0.75, 0.22 + hit * 0.6) * closeness;
      context.fillStyle = item.type === 'tree' ? '#8fe08a' : '#9fd8ff';
      context.beginPath();
      context.moveTo(b.x, b.y - 2); context.lineTo(b.x + 4, b.y + 1);
      context.lineTo(b.x, b.y + 7); context.lineTo(b.x - 4, b.y + 1);
      context.closePath(); context.fill();
    });
  });
  context.setLineDash([]);
  context.restore();
}

// Ghost of the channel's ORIGINAL course beside a diversion tool: the mud
// used to run along the dashed line, and now runs where it actually is.
// Nothing else in the game states the shovel's effect this plainly.
function drawDiversionGhost(context) {
  if (!basePaths.length) return;
  const shown = [];
  state.placedItems.forEach(item => {
    if (item.dead) return;
    const def = TOOL_DEFS[item.type];
    if (!def || !def.deflectStrength) return;
    const info = nearestFlowInfo(item.x, item.y);
    if (!info || info.isBranch || info.dist > def.deflectRange) return;
    if (shown.includes(info.idx)) return;
    shown.push(info.idx);
    const base = basePaths[info.idx], live = channelPaths[info.idx];
    if (!base || !live || base.length !== live.length) return;
    // Only draw the stretch that actually moved, around this tool.
    let maxShift = 0;
    const seg = [];
    for (let i = 0; i < base.length; i++) {
      const shift = Math.hypot(live[i].x - base[i].x, live[i].y - base[i].y);
      if (shift > 1.5) { seg.push(i); maxShift = Math.max(maxShift, shift); }
    }
    if (seg.length < 2 || maxShift < 4) return;
    item.pushPx = Math.max(item.pushPx || 0, maxShift);

    context.save();
    context.globalAlpha = 0.42;
    context.strokeStyle = '#f0c98a';
    context.lineWidth = 2;
    context.setLineDash([7, 6]);
    context.beginPath();
    seg.forEach((i, k) => { const p = base[i]; k ? context.lineTo(p.x, p.y) : context.moveTo(p.x, p.y); });
    context.stroke();
    context.setLineDash([]);
    // Short "moved this far" ties between old and new course
    context.globalAlpha = 0.3;
    context.lineWidth = 1.2;
    for (let k = 0; k < seg.length; k += Math.max(1, Math.floor(seg.length / 4))) {
      const i = seg[k];
      context.beginPath();
      context.moveTo(base[i].x, base[i].y); context.lineTo(live[i].x, live[i].y);
      context.stroke();
    }
    context.restore();
  });
}

// Per-tool impact badge: a compact tally pinned under a tool once it has
// actually done measurable work, so its worth is legible at a glance
// without opening any menu.
function drawImpactBadges(context) {
  context.save();
  context.textAlign = 'center';
  context.font = "bold 10px Nunito, 'Baloo 2', sans-serif";
  state.placedItems.forEach(item => {
    if (item.dead || item.type === 'shovel') return;
    const saved = Math.round(item.saved || 0);
    if (saved < 1) return;
    /* Canvas cannot render inline SVG, and an emoji glyph here would be
       drawn by the system font — the one thing we are removing. The shield
       is stroked directly below instead, so the label is just the number. */
    const label = `${saved}`;
    // Room for the drawn shield plus the number.
    const w = context.measureText(label).width + 24;
    const by = item.y + 22;
    context.globalAlpha = 0.85;
    context.fillStyle = 'rgba(16,28,20,0.72)';
    roundRectCtx(context, item.x - w / 2, by - 8, w, 14, 7);
    context.fill();

    // A small shield, stroked with canvas paths rather than a font glyph.
    const sx = item.x - w / 2 + 8, sy = by - 1, sw = 4.2, sh = 5.4;
    context.fillStyle = '#8ef2a8';
    context.beginPath();
    context.moveTo(sx, sy - sh);
    context.lineTo(sx + sw, sy - sh + 1.6);
    context.lineTo(sx + sw, sy);
    context.quadraticCurveTo(sx + sw, sy + sh * 0.7, sx, sy + sh);
    context.quadraticCurveTo(sx - sw, sy + sh * 0.7, sx - sw, sy);
    context.lineTo(sx - sw, sy - sh + 1.6);
    context.closePath();
    context.fill();

    context.fillStyle = '#8ef2a8';
    context.fillText(label, item.x + 6, by + 2);
  });
  context.restore();
}

function drawToolEffects(context) {
  if (!state.placedItems.length) return;
  context.save();

  state.placedItems.forEach(item => {
    if (item.dead) return;
    const def = TOOL_DEFS[item.type];
    if (!def) return;

    // Sandbags: a heap of mud banks up against the bag as the flow presses on
    // it (item.bank), the clearest read that it's holding the lahar back.
    if (item.type === 'sandbag') {
      const bank = item.bank || 0;
      if (bank > 0.04) {
        const intensity = state.laharVolume / 100;
        const outer = lerpColor('#6f685e', '#2c2318', intensity);
        const mid   = lerpColor('#8a8276', '#463726', intensity);
        const rx = 15 + bank * 17, ry = 8 + bank * 9;
        context.globalAlpha = 0.5 + 0.32 * bank;
        context.fillStyle = outer;
        context.beginPath(); context.ellipse(item.x, item.y - 2, rx, ry, 0, 0, Math.PI * 2); context.fill();
        context.globalAlpha = 0.85;
        context.fillStyle = mid;
        context.beginPath(); context.ellipse(item.x, item.y - 4, rx * 0.68, ry * 0.68, 0, 0, Math.PI * 2); context.fill();
        context.globalAlpha = 1;
      }
      return;
    }

    // Diversion tools only: a static dug cut across the flow plus a small
    // muted arrow showing which way the mud is pushed. Everything is fixed
    // (no pulse, no glow) — it just marks the tool's action on the ground.
    if (!def.deflectStrength || item.divertNX === undefined) return;

    const hpFrac = item.hp === Infinity ? 1 : Math.max(0, item.hp / 100);
    const dx = item.divertNX, dy = item.divertNY;
    const tx = -dy, ty = dx;               // along the channel

    // The cut itself: a short trench of turned earth laid across the flow.
    const cutLen = 22 * (0.55 + 0.45 * hpFrac);
    context.globalAlpha = 0.5 * (0.4 + 0.6 * hpFrac);
    context.strokeStyle = '#4a3218';
    context.lineWidth = 6;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(item.x - tx * cutLen, item.y - ty * cutLen);
    context.lineTo(item.x + tx * cutLen, item.y + ty * cutLen);
    context.stroke();
    context.globalAlpha = 0.45;
    context.strokeStyle = '#8a6a3c';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(item.x - tx * cutLen, item.y - ty * cutLen - 2);
    context.lineTo(item.x + tx * cutLen, item.y + ty * cutLen - 2);
    context.stroke();

    // Muted, static direction arrow.
    const aLen = (item.type === 'dam' ? 22 : 32) * (0.5 + 0.5 * hpFrac);
    const ax = item.x + dx * aLen, ay = item.y + dy * aLen;
    context.globalAlpha = 0.5;
    context.strokeStyle = '#cbb78f';
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(item.x + dx * 7, item.y + dy * 7);
    context.lineTo(ax, ay);
    context.stroke();
    context.beginPath();
    context.moveTo(ax + dx * 5, ay + dy * 5);
    context.lineTo(ax - dx * 3 + tx * 5, ay - dy * 3 + ty * 5);
    context.lineTo(ax - dx * 3 - tx * 5, ay - dy * 3 - ty * 5);
    context.closePath();
    context.fillStyle = '#cbb78f';
    context.fill();
  });

  context.globalAlpha = 1;
  context.restore();
}

/* ---- Tool sprites ----
   Each tool is drawn as a recognisable piece of real flood-defence kit
   rather than a generic marker, in the same flat, warm 2D style as the
   houses: solid shapes, one light direction (upper-left), a dark contact
   shadow, and hand-drawn texture lines instead of gradients. `wear`
   (0..1, 1 = pristine) lets a barrier visibly degrade — sagging, split
   seams, spalled concrete — before it finally fails. */
function drawItemShape(context, type, wear = 1, grow = 1) {
  const w = Math.max(0, Math.min(1, wear));
  switch (type) {
    case 'sandbag': {
      // A stacked wall of individual burlap sacks (3 + 2 + 1), tied at the
      // neck, with woven texture and a wet mud line where the flow reaches.
      const rows = [
        { n: 3, y: 8, s: 1.0 },
        { n: 2, y: -1, s: 0.94 },
        { n: 1, y: -9, s: 0.88 }
      ];
      // Contact shadow
      context.fillStyle = 'rgba(30,24,16,0.28)';
      context.beginPath(); context.ellipse(0, 14, 26, 6, 0, 0, Math.PI * 2); context.fill();

      rows.forEach((row, ri) => {
        // A worn wall loses its top course and slumps
        if (w < 0.34 && ri === 2) return;
        for (let i = 0; i < row.n; i++) {
          const bw = 11 * row.s, bh = 7.5 * row.s;
          const bx = (i - (row.n - 1) / 2) * (bw * 1.85);
          const sag = (1 - w) * (ri + 1) * 1.6;
          const by = row.y + sag + (i % 2 ? 0.6 : 0);
          const tilt = (1 - w) * ((i % 2 ? 1 : -1) * 0.16) + (i - (row.n - 1) / 2) * 0.05;
          context.save();
          context.translate(bx, by);
          context.rotate(tilt);
          // Sack body
          context.fillStyle = ri === 2 ? '#e0bd7c' : (ri === 1 ? '#d9b56b' : '#c9a45c');
          context.strokeStyle = '#8f6d33'; context.lineWidth = 1.4;
          context.beginPath();
          context.moveTo(-bw, 0);
          context.bezierCurveTo(-bw, -bh, bw, -bh, bw, 0);
          context.bezierCurveTo(bw, bh, -bw, bh, -bw, 0);
          context.closePath();
          context.fill(); context.stroke();
          // Burlap weave
          context.strokeStyle = 'rgba(120,88,36,0.35)'; context.lineWidth = 0.7;
          for (let k = -2; k <= 2; k++) {
            context.beginPath();
            context.moveTo(k * bw * 0.4, -bh * 0.72); context.lineTo(k * bw * 0.4, bh * 0.72);
            context.stroke();
          }
          context.beginPath(); context.moveTo(-bw * 0.85, 0); context.lineTo(bw * 0.85, 0); context.stroke();
          // Tied neck
          context.strokeStyle = '#7d5a28'; context.lineWidth = 1.6;
          context.beginPath(); context.moveTo(bw * 0.55, -bh * 0.5); context.lineTo(bw * 0.95, -bh * 0.15); context.stroke();
          // Top-left light
          context.fillStyle = 'rgba(255,244,214,0.35)';
          context.beginPath(); context.ellipse(-bw * 0.32, -bh * 0.36, bw * 0.36, bh * 0.3, -0.3, 0, Math.PI * 2); context.fill();
          // Split seam on a failing bag
          if (w < 0.5 && i === 0) {
            context.strokeStyle = 'rgba(60,40,14,0.75)'; context.lineWidth = 1.2;
            context.beginPath(); context.moveTo(-bw * 0.5, -bh * 0.2); context.lineTo(0, bh * 0.35); context.stroke();
          }
          context.restore();
        }
      });
      // Damp mud line along the base
      context.fillStyle = 'rgba(74,58,40,0.4)';
      context.beginPath(); context.ellipse(0, 13, 24, 4, 0, 0, Math.PI * 2); context.fill();
      break;
    }

    case 'shovel': {
      // Spade standing in a heap of freshly dug earth (only ever drawn in
      // the placement preview — the tool itself is consumed on use).
      context.fillStyle = '#6b4a28';
      context.beginPath(); context.ellipse(2, 14, 17, 6, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = '#8a6136';
      context.beginPath(); context.ellipse(-1, 12, 12, 4.5, 0, 0, Math.PI * 2); context.fill();
      context.save();
      context.rotate(-0.18);
      // Shaft with grain
      context.fillStyle = '#a9784a'; context.strokeStyle = '#6f4a26'; context.lineWidth = 1.2;
      context.beginPath(); context.rect(-2.5, -24, 5, 28); context.fill(); context.stroke();
      context.strokeStyle = 'rgba(90,58,26,0.5)'; context.lineWidth = 0.6;
      context.beginPath(); context.moveTo(-0.6, -22); context.lineTo(-0.6, 2); context.stroke();
      // D-grip handle
      context.strokeStyle = '#6f4a26'; context.lineWidth = 2.4;
      context.beginPath(); context.moveTo(-5, -24); context.quadraticCurveTo(0, -32, 5, -24); context.stroke();
      context.strokeStyle = '#a9784a'; context.lineWidth = 1.2;
      context.beginPath(); context.moveTo(-3.5, -26); context.lineTo(3.5, -26); context.stroke();
      // Steel blade
      context.fillStyle = '#b9c2c9'; context.strokeStyle = '#6d777f'; context.lineWidth = 1.4;
      context.beginPath();
      context.moveTo(-8, 3); context.lineTo(8, 3);
      context.quadraticCurveTo(9, 14, 0, 18);
      context.quadraticCurveTo(-9, 14, -8, 3);
      context.closePath(); context.fill(); context.stroke();
      context.fillStyle = 'rgba(255,255,255,0.5)';
      context.beginPath(); context.ellipse(-3, 8, 2.4, 5, -0.25, 0, Math.PI * 2); context.fill();
      context.fillStyle = 'rgba(90,64,32,0.55)';   // caked soil on the blade tip
      context.beginPath(); context.ellipse(1, 15, 6, 3, 0, 0, Math.PI * 2); context.fill();
      context.restore();
      break;
    }

    case 'tree': {
      // Narra/acacia sapling that fills out into a broad shade canopy as it
      // matures. `grow` 0..1 drives trunk height and canopy spread.
      const g = Math.max(0.18, Math.min(1, grow));
      context.fillStyle = 'rgba(30,40,20,0.26)';
      context.beginPath(); context.ellipse(2, 17, 15 * g + 4, 5, 0, 0, Math.PI * 2); context.fill();
      // Root flare + tapered trunk
      const th = 12 + 10 * g;
      context.fillStyle = '#7a5230';
      context.beginPath();
      context.moveTo(-4.5 - g, 18);
      context.quadraticCurveTo(-2, 8, -1.8, 18 - th);
      context.lineTo(1.8, 18 - th);
      context.quadraticCurveTo(2, 8, 4.5 + g, 18);
      context.closePath(); context.fill();
      context.strokeStyle = 'rgba(48,30,14,0.45)'; context.lineWidth = 0.8;
      context.beginPath(); context.moveTo(-0.8, 16); context.lineTo(-0.8, 18 - th * 0.9); context.stroke();
      // Branches
      context.strokeStyle = '#6b4526'; context.lineWidth = 2 * g + 0.6; context.lineCap = 'round';
      context.beginPath();
      context.moveTo(0, 18 - th * 0.72); context.lineTo(-7 * g, 18 - th * 1.05);
      context.moveTo(0, 18 - th * 0.82); context.lineTo(7 * g, 18 - th * 1.1);
      context.stroke();
      // Canopy: overlapping leaf clusters, lit from the upper left
      const cy = 18 - th - 5 * g, R = 13 * g + 3;
      const blobs = [
        [-R * 0.72, cy + R * 0.30, R * 0.66, '#2f6b34'],
        [ R * 0.74, cy + R * 0.26, R * 0.64, '#2f6b34'],
        [-R * 0.16, cy + R * 0.52, R * 0.72, '#37793c'],
        [ R * 0.30, cy - R * 0.22, R * 0.74, '#3f8a46'],
        [-R * 0.34, cy - R * 0.34, R * 0.78, '#4d9a55'],
        [-R * 0.62, cy - R * 0.60, R * 0.46, '#63b768']
      ];
      blobs.forEach(([bx, by, br, col]) => {
        context.fillStyle = col;
        context.beginPath(); context.arc(bx, by, br, 0, Math.PI * 2); context.fill();
      });
      // Leaf scallops around the rim so the canopy doesn't read as circles
      context.fillStyle = '#4d9a55';
      for (let a = 0; a < 9; a++) {
        const ang = (a / 9) * Math.PI * 2 - 0.4;
        context.beginPath();
        context.ellipse(Math.cos(ang) * R * 0.92, cy + Math.sin(ang) * R * 0.62, R * 0.26, R * 0.18, ang, 0, Math.PI * 2);
        context.fill();
      }
      context.fillStyle = 'rgba(190,232,150,0.42)';
      context.beginPath(); context.ellipse(-R * 0.42, cy - R * 0.5, R * 0.42, R * 0.28, -0.4, 0, Math.PI * 2); context.fill();
      // A sapling still wears its nursery stake
      if (g < 0.75) {
        context.strokeStyle = '#8a7a52'; context.lineWidth = 1.4;
        context.beginPath(); context.moveTo(6, 18); context.lineTo(5, 18 - th - 2); context.stroke();
        context.strokeStyle = '#c05a3a'; context.lineWidth = 1.2;
        context.beginPath(); context.moveTo(1, 18 - th * 0.6); context.lineTo(6, 18 - th * 0.6); context.stroke();
      }
      break;
    }

    case 'dam': {
      // Concrete flood dike: a battered (sloping) wall on a riprap toe,
      // with buttress ribs, a capping beam and weep holes — the sabo-dam
      // style embankment built across Pinatubo's channels.
      context.fillStyle = 'rgba(30,26,18,0.3)';
      context.beginPath(); context.ellipse(0, 17, 32, 6, 0, 0, Math.PI * 2); context.fill();
      // Riprap boulder toe
      const rr = mulberry32(4242);
      for (let i = 0; i < 9; i++) {
        const bx = -30 + i * 7.4 + (rr() - 0.5) * 3, by = 13 + (rr() - 0.5) * 3;
        const bs = 3.4 + rr() * 2.4;
        context.fillStyle = i % 2 ? '#7d766c' : '#918a7e';
        context.strokeStyle = '#4f4a42'; context.lineWidth = 0.9;
        context.beginPath(); context.ellipse(bx, by, bs, bs * 0.75, rr() * 3, 0, Math.PI * 2);
        context.fill(); context.stroke();
      }
      // Battered wall face
      context.fillStyle = '#c9c2b6'; context.strokeStyle = '#6f695e'; context.lineWidth = 1.8;
      context.beginPath();
      context.moveTo(-30, 14); context.lineTo(-25, -12); context.lineTo(25, -12); context.lineTo(30, 14);
      context.closePath(); context.fill(); context.stroke();
      // Form-board courses
      context.strokeStyle = 'rgba(90,84,74,0.35)'; context.lineWidth = 0.9;
      for (let ly = -6; ly < 14; ly += 6) {
        const inset = (14 - ly) / 26 * 5;
        context.beginPath(); context.moveTo(-30 + inset, ly); context.lineTo(30 - inset, ly); context.stroke();
      }
      // Buttress ribs
      context.fillStyle = '#a9a196';
      [-17, 0, 17].forEach(bx => {
        context.beginPath();
        context.moveTo(bx - 4, 14); context.lineTo(bx - 3, -12); context.lineTo(bx + 3, -12); context.lineTo(bx + 4, 14);
        context.closePath(); context.fill();
      });
      // Weep holes
      context.fillStyle = '#4a453d';
      [-22, -8, 8, 22].forEach(hx => { context.beginPath(); context.ellipse(hx, 7, 1.8, 1.4, 0, 0, Math.PI * 2); context.fill(); });
      // Capping beam
      context.fillStyle = '#e3ded2'; context.strokeStyle = '#6f695e'; context.lineWidth = 1.4;
      context.beginPath(); context.rect(-28, -17, 56, 6); context.fill(); context.stroke();
      context.fillStyle = 'rgba(255,255,255,0.5)'; context.fillRect(-27, -16.2, 54, 1.4);
      // Hazard chevrons on the cap
      context.fillStyle = '#e0a531';
      for (let cx2 = -25; cx2 < 25; cx2 += 9) context.fillRect(cx2, -15.5, 4.5, 3.2);
      // Spalling and a growing breach crack as it wears
      if (w < 0.8) {
        context.strokeStyle = 'rgba(50,44,34,0.75)'; context.lineWidth = 1 + (1 - w) * 1.8;
        context.beginPath();
        context.moveTo(6, -12);
        context.lineTo(3 - (1 - w) * 4, 0);
        context.lineTo(9 + (1 - w) * 5, 14);
        context.stroke();
        if (w < 0.45) {
          context.fillStyle = '#4a453d';
          context.beginPath();
          context.moveTo(2, -12); context.lineTo(13, -12); context.lineTo(10, 2); context.lineTo(4, 1);
          context.closePath(); context.fill();
        }
      }
      break;
    }
  }
}

// Draws a premium rounded-pill HP bar with gradient fill + shine highlight.
// cx/cy is the CENTER-TOP anchor. w=full bar width, h=bar height, hp=0..100.
/* Health bars are QUEUED rather than drawn immediately.

   Each structure used to paint its own bar inside its draw call, so any
   building drawn later (houses and props come after the church, school,
   robot and monument) could paint straight over it — bars vanished behind
   neighbouring rooftops. Queuing them and flushing once, after every
   structure is on screen, guarantees each bar sits on top of the scene and
   stays readable. */
let hpBarQueue = [];
/* Bars are hidden until a structure is actually hurt.
   At full health they told the player nothing — every bar read 100% for the
   whole opening of a wave, cluttering the town and drawing the eye away
   from the flow. A bar appearing now MEANS something: the lahar has reached
   that building. Gated in one place so every structure obeys it. */
const HP_BAR_FADE = 0.45;        // seconds to ease in, so it never pops
const hpBarShown = Object.create(null);   // key -> ambientTime it first showed
function queueHPBar(cx, topY, w, h, hp, accent, key) {
  if (hp >= 99.95) return;       // untouched: no bar
  let alpha = 1;
  if (key) {
    // Stamp the moment this bar first appeared, then fade from that stamp.
    // Uses ambientTime, which already advances every frame, rather than a
    // per-frame delta that would need threading through the draw calls.
    if (hpBarShown[key] === undefined) hpBarShown[key] = ambientTime;
    alpha = Math.min(1, Math.max(0, (ambientTime - hpBarShown[key]) / HP_BAR_FADE));
  }
  hpBarQueue.push({ cx, topY, w, h, hp, accent, alpha });
}
function flushHPBars(context) {
  for (const b of hpBarQueue) {
    const a = b.alpha === undefined ? 1 : b.alpha;
    if (a >= 0.999) {
      drawHPBar(context, b.cx, b.topY, b.w, b.h, b.hp, b.accent);
    } else {
      context.save();
      context.globalAlpha = a;
      drawHPBar(context, b.cx, b.topY, b.w, b.h, b.hp, b.accent);
      context.restore();
    }
  }
  hpBarQueue.length = 0;
}

/* `accent` is a landmark's identity colour (see LANDMARK_COLORS). When it
   is given, the bar is drawn in that colour so it matches the structure's
   dot in the goal panel. Health is then carried by two other cues instead
   of the fill hue:
     - the length of the fill, as before;
     - the EMPTY part of the track reddening as damage mounts, so a badly
       hurt landmark still shouts even though its fill stays its own colour.
   The track is also outlined in the accent, so the identity is readable
   even when the bar is almost empty and the fill is a sliver.
   Houses pass no accent and keep the original green/amber/red bar. */
function drawHPBar(context, cx, topY, w, h, hp, accent) {
  const x = cx - w / 2;
  const r = h / 2;
  // Shadow track
  context.fillStyle = 'rgba(0,0,0,0.38)';
  roundRectCtx(context, x + 1, topY + 1, w, h, r); context.fill();
  // Track background — reddens with damage on accented (landmark) bars
  const dmg = Math.max(0, Math.min(1, 1 - hp / 100));
  context.fillStyle = (accent && dmg > 0.03)
    ? `rgba(178,26,26,${0.3 + 0.55 * dmg})`
    : 'rgba(255,255,255,0.2)';
  roundRectCtx(context, x, topY, w, h, r); context.fill();
  // Colored fill
  const fillW = Math.max(0, w * (hp / 100));
  if (fillW > 1) {
    const hiColor = accent ? lerpColor(accent, '#ffffff', 0.32)
                           : (hp > 50 ? '#22c55e' : (hp > 20 ? '#fbbf24' : '#ef4444'));
    const loColor = accent ? lerpColor(accent, '#0b1220', 0.28)
                           : (hp > 50 ? '#15803d' : (hp > 20 ? '#d97706' : '#b91c1c'));
    const fillGrad = context.createLinearGradient(x, topY, x, topY + h);
    fillGrad.addColorStop(0, hiColor);
    fillGrad.addColorStop(1, loColor);
    context.fillStyle = fillGrad;
    roundRectCtx(context, x, topY, fillW, h, r); context.fill();
    // Shine
    context.fillStyle = 'rgba(255,255,255,0.28)';
    roundRectCtx(context, x, topY, fillW, Math.ceil(h * 0.48), r); context.fill();
  }
  // Identity outline — keeps the colour legible at any health level
  if (accent) {
    context.strokeStyle = accent;
    context.lineWidth = 1.4;
    roundRectCtx(context, x, topY, w, h, r); context.stroke();
  }
}

/* ---- Falling money bag collectibles — burlap sacks that drift down
   the scene. Tapping one earns a peso bonus. Each tier has its own
   material: ₱50 = plain burlap, ₱100 = worn leather-brown, ₱200 = rich
   gold-trimmed sack. The bag sways gently and bobs as it falls. ---- */
function drawFallingSuns(context) {
  if (!state.fallingSuns || state.fallingSuns.length === 0) return;
  context.save();

  state.fallingSuns.forEach(s => {
    // Fade in during first 0.4 s, fade out during last 22% of life
    const lifeRatio = s.age / s.maxAge;
    let alpha = Math.min(1, s.age / 0.4) * Math.min(1, (1 - lifeRatio) / 0.22);
    if (s.popT > 0) alpha = s.popT; // pop-fade on collection
    if (alpha <= 0.01) return;

    const pulse = 1 + Math.sin(ambientTime * 3.2 + s.pulsePhase) * 0.05;
    const r = (s.value === 200 ? 17 : s.value === 100 ? 14 : 12) * pulse;
    const sway = Math.sin(ambientTime * 2.4 + s.pulsePhase) * 3;

    // Tier palettes
    let glowColor, bagLight, bagMid, bagDark, tieColor, textColor;
    if (s.value === 200) {
      glowColor = 'rgba(250,204,21,0.55)';
      [bagLight, bagMid, bagDark] = ['#f3d98b', '#c99a3f', '#8a6420'];
      tieColor = '#7a4f14';
      textColor = '#4a2e0a';
    } else if (s.value === 100) {
      glowColor = 'rgba(180,130,60,0.45)';
      [bagLight, bagMid, bagDark] = ['#c9a06a', '#a4753f', '#6e4c25'];
      tieColor = '#4a3218';
      textColor = '#2e1c0a';
    } else {
      glowColor = 'rgba(200,170,120,0.4)';
      [bagLight, bagMid, bagDark] = ['#e2c99a', '#b9955f', '#8a6c3e'];
      tieColor = '#5c4322';
      textColor = '#3a2712';
    }

    const cx = s.x + sway, cy = s.y;
    context.globalAlpha = alpha;

    // Soft glow halo behind the bag
    const glow = context.createRadialGradient(cx, cy, 0, cx, cy, r * 2.4);
    glow.addColorStop(0, glowColor);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = glow;
    context.beginPath(); context.arc(cx, cy, r * 2.4, 0, Math.PI * 2); context.fill();

    // Drop shadow under the bag — soft gradient instead of a flat fill,
    // so it reads as ground contact rather than a hard ellipse cutout
    const shadowGrad = context.createRadialGradient(cx, cy + r * 0.95, 0, cx, cy + r * 0.95, r * 0.6);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0.26)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = shadowGrad;
    context.beginPath();
    context.ellipse(cx, cy + r * 0.95, r * 0.55, r * 0.16, 0, 0, Math.PI * 2);
    context.fill();

    const w = r * 1.55, h = r * 1.75;

    if (moneyBagImg.complete && moneyBagImg.naturalHeight !== 0) {
      // Use the provided artwork, sized to preserve its own aspect ratio
      // (previously it was forced into a fixed w×h box, which stretched
      // it vertically). The target height matches the old sack's
      // footprint; width is derived from the image's real proportions
      // so nothing distorts. No tint/composite step — that was
      // producing the yellowish box artifact around the art, especially
      // wherever the source PNG isn't fully transparent at its edges.
      const targetH = h * 2.1;
      const aspect = moneyBagImg.naturalWidth / moneyBagImg.naturalHeight;
      const imgH = targetH, imgW = targetH * aspect;
      context.drawImage(moneyBagImg, cx - imgW / 2, cy - imgH / 2, imgW, imgH);
    } else {
      // Fallback procedural sack — used only until money_bag.png finishes
      // loading (or if it fails to load), so there's never a blank gap
      // where a collectible should be.

      // Sack body path — bulging bottom, tapered neck near the top.
      // Built once so it can be filled, textured, and outlined without
      // redefining the same curve three times.
      const bodyPath = new Path2D();
      bodyPath.moveTo(cx - w * 0.48, cy - h * 0.02);
      bodyPath.bezierCurveTo(cx - w * 0.6, cy + h * 0.35, cx - w * 0.36, cy + h * 0.55, cx, cy + h * 0.55);
      bodyPath.bezierCurveTo(cx + w * 0.36, cy + h * 0.55, cx + w * 0.6, cy + h * 0.35, cx + w * 0.48, cy - h * 0.02);
      bodyPath.bezierCurveTo(cx + w * 0.4, cy - h * 0.24, cx + w * 0.16, cy - h * 0.3, cx, cy - h * 0.3);
      bodyPath.bezierCurveTo(cx - w * 0.16, cy - h * 0.3, cx - w * 0.4, cy - h * 0.24, cx - w * 0.48, cy - h * 0.02);
      bodyPath.closePath();

      const bodyGrad = context.createRadialGradient(cx - w * 0.22, cy - h * 0.05, r * 0.2, cx, cy + h * 0.05, w);
      bodyGrad.addColorStop(0, bagLight);
      bodyGrad.addColorStop(0.55, bagMid);
      bodyGrad.addColorStop(1, bagDark);
      context.fillStyle = bodyGrad;
      context.fill(bodyPath);

      // Burlap texture: fold lines plus a faint clipped dot-weave so the
      // sack reads as woven fabric rather than a flat gradient blob.
      context.save();
      context.clip(bodyPath);
      context.strokeStyle = 'rgba(0,0,0,0.12)';
      context.lineWidth = 1;
      for (let f = -1; f <= 1; f++) {
        context.beginPath();
        context.moveTo(cx + f * w * 0.18, cy - h * 0.22);
        context.quadraticCurveTo(cx + f * w * 0.24, cy + h * 0.12, cx + f * w * 0.16, cy + h * 0.42);
        context.stroke();
      }
      context.fillStyle = 'rgba(0,0,0,0.07)';
      for (let row = 0; row < 4; row++) {
        for (let col = -2; col <= 2; col++) {
          const dx = cx + col * w * 0.15 + (row % 2 ? w * 0.075 : 0);
          const dy = cy - h * 0.12 + row * h * 0.16;
          context.beginPath(); context.arc(dx, dy, 0.7, 0, Math.PI * 2); context.fill();
        }
      }
      context.restore();

      // Crisp defining outline so the bag stands out against any
      // background it drifts over
      context.strokeStyle = 'rgba(0,0,0,0.28)';
      context.lineWidth = 1.4;
      context.stroke(bodyPath);

      // Soft broad top-left shine plus a small crisp specular highlight
      context.fillStyle = 'rgba(255,255,255,0.22)';
      context.beginPath();
      context.ellipse(cx - w * 0.2, cy - h * 0.02, w * 0.16, h * 0.14, -0.4, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.5)';
      context.beginPath();
      context.ellipse(cx - w * 0.26, cy - h * 0.08, w * 0.05, h * 0.045, -0.4, 0, Math.PI * 2);
      context.fill();

      // Tied neck
      context.fillStyle = bagDark;
      context.beginPath();
      context.ellipse(cx, cy - h * 0.31, w * 0.2, h * 0.07, 0, 0, Math.PI * 2);
      context.fill();

      // Metallic gold trim ring for the rare ₱200 tier
      if (s.value === 200) {
        context.strokeStyle = '#fff3c4';
        context.lineWidth = 2;
        context.beginPath();
        context.ellipse(cx, cy - h * 0.31, w * 0.2, h * 0.07, 0, 0, Math.PI * 2);
        context.stroke();
      }

      // Drawstring tie (X-wrap)
      context.strokeStyle = tieColor;
      context.lineWidth = 2.2;
      context.lineCap = 'round';
      context.beginPath();
      context.moveTo(cx - w * 0.16, cy - h * 0.36); context.lineTo(cx + w * 0.16, cy - h * 0.26);
      context.moveTo(cx + w * 0.16, cy - h * 0.36); context.lineTo(cx - w * 0.16, cy - h * 0.26);
      context.stroke();

      // Little pinched top poof of fabric above the tie
      context.fillStyle = bagMid;
      context.beginPath();
      context.ellipse(cx, cy - h * 0.42, w * 0.09, h * 0.06, 0, 0, Math.PI * 2);
      context.fill();
    }

    // Peso value label — dark outline behind the fill so it stays
    // legible against light and dark backgrounds alike, not just the
    // bag's own gradient
    context.font = `bold ${r < 19 ? 13 : 16}px Nunito, 'Baloo 2', sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = 3;
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.strokeText('\u20b1' + s.value, cx, cy + h * 0.08);
    context.fillStyle = textColor;
    context.fillText('\u20b1' + s.value, cx, cy + h * 0.08);

    // Twinkling sparkle accents for the rare gold tier — three small
    // stars that twinkle out of phase instead of one static dot
    if (s.value === 200) {
      const sparkles = [
        { dx: 0.32, dy: -0.14, ph: 0 },
        { dx: -0.34, dy: 0.22, ph: 2.1 },
        { dx: 0.22, dy: 0.4, ph: 4.2 },
      ];
      sparkles.forEach(sp => {
        const tw = 0.4 + 0.6 * Math.max(0, Math.sin(ambientTime * 4 + s.pulsePhase + sp.ph));
        context.fillStyle = `rgba(255,250,210,${tw * alpha})`;
        const sx = cx + w * sp.dx, sy = cy + h * sp.dy, sr = 1.6 * tw + 0.4;
        context.beginPath();
        context.moveTo(sx, sy - sr); context.lineTo(sx + sr * 0.3, sy - sr * 0.3);
        context.lineTo(sx + sr, sy); context.lineTo(sx + sr * 0.3, sy + sr * 0.3);
        context.lineTo(sx, sy + sr); context.lineTo(sx - sr * 0.3, sy + sr * 0.3);
        context.lineTo(sx - sr, sy); context.lineTo(sx - sr * 0.3, sy - sr * 0.3);
        context.closePath();
        context.fill();
      });
    }
  });

  context.restore();
}

function render() {
  ctx.save(); ctx.clearRect(0, 0, W, H);
  
  if (state.screenShake > 0) {
    ctx.translate((Math.random() - 0.5) * state.screenShake, (Math.random() - 0.5) * state.screenShake);
  }

  /* ---- Sky: vibrant 4-stop gradient with warm golden horizon band; crossfades to dark storm sky ---- */
  const currentTop     = lerpColor('#55c5f0', '#0c1620', state.skyTransition);
  const currentUpper   = lerpColor('#7ed8ef', '#151e2c', state.skyTransition);
  const currentHorizon = lerpColor('#f2ca72', '#1c2a38', state.skyTransition); // warm golden horizon
  const currentBottom  = lerpColor('#d8eff5', '#28404e', state.skyTransition);

  const skyGrad = ctx.createLinearGradient(0, 0, 0, H);
  skyGrad.addColorStop(0,    currentTop);
  skyGrad.addColorStop(0.35, currentUpper);
  skyGrad.addColorStop(0.6,  currentHorizon);
  skyGrad.addColorStop(1,    currentBottom);
  ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, W, H);

  // Warm amber haze band near the horizon — volcanic atmospheric glow
  if (state.skyTransition < 0.9) {
    const amberBand = ctx.createLinearGradient(0, 275, 0, 490);
    amberBand.addColorStop(0,   'rgba(250,185,70,0)');
    amberBand.addColorStop(0.42,`rgba(248,172,55,${0.2 * (1 - state.skyTransition)})`);
    amberBand.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = amberBand; ctx.fillRect(0, 275, W, 215);
  }

  // Horizon haze fade — softens the join between sky and mountain base
  const horizonHaze = ctx.createLinearGradient(0, 340, 0, 500);
  horizonHaze.addColorStop(0, 'rgba(255,255,255,0)');
  horizonHaze.addColorStop(1, `rgba(215,232,242,${0.2 * (1 - state.skyTransition * 0.85)})`);
  ctx.fillStyle = horizonHaze; ctx.fillRect(0, 340, W, 160);

  if (state.skyTransition < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - state.skyTransition;
    const sunX = 78, sunY = 70;
    // Sun corona rays
    ctx.strokeStyle = 'rgba(255,236,160,0.18)';
    for (let ri = 0; ri < 8; ri++) {
      const ra = (ri / 8) * Math.PI * 2;
      ctx.lineWidth = 2 + (ri % 2) * 1.8;
      ctx.beginPath();
      ctx.moveTo(sunX + Math.cos(ra) * 28, sunY + Math.sin(ra) * 28);
      ctx.lineTo(sunX + Math.cos(ra) * 170, sunY + Math.sin(ra) * 170);
      ctx.stroke();
    }
    // Sun radial gradient
    const sunGrad = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 200);
    sunGrad.addColorStop(0,    'rgba(255,254,210,1)');
    sunGrad.addColorStop(0.07, 'rgba(255,228,100,0.9)');
    sunGrad.addColorStop(0.2,  'rgba(255,210,70,0.5)');
    sunGrad.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = sunGrad;
    ctx.beginPath(); ctx.arc(sunX, sunY, 200, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ---- Clouds drift behind the mountain silhouette ---- */
  drawClouds(ctx, 1 - state.skyTransition);

  /* ---- Distant ranges receding into haze, behind the main peak (depth) ---- */
  drawDistantRanges(ctx, 1 - state.skyTransition);

  /* ---- Mountain: two pre-rendered lighting states cross-faded by weather (cheap) ---- */
  if (!isMountainCached) buildMountainCache();
  ctx.drawImage(mountainCanvasDay, 0, 0, W, H);
  if (state.skyTransition > 0) {
    ctx.save(); ctx.globalAlpha = state.skyTransition;
    ctx.drawImage(mountainCanvasNight, 0, 0, W, H);
    ctx.restore();
  }

  /* ---- Crater lake steam: the lake itself is baked into the cached
     mountain art (paintPinatuboCaldera); only the live steam wisps are
     drawn per frame so they can drift. ---- */
  const crX = CRATER_X, crY = CRATER_Y + 10;

  // Geothermal steam wisps rising from active thermal pool
  ctx.save();
  for (let w = 0; w < 4; w++) {
    const wx = crX - 12 + w * 8 + Math.sin(state.time * 0.7 + w * 1.2) * 4;
    const wy = crY - 8 - w * 6 - ((state.time * 5 + w * 4) % 24);
    const steamAlpha = Math.max(0, 0.16 - w * 0.035) * (1 - state.skyTransition * 0.35);
    const steamGrad = ctx.createRadialGradient(wx, wy, 1, wx, wy, 13);
    steamGrad.addColorStop(0, `rgba(255,255,255,${steamAlpha})`);
    steamGrad.addColorStop(0.6, `rgba(240,245,250,${steamAlpha * 0.5})`);
    steamGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = steamGrad;
    ctx.beginPath(); ctx.ellipse(wx, wy, 13, 18, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();

  // Birds: lazy pre-storm flight, or a one-shot flee-the-scene animation
  // once the storm has begun (see drawBirds() for the two modes). Drawn in
  // front of the mountain silhouette since birds read as much closer to
  // camera than the volcano itself.
  drawBirds(ctx);

  /* ---- Volcanic smoke & ash: quiet continuous degassing above the crater.
     Drawn after the mountain so the plume reads as rising into open sky
     in front of the peak, and after the crater-lake steam so the two
     effects layer naturally (tight steam wisps + a taller drifting plume). ---- */
  drawSmoke(ctx, 1 - state.skyTransition);
  drawAshParticles(ctx);

  /* ---- Aerial haze on the horizon seam + a lowland coconut treeline along
     the field margins: separates background from playfield and gives the
     scene a distinctly Philippine-lowland horizon (drawn behind the field
     so the grass roots the palms and never covers gameplay). ---- */
  drawDepthHaze(ctx);
  drawHorizonPalms(ctx);

  if (!isStaticRendered) cacheStaticElements();
  ctx.drawImage(staticCanvas, 0, 0, W, H);

  // Animated river current — sparkles and traveling highlight streaks
  // drawn fresh every frame (the base water/banks are baked into
  // staticCanvas above; only the motion cues live here).
  drawRiverLiveDetail(ctx);

  // Trees, bushes, and grass are drawn live (not baked into staticCanvas)
  // so they can gently sway — see the LIVING ENVIRONMENT section.
  drawPlants(ctx);
  drawGrassTufts(ctx);
  
  drawLaharFlow(ctx);
  drawBranchFlows(ctx);
  drawDikeAccumulation(ctx);
  drawMudPooling(ctx);
  drawDebris(ctx);

  // Bridge (Angeles only) sits above the mud channel it spans, with its
  // ambient traffic drawn right after so cars read as driving on the deck.
  drawBridge(state.bridge);
  // Porac's creek crossing must come BEFORE the traffic: it was drawn much
  // later, so it painted straight over any tricycle on it and the bridge
  // looked like it was on top of the vehicle.
  drawCreekBridge(ctx);      // Porac's creek crossing (damageable)
  drawCars(ctx);
  
  // Ground-level tool effects (dug cuts, diversion arrows, shield rings)
  // are drawn UNDER the tool sprites so the sprite always stays readable.
  // The diversion ghost sits here too: it shows the channel's ORIGINAL
  // course beside where the mud actually runs now.
  drawDiversionGhost(ctx);
  drawToolEffects(ctx);

  state.placedItems.forEach(item => {
    if (item.dead) return;

    // Shovels are consumed on use — the tool is removed the moment it's
    // placed, leaving only the dug cut behind (drawn by drawToolEffects).
    // So no shovel sprite and no condition bar are ever drawn on the map.
    if (item.type === 'shovel') return;

    ctx.save(); ctx.translate(item.x, item.y);
    // Sprites keep their full size and opacity now that wear is expressed
    // in the ART itself (sagging sacks, split seams, spalled concrete) —
    // a shrinking, fading tool used to read as "far away" rather than
    // "about to fail". Trees still scale, because they genuinely grow.
    const wearFrac = item.hp === Infinity ? 1 : Math.max(0, item.hp / 100);
    const growFrac = item.type === 'tree' ? treeGrow(item) : 1;
    if (item.type === 'tree') ctx.scale(0.62 + 0.38 * growFrac, 0.62 + 0.38 * growFrac);
    drawItemShape(ctx, item.type, wearFrac, growFrac);
    ctx.restore();

    // Condition bar on any wearing tool, so the player can see a barrier
    // about to fail in time to react.
    if (item.hp !== Infinity && item.hp < 99.5) {
      drawHPBar(ctx, item.x, item.y - 28, 30, 4.5, Math.max(0, item.hp));
    }
  });
  
  drawChurch(state.church);
  drawSchool(state.school);
  drawBaboRobot(state.robot); 
  drawMonument(state.monument);
  drawTownProps(ctx);        // extra local-landmark scenery for this municipality
  state.houses.forEach(drawHouse);
  // Residents going about their day before the storm (and evacuating when
  // it starts) — drawn after the buildings so they stand in front of them.
  drawVillagers(ctx);
  // Collapse dust sits in front of the buildings it came from.
  drawTownHazard(ctx);
  drawCollapseDust(ctx);
  drawSlopeCoverHUD(ctx);
  /* Tricycles are drawn AFTER every building and landmark.
     They used to run in the traffic pass, before the church, props and
     houses, so any structure whose sprite reached over a lane painted
     straight over the vehicle — the Bacolor church was doing exactly that.
     Rather than chase each sprite's true height, the vehicle simply owns a
     layer in front of the town: passing "behind" a house is fine to see,
     but it should never be half-eaten by one.
     The bridge's near railing still goes on top afterwards, so traffic on
     the Angeles deck stays correctly inside the barrier. */
  drawTricycles(ctx);
  drawBridgeNearRail();

  // All structures are on screen now — paint every health bar on top so
  // none can be hidden behind a neighbouring building.
  flushHPBars(ctx);
  drawSplashes(ctx);
  drawRipples(ctx);
  // Impact read-outs go on top of every structure so they are never hidden.
  drawGuardLinks(ctx);
  drawImpactBadges(ctx);
  drawImpactTexts(ctx);

  /* ---- Unifying vignette: frames the play area and pulls every hand-drawn
     object into one cohesive 2D image. Drawn after the world but before the
     HUD/collectibles so nothing readable is dimmed. ---- */
  drawSceneVignette(ctx);

  // ---- Horizontal 3-wave storm progress bar, top-middle ----
  // Sits in the gap between the budget/goal HUD panels (which occupy the
  // top-left/top-right corners). Fill represents overall progress through
  // the whole 3-wave campaign, not just the current storm: waveIndex
  // contributes a full third each, and the active wave's own elapsed-
  // time fraction fills the remainder of its third — so the bar visibly
  // continues from where the previous wave left off instead of resetting.
  /* Drawn on the HUD overlay, not the scene canvas, so it stays at device
     resolution regardless of the scene's render quality. */
  sizeHudCanvas();
  hudCtx.setTransform(HUD_SX, 0, 0, HUD_SY, 0, 0);
  hudCtx.clearRect(0, 0, W, H);
  const sceneCtx = ctx;
  ctx = hudCtx;
  ctx.save();
  // ---- Storm gauge ----
  // Full-width strip along the very top. It used to sit in the gap between
  // the budget and goal panels, which forced all three to be narrow and
  // cramped; moving it to its own row lets every panel below grow.
  // Styled to match the CSS HUD panels (parchment, steel border, amber
  // accent, rivet) so the HUD reads as one instrument cluster.
  // The gauge scales with the rest of the HUD, then gets its own boost so
  // the wave indicator reads larger than the surrounding panels. It stays
  // centred horizontally and pinned to the top as it grows.
  const S = HUD_SCALE * WAVE_GAUGE_BOOST;
  ctx.translate((W - (W - 30) * S) / 2 - 15 * S, 4 - 6 * S);
  ctx.scale(S, S);
  const PX = 15, PY = 8, PW = W - 30, PH = 34;
  ctx.shadowColor = 'rgba(0,0,0,0.38)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 5;
  // Arcade panel: warm parchment face, thick cream outline, hard bottom rim
  // — the same recipe the DOM panels use, so the canvas gauge belongs to the
  // same set instead of being the one cool-grey element on a warm HUD.
  ctx.fillStyle = 'rgba(163,122,66,0.75)';
  roundRectCtx(ctx, PX, PY + 5, PW, PH, 14); ctx.fill();       // rim below
  const panelGrad = ctx.createLinearGradient(PX, PY, PX, PY + PH);
  panelGrad.addColorStop(0, '#fdf3dc'); panelGrad.addColorStop(0.55, '#f2e0bb'); panelGrad.addColorStop(1, '#e6cf9f');
  ctx.fillStyle = panelGrad;
  roundRectCtx(ctx, PX, PY, PW, PH, 14); ctx.fill();
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = '#fffdf6'; ctx.lineWidth = 5;
  roundRectCtx(ctx, PX, PY, PW, PH, 14); ctx.stroke();
  ctx.save();
  roundRectCtx(ctx, PX, PY, PW, PH, 14); ctx.clip();
  const gloss = ctx.createLinearGradient(0, PY, 0, PY + PH * 0.5);
  gloss.addColorStop(0, 'rgba(255,255,255,0.6)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  roundRectCtx(ctx, PX + 6, PY + 3, PW - 12, PH * 0.42, 10); ctx.fill();
  ctx.restore();

  const withinWaveFrac = state.raining ? Math.min(1, state.stormTime / STORM_DUR) : 0;
  const waveIdx = Math.min(state.waveIndex, WAVE_ORDER.length - 1);
  const waveName = WAVE_LABELS[WAVE_ORDER[waveIdx]].toUpperCase();

  // Left slot: a countdown, which is the one thing the HUD never told the
  // player. During the prep pause it counts into the next storm; while a
  // storm runs it counts down what is left of it.
  ctx.textAlign = 'left';
  ctx.fillStyle = '#4a3418';
  // Shown in REAL seconds, not game seconds. stormTime advances at
  // GAME_SPEED, so printing it raw made the clock tick 1.5x per second —
  // visibly wrong against a wall clock. Dividing by GAME_SPEED makes it
  // count down once per real second, and naturally starts at a smaller
  // number (50 rather than 75) which matches how long the storm lasts.
  const secsLeft = Math.max(0, Math.ceil((STORM_DUR - state.stormTime) / GAME_SPEED));
  if (state.prepCountdown > 0) {
    ctx.font = "800 13px Nunito, 'Baloo 2', sans-serif";
    ctx.fillText(`NEXT IN ${Math.ceil(state.prepCountdown)}s`, PX + 14, PY + PH / 2 + 5);
  } else if (state.raining) {
    ctx.font = "900 19px Nunito, 'Baloo 2', sans-serif";
    ctx.fillText(`${secsLeft}s`, PX + 14, PY + PH / 2 + 1);
    ctx.font = "800 10px Nunito, 'Baloo 2', sans-serif";
    ctx.fillStyle = 'rgba(74,52,24,0.65)';
    ctx.fillText('LEFT', PX + 14, PY + PH / 2 + 13);
  } else {
    ctx.font = "800 11.5px Nunito, 'Baloo 2', sans-serif";
    ctx.fillText(`STORM ${waveIdx + 1} OF ${WAVE_ORDER.length}`, PX + 12, PY + PH / 2 + 5);
  }

  // One segment per wave: which storms are done, which is running and how
  // far it has left are all separately legible at kiosk distance.
  // segLeft clears the longest title ("MEDIUM STORM · 2/3") with room to spare.
  const segLeft = PX + 150, segRight = PX + PW - 14, segGap = 7;
  const segH = 18, segY = PY + (PH - segH) / 2;
  const segW = (segRight - segLeft - segGap * (WAVE_ORDER.length - 1)) / WAVE_ORDER.length;
  const segColors = ['#22c55e', '#f59e0b', '#ef4444'];
  const segLabels = ['EASY', 'MED', 'HARD'];
  ctx.textAlign = 'center';
  for (let f = 0; f < WAVE_ORDER.length; f++) {
    const sx = segLeft + f * (segW + segGap);
    roundRectCtx(ctx, sx, segY, segW, segH, 9);
    ctx.fillStyle = '#efe3c4'; ctx.fill();
    ctx.strokeStyle = '#fffdf6'; ctx.lineWidth = 2.4;
    roundRectCtx(ctx, sx, segY, segW, segH, 9); ctx.stroke();

    const frac = f < waveIdx ? 1 : (f === waveIdx ? withinWaveFrac : 0);
    if (frac > 0.005) {
      ctx.save();
      roundRectCtx(ctx, sx, segY, segW, segH, 9); ctx.clip();
      const g = ctx.createLinearGradient(0, segY, 0, segY + segH);
      g.addColorStop(0, lerpColor(segColors[f], '#ffffff', 0.35));
      g.addColorStop(1, segColors[f]);
      ctx.fillStyle = g;
      ctx.fillRect(sx, segY, segW * frac, segH);
      ctx.restore();
    }
    // Bright leading edge on the storm currently running
    if (f === waveIdx && state.raining && frac > 0.01 && frac < 0.995) {
      const hx = sx + segW * frac;
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(hx, segY + 2); ctx.lineTo(hx, segY + segH - 2); ctx.stroke();
    }
    // Label sits inside its segment; flipped to white once the fill is
    // under it so it stays readable either way.
    const cxLab = sx + segW / 2;
    const covered = frac > 0.55;
    ctx.font = "800 12px Nunito, 'Baloo 2', sans-serif";
    if (covered) {
      ctx.fillStyle = 'rgba(20,30,20,0.45)';
      ctx.fillText(segLabels[f], cxLab + 1, segY + segH / 2 + 5);
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.fillStyle = f <= waveIdx ? '#4a3418' : 'rgba(74,52,24,0.45)';
    }
    ctx.fillText(segLabels[f], cxLab, segY + segH / 2 + 4);
    if (f < waveIdx) {
      ctx.fillStyle = '#14532d'; ctx.font = "900 13px Nunito, sans-serif";
      ctx.fillText('✓', sx + segW - 12, segY + segH / 2 + 5);
    }
  }
  ctx.restore();
  // Gauge done — everything after this belongs on the scene canvas again.
  ctx = sceneCtx;

  if (state.raining) {
    ctx.save();
    ctx.lineCap = 'round';
    state.particles.forEach((p, idx) => {
      const alpha = 0.22 + (idx % 7) * 0.055;
      const thick = 0.9 + (idx % 4) * 0.35;
      ctx.strokeStyle = `rgba(155,205,255,${alpha})`;
      ctx.lineWidth = thick;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - 8, p.y + 20); ctx.stroke();
    });
    ctx.restore();
  }

  if (state.lightningFlash > 0 && state.lightningPath.length > 0) {
    ctx.save(); ctx.strokeStyle = '#e0f2fe'; ctx.lineWidth = 3.5; ctx.shadowBlur = 20; ctx.shadowColor = '#0284c7'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(state.lightningPath[0].x, state.lightningPath[0].y);
    for (let i = 1; i < state.lightningPath.length; i++) ctx.lineTo(state.lightningPath[i].x, state.lightningPath[i].y);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.shadowBlur = 0; ctx.stroke(); ctx.restore();
  }

  if (state.lightningFlash > 0) {
    ctx.save(); ctx.fillStyle = `rgba(244, 248, 255, ${Math.min(0.85, state.lightningFlash * 2.8)})`; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  // Falling money bag collectibles — drawn in front of everything (weather,
  // buildings, lahar, rain) but behind the drag-preview guide so they're
  // never obscured.
  drawFallingSuns(ctx);

  // Always drawn last so the placement guide stays visible above every
  // other layer (weather, buildings, lahar) while a tool is being dragged.
  drawDragPreview(ctx);

  // Between-wave prep countdown — shown for 5 seconds after a wave is
  // survived, before the next one auto-starts (see beginWaveTransition()).
  // Drawn last of all so it sits above every gameplay layer.
  if (state.prepCountdown > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 14, 26, 0.55)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fcd34d';
    ctx.font = "26px 'Luckiest Guy', 'Baloo 2', sans-serif";
    ctx.fillText('Get Ready —', W / 2, H / 2 - 70);
    ctx.fillText(`${WAVE_LABELS[WAVE_ORDER[state.waveIndex + 1]] || ''} Wave Incoming`, W / 2, H / 2 - 42);

    const pulse = 1 + Math.sin(ambientTime * 6) * 0.06;
    ctx.font = `${Math.round(108 * pulse)}px 'Luckiest Guy', 'Baloo 2', sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(252,211,77,0.7)';
    ctx.shadowBlur = 24;
    ctx.fillText(String(state.prepCountdown), W / 2, H / 2 + 40);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  ctx.restore(); 
}

let lastT = performance.now();
/* Watches real frame times and steps the render resolution down if the
   machine can't hold a smooth rate — so the same build stays fluid on a
   weak kiosk PC without looking soft on a capable one. It only ever
   lowers quality (never oscillates back up), and only twice, so the
   picture can't visibly pulse while someone is playing. */
let perfSamples = [], perfDowngrades = 0, perfCooldown = 2;
function monitorPerformance(dt) {
  if (perfDowngrades >= 2) return;
  if (perfCooldown > 0) { perfCooldown -= dt; return; }   // ignore startup hitches
  perfSamples.push(dt);
  if (perfSamples.length < 90) return;
  // Median, so one stray long frame (a GC pause, a tab switch) can't
  // trigger a downgrade on its own.
  const sorted = perfSamples.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  perfSamples = [];
  if (median > 1 / 45) {           // sustained below ~45fps
    perfDowngrades++;
    renderQuality = perfDowngrades === 1 ? 0.8 : 0.62;
    resizeCanvas();
    perfCooldown = 3;
  }
}

function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  monitorPerformance(dt);

  // Ambient environment clock always advances — independent of state.running —
  // so the volcano/sky/clouds/smoke feel alive on the menu screens too.
  ambientTime += dt;
  updateClouds(dt);
  updateSmoke(dt);
  updateAsh(dt);

  // Everything inside simulate() is driven by dt — the storm clock, flow
  // advance, contact damage, income, barrier wear — so scaling the dt it
  // receives compresses the whole round uniformly. Every ratio between
  // those systems is preserved, which means the balance is untouched and
  // only the wall-clock length of a round changes.
  simulate(dt * GAME_SPEED);
  render();
  requestAnimationFrame(loop);
}

/* ---- Money bag tap/click collection handler ----------------------------------
   Attached to the outer wrap so it fires for both mouse clicks and touch taps.
   We convert screen coords -> canvas-space coords, check every live bag's hit
   radius (generous: bag body radius + 8px buffer for fat fingers / kiosk touch),
   and if one is hit we credit its value, trigger the pop-fade animation, and
   show a floating ₱-value label toast. Only active during gameplay. ---------- */
wrap.addEventListener('pointerdown', (e) => {
  if (state.gameOver) return;
  // Don't steal events that started on the toolbox or HUD
  if (e.target !== canvas && e.target !== document.getElementById('dropLayer')) return;

  const rect = wrap.getBoundingClientRect();
  const cx = (e.clientX - rect.left) / rect.width  * W;
  const cy = (e.clientY - rect.top)  / rect.height * H;

  // 1) Collect a money bag if the tap landed on one (only while running).
  if (state.running && state.fallingSuns.length) {
    for (let i = state.fallingSuns.length - 1; i >= 0; i--) {
      const s = state.fallingSuns[i];
      if (s.popT > 0) continue; // already collected
      // Art is small, but a kiosk tap target shouldn't be: pad the hit
      // radius well past the sprite so bags stay easy to catch by finger.
      const hitR = (s.value === 200 ? 19 : s.value === 100 ? 16 : 14) + 16;
      if (Math.hypot(cx - s.x, cy - s.y) <= hitR) {
        // Award budget
        const earned = s.value;
        state.budget = Math.min(state.budgetMax, state.budget + earned);
        updateBudgetUI();
        refreshToolboxAfford();
        flashBudgetBoost();

        // Mark as collected — pop animation starts, sun fades quickly
        s.popT   = 1.0;  // drawFallingSuns uses popT > 0 as an override alpha
        s.maxAge = s.age + 0.28; // expire very shortly after

        showToast(uiIcon('money') + ` +${formatPeso(earned)} — Money bag collected!`, 1100);
        return; // one bag per tap; don't also place a tool
      }
    }
  }

  // 2) Otherwise, if a tool is armed, place it where the map was tapped.
  if (selectedTool) {
    tryPlaceItem(selectedTool, cx, cy);
    dragPreviewPos = { x: cx, y: cy, valid: cy >= GRASS_MIN_Y, type: selectedTool };
    // If that used up the last of the budget for this tool, disarm it.
    if (!TOOL_DEFS[selectedTool] || TOOL_DEFS[selectedTool].price > state.budget) deselectTool();
  }
});

function resetState() {
  laharRainTrack.pause();
  laharRainTrack.currentTime = 0;

  // A fresh campaign always begins on wave 0 (Easy) — see startWave() for
  // the lighter-weight transition used between waves 1→2 and 2→3, which
  // does NOT call this function (it deliberately keeps house/structure
  // damage carried over, where this full reset intentionally does not).
  state.waveIndex = 0;
  gameSettings.difficulty = WAVE_ORDER[0];

  // Look up the active difficulty's channel count BEFORE generating paths,
  // so Easy/Medium/Hard produce 3/4/5 independent lahar channels respectively.
  const diffSettings = DIFFICULTY_SETTINGS[gameSettings.difficulty || 'easy'];
  generateRandomPaths(diffSettings.channelCount);
  loadTownMap();
  loadDifficulty();
  // Needs state.houses/church/etc. from loadTownMap() above, so it must
  // run after it — builds the small trickle branches that reach any
  // building the main channels don't cover.
  generateBranchPaths();

  state = { 
    ...state, 
    running: false, raining: false, gameOver: false, won: false,  scoreSubmitted: false,
    time: 0, rainAmount: 0, stormTime: 0, stormOver: false, postStormTimer: 0, laharVolume: 0, skyTransition: 0, screenShake: 0, lightningFlash: 0,
    // laharProgresses is sized to match however many channels were just
    // generated (3/4/5), instead of a hardcoded 3-element array.
    impactTexts: [],
    lightningPath: [], laharProgresses: new Array(channelPaths.length).fill(0), branchProgresses: new Array(branchPaths.length).fill(0),
    damPools: new Array(channelPaths.length).fill(0), damCapped: new Array(channelPaths.length).fill(false), damRelease: new Array(channelPaths.length).fill(0),
    severFade: new Array(channelPaths.length).fill(1), severT: new Array(channelPaths.length).fill(1),
    brSeverFade: new Array(branchPaths.length).fill(1), brSeverT: new Array(branchPaths.length).fill(1),
    placedItems: [], toolsPlacedTotal: 0, dust: [],
  boulders: [], burialLevel: 0, bankScars: [], hazardTimer: 0, bridgeWarn: null, particles: [], flowParticles: [], ripples: [],
    debris: [], splashes: [],
    comboCount: 0, lastPlacementTime: -999, maxCombo: 0,
    birdsFleeing: false, birdsFleeStartAmbient: 0,
    carsFleeing: false, carsFleeStartAmbient: 0,
    villagersFleeing: false, villagersFleeStartAmbient: 0,
    fallingSuns: [], sunSpawnTimer: 6,
    waveIndex: 0, prepCountdown: -1,
  };

  // No tools are placed yet, so this just restores every channel to its
  // pristine generated shape and refreshes the cached lengths.
  rebuildFlowGeometry();

  document.getElementById('rainPanel').classList.remove('active');
  document.getElementById('rainStatus').textContent = 'Start'; 
  buildToolbox();
}

// ---------------- WAVE TRANSITIONS ----------------
// Lighter-weight reset used ONLY when advancing from one wave to the
// next (Easy→Medium, Medium→Hard) — unlike resetState() above, this
// deliberately does NOT call loadTownMap(), so houses/church/school/
// robot/monument/bridge keep whatever HP/lost state they ended the
// previous wave with. Only storm-specific state and defenses reset —
// new channels, fresh budget for the new tier, and a clean toolbox.
function startWave(waveIndex) {
  state.waveIndex = waveIndex;
  gameSettings.difficulty = WAVE_ORDER[waveIndex];

  const diffSettings = DIFFICULTY_SETTINGS[gameSettings.difficulty];
  generateRandomPaths(diffSettings.channelCount);
  loadDifficulty();
  // Houses/church/etc. are intentionally NOT reloaded between waves (see
  // comment above this function), but the main channels just changed, so
  // branches need to be rebuilt against the new channel geometry.
  generateBranchPaths();

  state = {
    ...state,
    running: true, raining: true, gameOver: false, won: false, scoreSubmitted: false,
    time: 0, rainAmount: 0, stormTime: 0, stormOver: false, postStormTimer: 0, laharVolume: 0,
    skyTransition: 0, screenShake: 0, lightningFlash: 0,
    impactTexts: [],
    lightningPath: [], laharProgresses: new Array(channelPaths.length).fill(0), branchProgresses: new Array(branchPaths.length).fill(0),
    placedItems: [], toolsPlacedTotal: 0, dust: [],
  boulders: [], burialLevel: 0, bankScars: [], hazardTimer: 0, bridgeWarn: null, particles: [], flowParticles: [], ripples: [],
    debris: [], splashes: [],
    comboCount: 0, lastPlacementTime: -999,
    birdsFleeing: true, birdsFleeStartAmbient: ambientTime,
    carsFleeing: true, carsFleeStartAmbient: ambientTime,
    villagersFleeing: true, villagersFleeStartAmbient: ambientTime,
    fallingSuns: [], sunSpawnTimer: 6,
    prepCountdown: -1,
  };

  // Defenses are cleared between waves, so the channels start unbent again.
  rebuildFlowGeometry();

  buildToolbox();
  document.getElementById('rainPanel').classList.add('active');
  document.getElementById('rainStatus').textContent = 'Storm Active';
  playSound('storm');
  laharRainTrack.play().catch(err => console.log("Audio blocked: ", err));
  showToast(`${WAVE_LABELS[gameSettings.difficulty]} wave begins!`);
}

// Called when a wave is survived and at least one wave still remains.
// Pauses the simulation, shows a "get ready" countdown for 5 seconds,
// then automatically starts the next wave via startWave() above — no
// extra tap required, matching a boss-rush-style wave progression.
function beginWaveTransition(nextWaveIndex) {
  state.running = false;
  state.prepCountdown = 5;
  showToast(`Wave survived! Preparing the ${WAVE_LABELS[WAVE_ORDER[nextWaveIndex]]} wave...`, 4000);

  const tick = () => {
    if (state.prepCountdown <= 1) {
      state.prepCountdown = -1;
      startWave(nextWaveIndex);
      return;
    }
    state.prepCountdown -= 1;
    setTimeout(tick, 1000);
  };
  setTimeout(tick, 1000);
}

let gameStarted = false;
let pausedRunningState = false;

function startGame() {
  resetState();
  gameStarted = true;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  document.getElementById('overlay').classList.add('hidden');
}

/* ---------------- INTERACTION CAPTURES ---------------- */
// Only the "Select" button inside each town card triggers selection —
// the card itself is no longer clickable, avoiding accidental taps
// (e.g. while scrolling/reading the description) from switching towns.
document.querySelectorAll('.town-card .select-town-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const card = btn.closest('.town-card');
    if (!card) return;
    document.querySelectorAll('.town-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    gameSettings.town = card.dataset.town;
  });
});

document.getElementById('nextToTownBtn').addEventListener('click', () => {
  // Name first, so every run can be attributed on the leaderboard. The
  // field is pre-filled with the last name used, so replaying is one tap.
  showNameEntry();
});

document.getElementById('backToObjectiveBtn').addEventListener('click', () => {
  showNameEntry();
});

document.getElementById('nextToInfoFromTownBtn').addEventListener('click', () => {
  if (!gameSettings.town) {
    showToast("Please select a town first!");
    return;
  }
  showTownInfo();
});

document.getElementById('backToTownFromInfoBtn').addEventListener('click', () => {
  showTownSelection();
});

document.getElementById('confirmStartBtn').addEventListener('click', () => {
  /* Tell a hosting parent (the Angular kiosk shell) that actual play is
     starting, so it can fade out its welcome-screen music. The shell keeps
     that music running through the briefing and town-selection screens —
     it only needs to stop once the simulation itself begins. Same bridge
     as the 'exit-lahar-game' message below; harmless with no parent. */
  try { window.parent.postMessage('lahar-game-started', '*'); } catch (e) { /* no parent */ }
  startGame();
});

// "Exit Game" — posts an exit message to a hosting parent page (e.g. the
// Angular kiosk shell), same bridge as exitToKioskBtn on the Mission
// Objective screen. Falls back to this game's own start screen when
// there's no parent to hand off to (e.g. testing index.html standalone).
document.getElementById('restartBtn').addEventListener('click', () => {
  stopConfetti();
  if (window.parent && window.parent !== window) {
    window.parent.postMessage('exit-lahar-game', '*');
  } else {
    showObjectiveSelection();
  }
});

// "Try Again" — only visible after a loss (toggled in endGame()). Calls
// startGame()/resetState(), which resets state.waveIndex back to 0 — so
// this restarts the full 3-wave campaign (Easy → Medium → Hard) from the
// beginning, on the same town, skipping the objective/town/info screens
// entirely for a fast retry.
document.getElementById('tryAgainBtn').addEventListener('click', () => {
  stopConfetti();
  startGame();
});

document.getElementById('instructionsBtn').addEventListener('click', () => {
  // The prep countdown auto-starts the next wave on its own timer,
  // independent of this menu's pause/resume state — opening the menu
  // mid-countdown and then hitting "Return" could stomp state.running
  // back to false right after startWave() already set it true. Simplest
  // fix: the Menu button just does nothing during that ~5s window.
  if (state.prepCountdown > 0) return;

  const closeMenuBtn = document.getElementById('closeMenuBtn');
  if (gameStarted && !state.gameOver) {
    pausedRunningState = state.running;
    state.running = false;
    closeMenuBtn.style.display = 'block';
  } else {
    closeMenuBtn.style.display = 'none';
  }
  showObjectiveSelection();
});

document.getElementById('closeMenuBtn').addEventListener('click', () => {
  document.getElementById('overlay').classList.add('hidden');
  state.running = pausedRunningState;
});

// Tells a hosting parent page (e.g. the Angular kiosk shell embedding
// this game in an iframe) that the player wants to leave the game
// entirely, as opposed to "Return" above which just closes this menu
// and resumes the current round. Falls back to navigating straight to
// the kiosk's menu page when there's no parent iframe to hand off to
// (e.g. testing index.html standalone in its own browser tab).
document.getElementById('exitToKioskBtn').addEventListener('click', () => {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage('exit-lahar-game', '*');
  } else {
    window.location.href = 'http://localhost:4200/menu';
  }
});

/* ---------------- KIOSK TOUCH GUARDS ----------------
   The kiosk is operated by hand on a public touch screen, so browser
   gestures that make sense on a phone are hazards here: a long press
   pops a context menu over the game, a two-finger pinch zooms the
   whole exhibit out of alignment, and a stray second finger can fire
   a second placement the visitor never intended. */

// Long-press context menu would sit on top of the exhibit until dismissed.
window.addEventListener('contextmenu', e => e.preventDefault());

// Pinch / double-tap zoom (Safari-family gesture events + ctrl-wheel).
['gesturestart', 'gesturechange', 'gestureend'].forEach(evt =>
  window.addEventListener(evt, e => e.preventDefault(), { passive: false }));
window.addEventListener('wheel', e => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

// Belt-and-braces double-tap-zoom guard for browsers that ignore
// touch-action: manipulation.
let lastTouchEnd = 0;
document.addEventListener('touchend', e => {
  const now = Date.now();
  if (now - lastTouchEnd < 300) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// Only one finger at a time places a tool; extra fingers resting on the
// screen (common when someone steadies themselves on a kiosk) are ignored.
// Tracked by counting live touch points rather than trusting isPrimary,
// which is unset on synthetic events and unreliable across browsers.
let activeTouchPoints = 0;
window.addEventListener('touchstart', e => { activeTouchPoints = e.touches.length; }, { passive: true });
window.addEventListener('touchend',   e => { activeTouchPoints = e.touches.length; }, { passive: true });
window.addEventListener('touchcancel', e => { activeTouchPoints = e.touches.length; }, { passive: true });
wrap.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch' && activeTouchPoints > 1) {
    e.stopPropagation(); e.preventDefault();
  }
}, true);


/* ---------------- UI CLICK SOUNDS ----------------
   One delegated listener rather than a call in every handler: it covers
   every button on every screen, including the toolbox, the rain panel and
   the municipality cards, and it keeps working for any button added later.

   It fires on pointerdown so the sound lands the instant the finger makes
   contact — waiting for 'click' feels laggy on a touch kiosk. The tone is
   chosen from the button's role so the audio carries meaning:
     confirm -> forward/affirmative (Next, Start Game, Try Again)
     back    -> backward/cancel (Back, Return, Exit)
     select  -> arming a tool or picking a municipality
     click   -> anything else
   Disabled controls deliberately stay silent here: tryPlaceItem and the
   toolbox already play their own 'error' buzz when you tap one. */
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest(
    'button, .tool-item, .town-card, #rainPanel, #instructionsBtn, #toolboxToggle'
  );
  if (!el) return;
  if (el.classList.contains('disabled') || el.disabled) return;

  /* One voice per ROLE, so a visitor learns the interface by ear:
       launch  — committing to play (Start Game)
       trophy  — records / achievement (Leaderboard)
       exit    — leaving the game
       confirm — advancing a step (Next, Choose Town, Try Again)
       back    — stepping back a screen
       select  — arming a tool or picking a town
       click   — anything else                                          */
  let tone = 'click';
  if (el.id === 'confirmStartBtn') tone = 'launch';
  else if (el.classList.contains('btn-trophy')) tone = 'trophy';
  else if (el.id === 'exitToKioskBtn' || el.id === 'restartBtn') tone = 'exit';
  else if (el.classList.contains('btn-primary') || el.classList.contains('btn-success')) tone = 'confirm';
  else if (el.classList.contains('btn-secondary')) tone = 'back';
  else if (el.classList.contains('tool-item') ||
           el.classList.contains('town-card') ||
           el.classList.contains('select-town-btn')) tone = 'select';
  else if (el.id === 'rainPanel') tone = 'confirm';

  // The rain panel plays its own storm rumble once started; don't double up.
  if (el.id === 'rainPanel' && (state.raining || state.gameOver)) return;

  playSound(tone);
}, true);


/* ---------------- VOLUME CONTROL UI ----------------
   A speaker button that expands a slider, plus a mute toggle that
   remembers the level you were at so un-muting restores it. Wired to
   'input' so the level tracks the finger live while dragging. */
// (volumeBeforeMute removed with the old mute button — the two sliders
//  reach zero on their own, so a separate mute control is redundant.)

function updateVolumeUI() {
  const mSlider = document.getElementById('musicSlider');
  const fSlider = document.getElementById('sfxSlider');
  const mLabel = document.getElementById('musicValue');
  const fLabel = document.getElementById('sfxValue');
  const mPct = Math.round(musicVolume * 100);
  const fPct = Math.round(sfxVolume * 100);
  // Never fight the slider the visitor is currently dragging.
  if (mSlider && document.activeElement !== mSlider) mSlider.value = String(mPct);
  if (fSlider && document.activeElement !== fSlider) fSlider.value = String(fPct);
  if (mLabel) mLabel.textContent = mPct + '%';
  if (fLabel) fLabel.textContent = fPct + '%';

  /* CSS cannot read a range input's value, so the filled portion of each
     track is driven by a custom property set here. */
  if (mSlider) mSlider.style.setProperty('--fill', mPct + '%');
  if (fSlider) fSlider.style.setProperty('--fill', fPct + '%');

  // Icons reflect the level, including a clear silent state at zero.
  const mIcon = document.getElementById('musicIcon');
  const fIcon = document.getElementById('sfxIcon');
  /* Drawn marks, not emoji characters. updateVolumeUI runs on every change,
     so it was overwriting the SVG in the markup with a font glyph. */
  if (mIcon) mIcon.innerHTML = uiIcon(musicVolume === 0 ? 'mute' : 'note');
  if (fIcon) fIcon.innerHTML = uiIcon(sfxVolume === 0 ? 'mute'
                               : (sfxVolume < 0.5 ? 'speakerLow' : 'speaker'));
  const mRow = mSlider && mSlider.closest('.ss-row');
  const fRow = fSlider && fSlider.closest('.ss-row');
  if (mRow) mRow.classList.toggle('muted', musicVolume === 0);
  if (fRow) fRow.classList.toggle('muted', sfxVolume === 0);
}

/* The sound settings live in the pause/objective menu, under Leaderboard.
   They used to be a control floating over the playfield, which covered the
   town and could be knocked while placing tools. */
(function initVolumeUI() {
  const mSlider = document.getElementById('musicSlider');
  const fSlider = document.getElementById('sfxSlider');
  if (!mSlider || !fSlider) return;

  // 'input' rather than 'change' so the level follows the finger as it drags.
  mSlider.addEventListener('input', () => setMusicVolume(parseInt(mSlider.value, 10) / 100));
  fSlider.addEventListener('input', () => {
    setSfxVolume(parseInt(fSlider.value, 10) / 100);
    playSound('click');          // audible preview of the level just chosen
  });

  updateVolumeUI();
})();

resizeCanvas(); 
showObjectiveSelection();
requestAnimationFrame((t) => { lastT = t; loop(t); });