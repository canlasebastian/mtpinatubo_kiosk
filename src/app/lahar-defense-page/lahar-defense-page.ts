import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-lahar-defense-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lahar-defense-page.html',
  styleUrl: './lahar-defense-page.css',
})
export class LaharDefensePage implements OnInit, OnDestroy {
  gameUrl: SafeResourceUrl;
  gameStarted = false;

  /* ── Welcome-screen music ──────────────────────────────────────────
     On disk:  public\lahar-defense\assets\audio\welcome_screen_music.mp3
     public/ is the web root, so it is served from the URL below. No
     percent-encoding is needed — neither the folder nor the file contains
     spaces. If the file is ever renamed, the load error is logged with the
     exact URL that was tried rather than failing silently.              */
  private static readonly MUSIC_URL =
    '/lahar-defense/assets/audio/welcome_screen_music.mp3';

  /* Ceiling for the welcome track, scaled by the player's Music setting.
     Raised from 0.18: at that level it was almost inaudible over a busy
     gallery, especially through small kiosk speakers. 0.5 is loud enough
     to carry while still leaving the Music slider real range above and
     below it — the visitor can still take it down to nothing. */
  private static readonly MUSIC_VOLUME = 0.5;

  /* ── Volume ──────────────────────────────────────────────────────────
     The welcome screen no longer carries its own control. The single
     source of truth is the Music slider in the game's own menu, stored in
     localStorage; this page reads that level for its background track and
     follows it live when the visitor changes it mid-session (the game
     posts 'lahar-music:<level>' out of the iframe).

     The Tap-to-Begin chime is an effect, not music, so it follows the
     Effects slider instead — muting the music must not silence the button. */
  private static readonly MUSIC_KEY  = 'laharaya.musicVolume';
  private static readonly SFX_KEY    = 'laharaya.sfxVolume';
  private static readonly LEGACY_KEY = 'laharaya.volume';   // pre-split setting

  private musicLevel = 0.7;
  private sfxLevel = 0.7;

  private readLevel(key: string): number | null {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return null;
      const v = parseFloat(raw);
      return isNaN(v) ? null : Math.max(0, Math.min(1, v));
    } catch { return null; }        // locked-down kiosk / private mode
  }

  private loadVolume(): void {
    const legacy = this.readLevel(LaharDefensePage.LEGACY_KEY);
    this.musicLevel = this.readLevel(LaharDefensePage.MUSIC_KEY) ?? legacy ?? 0.7;
    this.sfxLevel   = this.readLevel(LaharDefensePage.SFX_KEY)   ?? legacy ?? 0.7;
  }

  /** Applied whenever the level changes, including while the track plays. */
  private applyMusicLevel(): void {
    if (this.music) {
      this.music.volume = LaharDefensePage.MUSIC_VOLUME * this.musicLevel;
    }
  }

  private music?: HTMLAudioElement;
  private fadeTimer?: number;
  private unlockHandler?: () => void;

  constructor(private sanitizer: DomSanitizer, private router: Router) {
    this.gameUrl = this.sanitizer.bypassSecurityTrustResourceUrl('/lahar-defense/index.html');
  }

  ngOnInit(): void {
    // Neither the welcome screen nor the game itself needs the kiosk's
    // shared footer/help button — the welcome screen has its own Home
    // button, and the game has its own full-screen HUD. Stays hidden for
    // the entire time this page is active; restored in ngOnDestroy.
    document.body.classList.add('hide-kiosk-chrome');
    this.loadVolume();
    this.startMusic();
  }

  private startMusic(): void {
    const audio = new Audio(LaharDefensePage.MUSIC_URL);
    audio.loop = true;
    audio.volume = 0;               // faded up, so it never starts abruptly
    audio.preload = 'auto';

    // Without this a wrong path fails completely silently, which is
    // indistinguishable from the audio simply not working.
    audio.addEventListener('error', () => {
      console.warn('[lahar] Welcome music failed to load: ' + LaharDefensePage.MUSIC_URL);
      this.music = undefined;
    }, { once: true });

    this.music = audio;
    audio.addEventListener('canplaythrough', () => this.playMusic(), { once: true });
    audio.load();
  }

  private playMusic(): void {
    const audio = this.music;
    if (!audio || this.gameStarted) return;
    audio.play()
      .then(() => this.fadeTo(audio, LaharDefensePage.MUSIC_VOLUME * this.musicLevel, 1200))
      .catch(() => {
        /* Autoplay refused because the document has had no user gesture yet.
           The only controls here are START and Home, and START leaves at
           once — so a naive retry would start the track and kill it in the
           same tap. This listens on the CAPTURE phase (before the button's
           own handler) and refuses to start once the game is running. */
        this.removeUnlockHandler();
        this.unlockHandler = () => {
          if (this.music && this.music.paused && !this.gameStarted) {
            this.music.play()
              .then(() => this.fadeTo(this.music!, LaharDefensePage.MUSIC_VOLUME * this.musicLevel, 600))
              .catch(() => {});
          }
          this.removeUnlockHandler();
        };
        window.addEventListener('pointerdown', this.unlockHandler, { capture: true, once: true });
      });
  }

  private removeUnlockHandler(): void {
    if (this.unlockHandler) {
      window.removeEventListener('pointerdown', this.unlockHandler, { capture: true } as any);
      this.unlockHandler = undefined;
    }
  }

  /** Linear fade so the music never pops in or cuts out. */
  /* Linear fade so the music never pops in or cuts out.
     Operates on an audio element passed IN, not on this.music. The previous
     version read this.music on every tick, and stopMusic() cleared that
     reference as soon as the fade began — so the very first tick bailed out
     and the callback that pauses the track never ran. The music faded to
     nothing but kept playing, which is why Home and Tap-to-Begin appeared
     to do nothing. */
  private fadeTo(audio: HTMLAudioElement, target: number, ms: number, onDone?: () => void): void {
    if (this.fadeTimer) { clearInterval(this.fadeTimer); this.fadeTimer = undefined; }
    const step = 40;
    const ticks = Math.max(1, Math.round(ms / step));
    const delta = (target - audio.volume) / ticks;
    this.fadeTimer = window.setInterval(() => {
      const next = audio.volume + delta;
      const done = delta >= 0 ? next >= target : next <= target;
      audio.volume = Math.min(1, Math.max(0, done ? target : next));
      if (done) {
        clearInterval(this.fadeTimer);
        this.fadeTimer = undefined;
        if (onDone) onDone();
      }
    }, step);
  }

  /** Fades out and genuinely stops the track. */
  private stopMusic(): void {
    this.removeUnlockHandler();
    const audio = this.music;
    this.music = undefined;          // no new play() can target it now
    if (!audio) return;
    this.fadeTo(audio, 0, 450, () => { audio.pause(); audio.currentTime = 0; });
    /* Safety net: if anything clears the fade timer before it finishes
       (a second stop, or the component being torn down mid-fade), the
       element would keep playing. Force it silent shortly after. */
    window.setTimeout(() => { audio.pause(); audio.currentTime = 0; }, 600);
  }

  /** Immediate, unconditional stop — used when the view is being destroyed. */
  private killMusic(): void {
    this.removeUnlockHandler();
    if (this.fadeTimer) { clearInterval(this.fadeTimer); this.fadeTimer = undefined; }
    const audio = this.music;
    this.music = undefined;
    if (audio) { audio.pause(); audio.currentTime = 0; audio.src = ''; }
  }

  ngOnDestroy(): void {
    // Always restore it on the way out, no matter which button sent the
    // visitor away, so no other page inherits this page's UI state.
    document.body.classList.remove('hide-kiosk-chrome');
    // Always kill the audio on the way out, or it keeps playing over
    // whatever page the visitor lands on next. No fade here — the view is
    // already being torn down, so a timed fade may never finish.
    this.killMusic();
  }

  // The game's own "Exit to Menu" button (inside its Menu overlay) posts
  // 'exit-lahar-game' to window.parent when tapped, since it has no
  // knowledge of Angular routing from inside the iframe. This is the
  // Angular-side half of that bridge — origin-checked so only messages
  // from this same-origin iframe are ever acted on.
  @HostListener('window:message', ['$event'])
  onGameMessage(event: MessageEvent): void {
    if (event.origin !== window.location.origin) return;
    if (typeof event.data === 'string' && event.data.startsWith('lahar-music:')) {
      // The visitor moved the Music slider in the game's menu.
      const v = parseFloat(event.data.slice('lahar-music:'.length));
      if (!isNaN(v)) { this.musicLevel = Math.max(0, Math.min(1, v)); this.applyMusicLevel(); }
      return;
    }
    if (event.data === 'lahar-game-started') {
      // Real play has begun — fade the welcome music out so it does not sit
      // under the simulation's own rain and alarm audio.
      this.stopMusic();
      return;
    }
    if (event.data === 'exit-lahar-game') {
      this.router.navigate(['/menu']);
    }
  }

  startGame(): void {
    this.playBeginSound();
    /* The music deliberately keeps playing here. Tap-to-Begin only swaps in
       the game frame, which opens on its briefing and town-selection
       screens — silence there would feel like something broke. It stops
       when the simulation actually starts, which the game announces with a
       'lahar-game-started' message (see onGameMessage). */
    this.gameStarted = true;
  }

  /* Short confirm chime for Tap-to-Begin. Synthesised with Web Audio rather
     than loaded from a file so it needs no asset and cannot 404 — swap in an
     <audio> source here if you would rather use your own effect. */
  private playBeginSound(): void {
    try {
      const Ctx: typeof AudioContext =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const master = ctx.createGain();
      // Raised alongside the music so the confirm chime is not drowned out
      // by the track it plays over.
      master.gain.value = 0.45 * this.sfxLevel; // a cue, so it follows Effects
      master.connect(ctx.destination);
      // Two quick rising notes — reads as "confirmed / here we go".
      [[660, 0], [990, 0.09]].forEach(([freq, at]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + at);
        gain.gain.exponentialRampToValueAtTime(1, now + at + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.26);
        osc.connect(gain); gain.connect(master);
        osc.start(now + at);
        osc.stop(now + at + 0.3);
      });
      window.setTimeout(() => ctx.close().catch(() => {}), 800);
    } catch { /* audio unavailable — the button still works */ }
  }

  // Welcome screen's Home button — always goes straight to the menu,
  // unlike goBack() below which retraces wherever the visitor came from.
  goHome(): void {
    this.stopMusic();
    this.router.navigate(['/menu']);
  }

  goBack(): void {
    const previous = sessionStorage.getItem('kioskPreviousRoute');
    if (previous && previous !== '/lahar-defense') {
      this.router.navigateByUrl(previous);
    } else {
      this.router.navigate(['/menu']);
    }
  }
}