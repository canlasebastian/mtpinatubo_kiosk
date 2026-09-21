import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, AfterViewInit, OnDestroy, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type ChapterId = 'before-1991' | 'early-unrest' | 'escalating-unrest' | 'eruption' | 'aftermath';
type Phenomenon = 'ash' | 'bomb' | 'lava' | 'steam';
type EruptionPhase = 'idle' | 'rumble' | 'rising' | 'pressure' | 'burst' | 'overflow' | 'cooling';

interface ChapterStat {
  icon: string;
  label: string;
  value: string;
}

interface Chapter {
  id: ChapterId;
  numeral: string;
  title: string;
  year: string;
  icon: string;
  description: string;
  bullets: string[];
  stats: ChapterStat[];
  image?: string;
  photoDate?: string;
}

interface AftermathStat {
  label: string;
  value: string;
  hint: string;
}

interface CameraView {
  position: [number, number, number];
  target: [number, number, number];
}

/** One turbulent billow cell within the eruption column. */
interface PlumeEddy {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  targetRadius: number;
  life: number;
  spin: number;
  rise: number;
}

interface EruptionOutcome {
  vei: string; title: string; narrative: string;
  kind: Phenomenon; plumeHeightKm: number; pyroclasticFlow: boolean;
  lavaFlowKm: number; hazardLevel: string;
  pressureNote: string; waterNote: string; viscosityNote: string;
  ashColor: number;
}

@Component({
  selector: 'app-simulator-component',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './simulator-component.html',
  styleUrl: './simulator-component.css',
})
export class SimulatorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  // ================= CHAPTERS (Mount Pinatubo, 1991) =================

  readonly chapters: Chapter[] = [
    {
      id: 'before-1991', numeral: '1', title: 'Before 1991', year: 'Dormant since c. 1500', icon: '🌲',
      description: 'For more than four centuries Pinatubo sat quiet in the Zambales Mountains of Central Luzon, unremarkable enough that most regional maps barely named it. The Aeta people had lived on its slopes for generations. Nothing about its gentle, forested profile suggested it was one of the most dangerous volcanoes in the Philippines.',
      bullets: [
        'Last confirmed eruption roughly 500 years earlier',
        'A densely vegetated, gently sloped stratovolcano in the Zambales Range',
        'Home to the indigenous Aeta community',
      ],
      stats: [
        { icon: '📈', label: 'Seismicity', value: 'None detected' },
        { icon: '💨', label: 'Steam Emissions', value: 'None' },
        { icon: '⛰️', label: 'Ground Deformation', value: 'Stable' },
        { icon: '⚠️', label: 'Alert Level', value: 'Normal' },
      ],
      image: 'assets/images/fig2a.jpg',
      photoDate: '1990',
    },
    {
      id: 'early-unrest', numeral: '2', title: 'Early Unrest', year: 'March \u2013 April 1991', icon: '📳',
      description: 'A magnitude 7.8 regional earthquake in July 1990 had triggered a brief, unremarkable stir of steam and small quakes before Pinatubo went quiet again. Real unrest began on March 15, 1991, when villagers on the volcano\u2019s northwest flank started feeling tremors of their own. Weeks later, on April 2, a line of small explosions tore across the upper north flank \u2014 phreatic blasts, groundwater flashing to steam against rising heat, not magma itself reaching the surface yet.',
      bullets: [
        'Villagers at Sitios Tarao and Yamut felt the season\u2019s first tremors on March 15',
        'The April 2 explosions ejected only old rock \u2014 no fresh magma, confirming a steam-driven origin',
        'A seismic network installed within days logged tens to hundreds of quakes a day',
      ],
      stats: [
        { icon: '📈', label: 'Seismicity', value: 'Felt locally' },
        { icon: '💨', label: 'Steam Emissions', value: 'Beginning' },
        { icon: '⛰️', label: 'Ground Deformation', value: 'Stable' },
        { icon: '⚠️', label: 'Alert Level', value: 'Low' },
      ],
      image: 'assets/images/fig4a.jpg',
      photoDate: 'April 1991',
    },
    {
      id: 'escalating-unrest', numeral: '3', title: 'Escalating Unrest', year: 'May \u2013 June 14, 1991', icon: '⚡',
      description: 'Beneath the still-outwardly-calm summit, fresh magma pushed toward the surface through Mount Pinatubo\u2019s own plumbing. In mid-May, sulfur dioxide output spiked, then puzzlingly collapsed \u2014 a sealed conduit trapping gas-charged magma under mounting pressure instead of releasing it safely. By June 7, seismicity had rocketed to 1,500 quakes a day and a small lava dome broke the surface just northwest of the summit; explosions on June 12 and 13 sent ash 19 and then 25 kilometers up, each one a rehearsal for what was coming.',
      bullets: [
        'A newly installed tilt network detected the ground swelling on the upper east flank',
        '14,400 personnel evacuated Clark Air Base on June 10 alone',
        'June 12 (Philippine Independence Day) produced the first sub-Plinian column, ~19 km high',
      ],
      stats: [
        { icon: '📈', label: 'Seismicity', value: 'Increasing' },
        { icon: '💨', label: 'Steam Emissions', value: 'High' },
        { icon: '⛰️', label: 'Ground Deformation', value: 'Continuing Inflation' },
        { icon: '⚠️', label: 'Alert Level', value: 'Warning' },
      ],
      image: 'assets/images/fig3b.jpg',
      photoDate: 'June 9, 1991',
    },
    {
      id: 'eruption', numeral: '4', title: 'The 1991 Eruption', year: 'June 15, 1991', icon: '🌋',
      description: 'On the afternoon of June 15, with Typhoon Yunya battering the region at the very same time, Pinatubo let go in a colossal Plinian eruption \u2014 hurling an ash column more than 35 kilometers into the stratosphere while pyroclastic density currents raced down every flank of the mountain.',
      bullets: [],
      stats: [
        { icon: '📈', label: 'Seismicity', value: 'Continuous tremor' },
        { icon: '🌋', label: 'Ash Column', value: '>35 km' },
        { icon: '💥', label: 'Pyroclastic Flows', value: 'Active' },
        { icon: '⚠️', label: 'Alert Level', value: 'Maximum' },
      ],
      image: 'assets/images/fig4b.jpg',
      photoDate: 'June 15, 1991',
    },
    {
      id: 'aftermath', numeral: '5', title: 'Aftermath', year: 'After June 1991', icon: '🏞️',
      description: 'When the explosions finally stopped, the mountain had lost its summit to a wide new caldera, and Pampanga, Tarlac, and Zambales all lay under a blanket of grey ash. Renewed dome growth continued intermittently into 1992. Within months, rain and groundwater began collecting in the caldera floor \u2014 the first stage of what would become Lake Pinatubo, still slowly deepening years later.',
      bullets: [],
      stats: [
        { icon: '📈', label: 'Seismicity', value: 'Declining' },
        { icon: '💨', label: 'Ashfall', value: 'Settling' },
        { icon: '⛰️', label: 'Summit', value: 'Caldera collapsed' },
        { icon: '⚠️', label: 'Alert Level', value: 'Reducing' },
      ],
      image: 'assets/images/pttl6.jpg',
      photoDate: 'March 1992',
    },
  ];

  readonly aftermathStatus: { label: string; value: string }[] = [
    { label: 'Eruption', value: 'Ended' },
    { label: 'Major eruption', value: 'June 15, 1991' },
    { label: 'Aftermath', value: 'Ongoing' },
    { label: 'Lahars', value: 'Continuing through the 1990s' },
    { label: 'Crater', value: 'Post-eruption caldera' },
    { label: 'Crater lake', value: 'Forming — later aftermath' },
  ];

  readonly aftermathStats: AftermathStat[] = [
    { label: 'VEI', value: '6', hint: 'Ultra-Plinian — the second-largest eruption of the 20th century' },
    { label: 'Ash Column', value: '~35 km', hint: 'Height the eruption column reached into the stratosphere' },
    { label: 'People Evacuated', value: '200,000+', hint: 'Residents, Aeta communities, and Clark Air Base personnel moved to safety' },
    { label: 'Lives Lost', value: '847', hint: 'Most from wet ash collapsing roofs during Typhoon Yunya, which struck at the same time' },
    { label: 'Economic Damage', value: '~$700M', hint: 'Crops, infrastructure, evacuation, and lahar-control costs combined' },
    { label: 'Global Cooling', value: '~0.5\u00B0C', hint: 'Average drop in global temperatures for about two years afterward' },
  ];

  // Framing deliberately keeps the volcano central but pulls back far enough that the
  // surrounding plain, settlements and ranges stay in shot — foreground terrain, mid-ground
  // towns and rivers, Pinatubo at centre, ranges and sky behind.
  private readonly cameraViews: Record<ChapterId, CameraView> = {
    'before-1991': { position: [0, 21, 59], target: [0, 8, 0] },
    'early-unrest': { position: [-19, 19, 46], target: [0, 9, 0] },
    'escalating-unrest': { position: [16, 17, 40], target: [0, 11, 0] },
    // Pulled back and raised: the plume now builds a tall, wide umbrella and the old
    // framing cropped its top off.
        'eruption': { position: [0, 34, 95], target: [0, 45, 0] },
    // Widest view of all — in the aftermath the changed landscape is the subject, not the vent.
    'aftermath': { position: [0, 27, 70], target: [0, 5, 0] },
  };

  chapterIndex = 0;
  maxUnlocked = 0;
  eruptionWitnessed = false;
  bars = Array(15).fill(0);
  audioMuted = false;
  showAbout = false;
  

  private readonly outcome: EruptionOutcome = {
    vei: 'VEI 6 \u2014 Pinatubo, 1991', title: 'Ultra-Plinian Climax',
    narrative: 'Highly gas-charged magma met a groundwater system already primed by weeks of precursor explosions, producing one of the most powerful eruptions of the 20th century.',
    kind: 'ash', plumeHeightKm: 35, pyroclasticFlow: true, lavaFlowKm: 3, hazardLevel: 'Extreme',
    pressureNote: 'Extreme \u2014 gas-charged magma trapped enormous pressure for weeks',
    waterNote: 'Groundwater flashing to steam amplified the explosion',
    viscosityNote: 'Thick, gas-rich magma prone to violent fragmentation',
    ashColor: 0xc3cad4,
  };

  constructor(private router: Router  ) {}
  
    goBack(): void {
      const previous = sessionStorage.getItem('kioskPreviousRoute');
      if (previous && previous !== '/apo-pinatubo') {
        this.router.navigateByUrl(previous);
      } else {
        this.router.navigate(['/menu']);
      }
    }

  get currentChapter(): Chapter {
    return this.chapters[this.chapterIndex];
  }

  get progressPercent(): number {
    return Math.round((this.chapterIndex / (this.chapters.length - 1)) * 100);
  }

  get seismicLevel(): number {
    return Math.round(Math.min(1, this.shakeAmount / 0.12) * 100);
  }

  get canGoBack(): boolean {
    return this.chapterIndex > 0 && !this.isErupting;
  }

  get canGoNext(): boolean {
    return this.chapterIndex < this.chapters.length - 1 && this.currentChapter.id !== 'eruption';
  }

  trackChapter(_: number, c: Chapter): ChapterId {
    return c.id;
  }

  isUnlocked(i: number): boolean {
    return i <= this.maxUnlocked;
  }

  goToChapter(i: number): void {
    if (!this.isUnlocked(i) || i === this.chapterIndex || this.isErupting) return;
    this.initAudio();
    this.chapterIndex = i;
    this.onEnterChapter();
  }

  goNext(): void {
    if (!this.canGoNext) return;
    this.initAudio();
    this.chapterIndex++;
    this.maxUnlocked = Math.max(this.maxUnlocked, this.chapterIndex);
    this.onEnterChapter();
  }

  goPrevious(): void {
    if (!this.canGoBack) return;
    this.initAudio();
    this.chapterIndex--;
    this.onEnterChapter();
  }

  continueToAftermath(): void {
    if (!this.eruptionWitnessed) return;
    clearTimeout(this.phaseTimer);
    clearTimeout(this.eruptionBurstTimer);
    this.phase = 'idle';
    this.chapterIndex = this.chapters.length - 1;
    this.maxUnlocked = this.chapterIndex;
    this.onEnterChapter();
  }

  onImageError(event: Event): void {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  toggleMute(): void {
    this.audioMuted = !this.audioMuted;
    if (!this.audioCtx) { this.initAudio(); return; }
    if (this.audioMaster) {
      this.audioMaster.gain.setTargetAtTime(this.audioMuted ? 0 : 0.35, this.audioCtx.currentTime, 0.15);
    }
    this.applyAudioProfile();
  }

  private onEnterChapter(): void {
    clearTimeout(this.quakeTimer);
    clearTimeout(this.precursorPuffTimer);
    this.applyAudioProfile();

    const view = this.cameraViews[this.currentChapter.id];
    this.flyCameraTo(view.position, view.target, 2200);


    this.fumarolesActive = false;
    this.rockfallsActive = false;
    this.rockfallIntensity = 1;
    this.rainActive = false;
    this.stormIntensityTarget = 0;
    this.rainIntensityTarget = 0;
    // Chapters are a timeline: stepping back before June 15 restores the intact summit.
    // The 'eruption' and 'aftermath' cases below override this.
    this.calderaCollapseTarget = 0;
    // Sealed by default in every stage. Only the eruption sequence opens it, and the
    // aftermath keeps it open — so stepping back to an earlier chapter re-seals the summit.
    this.craterOpenTarget = 0;

    switch (this.currentChapter.id) {
      case 'before-1991':
        this.craterFillTarget = 0;
        this.smokeTarget = 0;
        this.magmaBaseGlowTarget = 0;
        this.shakeAmount = 0;
        this.landscapeAshTarget = 0;
        this.skyDarknessTarget = 0;
        this.crackVisibilityTarget = 0;
        this.lakeFormationTarget = 0;
        break;

      case 'early-unrest':
        this.craterFillTarget = 0.1;
        this.smokeTarget = 0.05;
        this.magmaBaseGlowTarget = 0;
        this.fumarolesActive = true;
        this.crackVisibilityTarget = 0.4;
        this.landscapeAshTarget = 0;
        this.startQuakePulses(0.01, 0.024, 3800);
        break;

      case 'escalating-unrest':
        this.craterFillTarget = 0.35;
        this.smokeTarget = 0.55;
        this.magmaBaseGlowTarget = 0.12;
        this.fumarolesActive = true;
        this.rockfallsActive = true;
        this.crackVisibilityTarget = 1;
        this.skyDarknessTarget = 0.55;
        this.landscapeAshTarget = 0.2;
        this.startQuakePulses(0.035, 0.08, 2000);
        this.startPrecursorPuffs();
        break;

      case 'eruption':
        this.skyDarknessTarget = 0.85;
        this.landscapeAshTarget = 0.35;
        // Standing on the mountain before the trigger: Yunya is already visible on approach,
        // so the sky is heavy and the first rain is falling, but the summit is still intact.
        this.stormIntensityTarget = 0.3;
        this.rainIntensityTarget = 0.18;
        this.rainActive = true;
        if (this.phase === 'idle') {
          this.calderaCollapseTarget = 0;
          this.craterOpenTarget = 0;   // still sealed until the viewer triggers it
        } else {
          this.craterOpenTarget = 1;   // mid-sequence: leave the vent open
        }
        break;

      case 'aftermath':
        // --- HARD STOP: the eruption is over. Everything that produces active eruption
        // --- visuals is shut down here, not left to decay on its own.
        clearTimeout(this.phaseTimer);
        clearTimeout(this.eruptionBurstTimer);
        clearInterval(this.plumeCountUpId);
        clearTimeout(this.stormDoubleStrikeTimer);
        this.phase = 'idle';
        this.clearEruptionParticles();   // ash column, bombs, surges, bubbles, bolts, billow cells
            this.shakeAmount = 0;
        this.rockfallsActive = false;
        this.rockfallIntensity = 1;
        this.displayedPlume = 0;
        if (this.stormFlashLight) this.stormFlashLight.intensity = 0;
        if (this.lightningLight) this.lightningLight.intensity = 0;

        // No magma glow, no ash column — only a thin steam wisp off a cooling crater.
        this.craterFillTarget = 0.42;    // the basin fills, but with water, not magma
        this.smokeTarget = 0.06;
        this.magmaBaseGlowTarget = 0;
        this.fumarolesActive = true;     // residual steam is historically right and reads as "cooling"

        // Calm, subdued atmosphere: the sky clears rather than staying eruption-dark.
        this.skyDarknessTarget = 0.18;
        this.landscapeAshTarget = 1;     // but the land stays buried
        this.crackVisibilityTarget = 0.5;
        this.lakeFormationTarget = 1;

        // The caldera is a permanent scar — it stays open regardless of how the viewer got here.
        this.calderaCollapseTarget = 1;
        this.craterOpenTarget = 1;

        // Storm gone. Steady rain remains, because that is what filled the caldera and what
        // drove the lahars for years afterwards — the consequences continue.
        this.stormIntensityTarget = 0;
        this.rainActive = true;
        this.rainIntensityTarget = 0.4;
        break;
    }
  }

  private startQuakePulses(min: number, max: number, baseMs: number): void {
    clearTimeout(this.quakeTimer);
    const tick = () => {
      this.shakeAmount = Math.max(this.shakeAmount, min + Math.random() * (max - min));
      this.quakeTimer = setTimeout(tick, baseMs + Math.random() * 1500);
    };
    this.quakeTimer = setTimeout(tick, baseMs + Math.random() * 1500);
  }

  /** The June 7–14 precursor explosions were discrete, separate events — not sustained activity.
   *  A small, infrequent puff (with a matching quiet boom) reads very differently from both the
   *  ambient unrest of earlier chapters and the continuous bursts of the climax itself. */
  private startPrecursorPuffs(): void {
    clearTimeout(this.precursorPuffTimer);
    const tick = () => {
      if (this.currentChapter.id !== 'escalating-unrest') return;
      this.spawnEjecta(0.1);
      this.playBoom();
      this.shakeAmount = Math.max(this.shakeAmount, 0.06);
      this.precursorPuffTimer = setTimeout(tick, 9000 + Math.random() * 7000);
    };
    this.precursorPuffTimer = setTimeout(tick, 5000 + Math.random() * 4000);
  }

  replay(): void {
    clearTimeout(this.phaseTimer);
    clearInterval(this.plumeCountUpId);
    clearTimeout(this.quakeTimer);
    clearTimeout(this.precursorPuffTimer);
    clearTimeout(this.eruptionBurstTimer);
    this.clearEruptionParticles();

    this.rockfallIntensity = 1;

    // Snap the summit and the weather back to their pre-eruption state for a clean re-run.
    this.calderaCollapse = 0;
    this.calderaCollapseTarget = 0;
    this.craterOpen = 0;          // re-seal the summit
    this.craterOpenTarget = 0;
    this.stormIntensity = 0;
    this.stormIntensityTarget = 0;
    this.rainIntensity = 0;
    this.rainIntensityTarget = 0;
    if (this.stormFlashLight) this.stormFlashLight.intensity = 0;
    this.updateCalderaGeometry();

    this.phase = 'idle';
    this.shakeAmount = 0;
    this.smokeTarget = 0.12;
    this.craterFillTarget = 0;
    this.craterFill = 0;
    this.displayedPlume = 0;
    this.eruptionWitnessed = false;

    this.chapterIndex = 0;
    this.maxUnlocked = 0;
    this.onEnterChapter();
  }

  /** "Home" in the header bar jumps back to the first chapter without discarding progress
   *  already unlocked (unlike replay(), which resets everything for a full re-run). */
  goHome(): void {
    this.goToChapter(0);
  }

  toggleAbout(): void {
    this.showAbout = !this.showAbout;
  }

  phase: EruptionPhase = 'idle';
  displayedPlume = 0;

  get isErupting(): boolean { return this.phase !== 'idle' && this.phase !== 'cooling'; }

  /** Where plume material leaves the mountain.
   *
   *  While the crater is sealed the lava pool is buried inside the edifice, so anything emitted
   *  at the pool's height would be hidden inside solid rock. Taking the higher of the summit
   *  surface and the pool surface keeps smoke rising from the top of the mountain when it is
   *  closed, and from the lava once the vent has opened — with no switch or special case. */
  private get ventTopY(): number {
    return Math.max(this.sampleTerrainHeight(0, 0), this.lavaMesh.position.y);
  }

  // ---- three.js core ----
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private clock = new THREE.Clock();
  private rafId = 0;
  private resizeObserver!: ResizeObserver;

  // ---- volcano ----
  private mountainMesh!: THREE.Mesh;
  private groundMesh!: THREE.Mesh;
  private lavaMesh!: THREE.Mesh;
  private lavaLight!: THREE.PointLight;
  private lavaMaterial!: THREE.MeshStandardMaterial;
  /** Captured from onBeforeCompile so the injected magma uniforms can be updated per frame. */
  private lavaShader: any = null;
  private craterDepth = 4.3;

  // ---- volcano scale (single source of truth: buildMountain and sampleTerrainHeight both
  //      derive from these, so the mesh and the height sampler can never drift apart) ----
  /** Base radius. Was 12 — doubled so the edifice spreads across the scene instead of
   *  sitting as a small mound. */
  private readonly EDIFICE_RADIUS = 40;
  /** Summit elevation above the surrounding plain. Was 14. */
  private readonly SUMMIT_HEIGHT = 23;
  /** Radius of the summit plateau, which is also the crater rim. */
  private readonly CRATER_RIM_R = 6.8;
  /** How far the caldera rim migrates outward as it collapses (fraction of CRATER_RIM_R). */
  private readonly CALDERA_WIDEN = 0.9;
  /** How far the caldera floor drops, as a multiple of craterDepth.
   *  This single value is used by BOTH the geometry carve and the lava/lake surface in the
   *  render loop. They were two separate 0.62 literals before; if they ever disagree the
   *  crater lake floats above the floor or sinks through it. */
  private readonly CALDERA_DROP = 2.36;
  /** ridgeProfile/gullyProfile were tuned against the old 12-unit radius, so their inputs are
   *  scaled back into that space rather than rewriting those shared functions. */
  private readonly RIDGE_SCALE = 12 / this.EDIFICE_RADIUS;
  private craterFloorY = 0;
  private craterRimY = 0;
  private craterFill = 0;
  private craterFillTarget = 0;

  // ---- ambient environmental targets (drive material/light state across chapters) ----
  private magmaBaseGlow = 0;
  private magmaBaseGlowTarget = 0;
  private skyDarkness = 0;
  private skyDarknessTarget = 0;
  private landscapeAsh = 0;
  private landscapeAshTarget = 0;
  private lakeFormation = 0;
  private lakeFormationTarget = 0;

  // ---- magma bubbles (boiling lava surface once the crater has opened up) ----
  private magmaBubbles: { mesh: THREE.Mesh; life: number; maxScale: number; popped: boolean; angle: number; dist: number }[] = [];
  private bubbleGeo!: THREE.SphereGeometry;
  private bubbleTimer = 0;

  // ---- caldera collapse (the summit destroying itself during the climax) ----
  /** How far the summit vent has opened, 0 = sealed, 1 = fully open.
   *  Before the eruption the mountain has no hole at all; the eruption sequence opens it. */
  private craterOpen = 0;
  private craterOpenTarget = 0;

  private calderaCollapse = 0;
  private calderaCollapseTarget = 0;
  private lastAppliedCollapse = -1;
  private mountainBasePositions!: Float32Array;
  /** Per-vertex distance from the summit axis, used to re-carve the caldera at runtime. */
  private mountainCraterDists!: Float32Array;
  private lakeIslands: THREE.Mesh[] = [];

  // ---- storm weather (Typhoon Yunya, which hit during the June 15 eruption) ----
  private stormIntensity = 0;
  private stormIntensityTarget = 0;
  private rainIntensity = 0;
  private rainIntensityTarget = 0;
  private stormFlashLight!: THREE.DirectionalLight;
  private stormFlashTimer = 2;
  private lightningBolts: { mesh: THREE.Mesh; life: number }[] = [];

  private readonly skyCalm = { top: new THREE.Color(0x2a2350), horizon: new THREE.Color(0xff8a52), bottom: new THREE.Color(0x3a2420) };
  private readonly skyDark = { top: new THREE.Color(0x120f14), horizon: new THREE.Color(0x6b4a3a), bottom: new THREE.Color(0x1a1512) };
  private readonly fogCalm = new THREE.Color(0x8a5a48);
  private readonly fogDark = new THREE.Color(0x2a2018);
  private readonly noTint = new THREE.Color(0xffffff);
  private readonly ashTint = new THREE.Color(0x8f857a);
  private readonly groundBaseColor = new THREE.Color(0x2e2318);
  private readonly groundAshColor = new THREE.Color(0x6b6258);
  private readonly lavaBaseColor = new THREE.Color(0x2a0d02);
  private readonly lakeColor = new THREE.Color(0x2a3a42);


  // ---- smoke / steam ----
  private smokeGroup = new THREE.Group();
  private smokeSprites: { sprite: THREE.Sprite; vy: number; seed: number }[] = [];
  private smokeTexture!: THREE.Texture;
  private smokeIntensity = 0.12;
  private smokeTarget = 0.12;

  // ---- ash/ejecta particles ----
  private ejectaGroup = new THREE.Group();
  private ejecta: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; spin: THREE.Vector3; size: number; bomb: boolean; swirl: number; radialJitter: number; eddy: PlumeEddy | null; offset: THREE.Vector3 }[] = [];

  /** Turbulent billow cells inside the plume. Ash particles are bound to one of these rather than
   *  to the column axis, which is the whole reason the plume can look like clouds forming,
   *  expanding, merging and tearing apart instead of a fixed-radius tube. */
  private plumeEddies: PlumeEddy[] = [];
  private eddyTimer = 0;
  /** Slowly-veering high-altitude wind. Applied in proportion to height, so the plume shears
   *  and leans downwind — the single most effective way to kill the symmetry of the old cone. */
  private plumeWind = new THREE.Vector3();
  private windSeed = Math.random() * 1000;
  private stormDoubleStrikeTimer: any = null;
  // Shared geometries: one instance reused by every particle, so a dying particle can never
  // dispose geometry that its still-living siblings are rendering with.
  private ejectaGeoAsh!: THREE.SphereGeometry;
  private ejectaGeoBomb!: THREE.DodecahedronGeometry;
  private rockGeos: THREE.DodecahedronGeometry[] = [];

  // ---- shockwave rings (burst only) ----
  private shockwaves: { mesh: THREE.Mesh; life: number }[] = [];

  // ---- impact dust puffs (rockfall landings) ----
  private dustPuffs: { sprite: THREE.Sprite; life: number; vy: number }[] = [];

  // ---- sky ----
  private skyMesh!: THREE.Mesh;


  // ---- volcanic lightning (ash-rich plume only) ----
  private lightningLight!: THREE.PointLight;
  private lightningTimer = 0;

  // ---- camera flythrough between chapters ----
  private cameraFlying = false;
  private cameraFlyFrom = new THREE.Vector3();
  private cameraFlyToPos = new THREE.Vector3();
  private cameraFlyTargetFrom = new THREE.Vector3();
  private cameraFlyTargetTo = new THREE.Vector3();
  private cameraFlyElapsed = 0;
  private cameraFlyDuration = 1;

  // ---- terrain surface texture (replaces discrete tree instances with a procedural
  //      mottled ground-cover texture, layered under the existing vertex-color height gradient) ----
  private terrainTexture!: THREE.CanvasTexture;


  // ---- fumaroles (stages III & IV) ----
  private fumaroleVents: THREE.Vector3[] = [];
  private fumarolesActive = false;

  // ---- ground cracks (stages III & IV, remain scarred afterward) ----
  private cracksGroup = new THREE.Group();
  private crackMeshes: THREE.Mesh[] = [];
  private crackVisibility = 0;
  private crackVisibilityTarget = 0;

  // ---- rockfalls (stage IV) ----
  private rockfalls: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; spin: THREE.Vector3; radius: number; bounces: number }[] = [];
  private rockfallsActive = false;
  private rockfallTimer = 0;
  /** Scales rockfall spawn rate and size — raised during the eruption climax. */
  private rockfallIntensity = 1;

  // ---- pyroclastic density currents (stage V climax) ----
  private pyroclastic: { mesh: THREE.Mesh; angle: number; dist: number; speed: number; life: number }[] = [];

  // ---- rain / crater lake (stage VI) ----
  private rainPoints!: THREE.Points;
  private rainVelocities!: Float32Array;
  private readonly rainCount = 1400;
  private rainActive = false;

  // ---- static Central Luzon geographic context (background ranges, rivers, fields, landmarks) ----
  private geoGroup = new THREE.Group();
  private settlementMeshes: THREE.InstancedMesh[] = [];
  private vegetationMesh?: THREE.InstancedMesh;
  private riverPaths: { x: number; z: number; w: number }[][] = [];
  private provinceLabels: THREE.Sprite[] = [];
  private arayatMat?: THREE.MeshStandardMaterial;
  private fieldMesh?: THREE.InstancedMesh;
  private fieldBaseColors: THREE.Color[] = [];

  // ---- ambient audio (procedural — no external assets) ----
  private audioCtx: AudioContext | null = null;
  private audioMaster: GainNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private noiseGain: GainNode | null = null;
  private rumbleOsc: OscillatorNode | null = null;
  private rumbleGain: GainNode | null = null;

  private shakeAmount = 0;
  private phaseTimer: any = null;
  private plumeCountUpId: any = null;
  private quakeTimer: any = null;
  private precursorPuffTimer: any = null;
  private eruptionBurstTimer: any = null;

  // Shared noise field — used by both the mountain mesh AND the lava flow sampler,
  // so lava geometrically has to sit on the same surface the mountain was built from.
  private noiseSeed = Math.random() * 1000;

  ngAfterViewInit(): void {
    this.initScene();
    this.onEnterChapter();
    requestAnimationFrame(() => {
      this.onResize();
      this.animate();
    });
    this.resizeObserver = new ResizeObserver(() => this.onResize());
    this.resizeObserver.observe(this.canvasRef.nativeElement.parentElement!);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
    clearTimeout(this.phaseTimer);
    clearInterval(this.plumeCountUpId);
    clearTimeout(this.quakeTimer);
    clearTimeout(this.precursorPuffTimer);
    clearTimeout(this.eruptionBurstTimer);
    clearTimeout(this.stormDoubleStrikeTimer);
    this.resizeObserver?.disconnect();
    this.controls?.dispose();
    // Shared particle geometries are owned by the component, so this is the one place they're freed.
    this.ejectaGeoAsh?.dispose();
    this.ejectaGeoBomb?.dispose();
    this.bubbleGeo?.dispose();
    this.rockGeos.forEach((g) => g.dispose());
    this.renderer?.dispose();
    this.audioCtx?.close();
  }

  @HostListener('window:resize')
  onResize(): void {
    const el = this.canvasRef.nativeElement.parentElement!;
    const w = el.clientWidth, h = el.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // ================= CAMERA FLYTHROUGH =================

  private flyCameraTo(pos: [number, number, number], target: [number, number, number], durationMs: number): void {
    if (!this.camera || !this.controls) return;
    this.cameraFlyFrom.copy(this.camera.position);
    this.cameraFlyToPos.set(pos[0], pos[1], pos[2]);
    this.cameraFlyTargetFrom.copy(this.controls.target);
    this.cameraFlyTargetTo.set(target[0], target[1], target[2]);
    this.cameraFlyElapsed = 0;
    this.cameraFlyDuration = durationMs / 1000;
    this.cameraFlying = true;
  }

  private stepCameraFly(dt: number): void {
    if (!this.cameraFlying) return;
    this.cameraFlyElapsed += dt;
    const t = Math.min(1, this.cameraFlyElapsed / this.cameraFlyDuration);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic — brisk start, gentle settle
    this.camera.position.lerpVectors(this.cameraFlyFrom, this.cameraFlyToPos, eased);
    this.controls.target.lerpVectors(this.cameraFlyTargetFrom, this.cameraFlyTargetTo, eased);
    if (t >= 1) this.cameraFlying = false;
  }

  // ================= NOISE / TERRAIN SAMPLING =================

  private terrainNoise(x: number, z: number): number {
    const angle = Math.atan2(z, x);
    const dist = Math.sqrt(x * x + z * z);
    const n1 = Math.sin(angle * 7 + dist * 0.9 + this.noiseSeed) * 0.35;
    const n2 = Math.sin(angle * 17 - dist * 1.7 + this.noiseSeed * 1.3) * 0.15;
    const n3 = Math.sin(angle * 31 + dist * 2.6 + this.noiseSeed * 0.7) * 0.06;
    return n1 + n2 + n3;
  }

  /** Adds a handful of broad, unevenly-spaced peak bumps strung out along the x-axis, and damps
   *  height perpendicular to that axis — so the mid-slope silhouette reads as a long, jagged,
   *  multi-summit ridge (closer to Pinatubo's real pre-1991 profile, seen broadside from the
   *  camera's default framing) instead of one symmetric cone tip. Fully faded out near the base
   *  and near the crater rim, so the crater carve, lava vent, and every prop placed relative to
   *  it (fumaroles, cracks, rockfalls, rivers, lake island) stay exactly where they were.
   *  Shared identically by buildMountain() and sampleTerrainHeight(). */
  private ridgeProfile(x: number, z: number, heightFrac: number): number {
    const angle = Math.atan2(z, x);
    const axialWeight = 0.3 + 0.7 * Math.pow(Math.abs(Math.cos(angle)), 1.5);

    const peaks: { pos: number; width: number; amp: number }[] = [
      { pos: -7.5, width: 4.0, amp: 0.6 },
      { pos: -2.2, width: 3.4, amp: 1.05 },
      { pos: 2.6, width: 3.8, amp: 0.85 },
      { pos: 7.4, width: 3.2, amp: 0.5 },
    ];

    let bump = 0;
    for (const p of peaks) {
      const dx = x - p.pos;
      const dz = z * 0.65; // narrower tolerance across the ridge than along it
      const d2 = (dx * dx + dz * dz) / (p.width * p.width);
      bump += p.amp * Math.exp(-d2);
    }

    // Ramp in above the base, hold through the mid-slope, and fade out before the crater carve zone.
    const fade =
      heightFrac < 0.25 ? heightFrac / 0.25 :
      heightFrac < 0.55 ? 1 :
      heightFrac < 0.75 ? Math.max(0, 1 - (heightFrac - 0.55) / 0.2) : 0;

    return axialWeight * bump * fade * 3.4;
  }

  /** Radial drainage gullies — the deep, fan-shaped erosion channels that ran down Pinatubo's
   *  flanks before 1991 (and which the real lahars later followed). Carved as repeating V-notches
   *  around the cone, widening downslope, faded out at the summit so they never cut into the
   *  crater rim and at the base so they don't notch the silhouette's footprint.
   *  Shared identically by buildMountain() and sampleTerrainHeight(). */
  private gullyProfile(x: number, z: number, heightFrac: number): number {
    const angle = Math.atan2(z, x);
    const dist = Math.sqrt(x * x + z * z);

    // Two overlapping channel sets at different frequencies so spacing looks natural, not combed.
    const primary = Math.sin(angle * 11 + this.noiseSeed * 0.3);
    const secondary = Math.sin(angle * 19 - this.noiseSeed * 0.7) * 0.4;
    const channel = primary + secondary;
    const carve = 1 - Math.pow(Math.abs(channel) / 1.4, 0.55); // 1 in the channel floor, 0 on the spurs

    const fade =
      heightFrac > 0.72 ? Math.max(0, 1 - (heightFrac - 0.72) / 0.12) :
      heightFrac < 0.12 ? heightFrac / 0.12 : 1;

    const widen = Math.min(1, dist / 6); // channels start tight near the vent and open out downslope
    return -Math.max(0, carve) * fade * widen * 1.15;
  }

  /** The crater carve, expressed as a function of how far the caldera has collapsed.
   *  At collapse = 0 this reproduces the original pre-eruption crater exactly. As collapse rises
   *  the rim migrates down and outward (so the crater reads as *widening*, not just deepening)
   *  and the floor drops away — the summit-destroying collapse that left the real 2.5 km caldera.
   *  Shared by buildMountain(), sampleTerrainHeight(), and the live geometry update. */
  /** The summit basin, now defined by radius rather than by fraction-of-cone-height. On a
   *  plateaued summit a height-fraction notch has nothing to bite into, so the crater is cut as
   *  a bowl of an explicit radius. Depth is exactly craterDepth at rest, which keeps the
   *  existing lava fill (craterFloorY + craterDepth * craterFill) reaching the rim precisely as
   *  it did before. Widening with collapse still drives the caldera formation. */
  private craterCarve(dist: number, collapse: number): number {
    // Widening is kept modest on purpose. The rim rides outward onto the descending flank, so
    // widening it aggressively drops the rim faster than the floor and the basin flattens out
    // to nothing — measured at 0.03 units deep at full collapse before this was reined in.
    const rim = this.CRATER_RIM_R * (1 + collapse * this.CALDERA_WIDEN);

    // Floor drop and lake surface both derive from CALDERA_DROP, which is what keeps the lake
    // sitting exactly on the caldera floor. The rim also rides outward onto the descending
    // flank as it widens, so the floor has to drop faster than the rim does or the basin
    // flattens out to nothing.
    const depthMul = 1 + collapse * this.CALDERA_DROP;

    // This is the one place the crater is cut, and it is shared by buildMountain(),
    // sampleTerrainHeight() and updateCalderaGeometry() — so controlling it here closes the
    // hole in the mesh, in the height sampler, and for everything that sits on the terrain,
    // across every stage at once.
    if (dist >= rim) return 0;
    const t = 1 - (dist * dist) / (rim * rim);

    const open = this.craterOpen;

    // Open: the bowl, scaled by how far the vent has torn open.
    const bowl = -(Math.pow(t, 0.8) * this.craterDepth * depthMul * open);

    // Sealed: a low cap over the vent. Simply skipping the carve is not enough — the summit
    // still dished by ~0.47 units because the roughness damping leaves the centre smoother
    // than the rim, which reads as a shallow crater from above. The cap makes the closed
    // summit convex instead, and fades out as the vent opens.
    const cap = Math.pow(t, 1.2) * 1.0 * (1 - open);

    return bowl + cap;
  }

  /** Mount Pinatubo's radial profile, replacing the old straight cone.
   *
   *  Two things give it a stratovolcano shape rather than a generic cone. First it is concave:
   *  the exponent makes the upper flanks steep and the lower flanks flatten into a broad apron,
   *  which is what real edifices do and what makes the base read as wide. Second the summit is
   *  a genuine plateau out to the crater rim, so the crater is carved as a basin into flat
   *  ground instead of being notched into a point — that is what makes it read as a caldera. */
  private edificeProfile(dist: number): number {
    const flat = this.CRATER_RIM_R;
    if (dist <= flat) return this.SUMMIT_HEIGHT;               // summit plateau
    const t = Math.min(1, (dist - flat) / (this.EDIFICE_RADIUS - flat));
    return this.SUMMIT_HEIGHT * Math.pow(1 - t, 2.3);          // concave flanks -> gentle skirt
  }

  /** Surface roughness is damped inside the crater so the basin reads as a clean bowl rather
   *  than a noisy pit — otherwise the ridge/noise displacement fills the crater back in. */
  private summitDamp(dist: number): number {
    return THREE.MathUtils.clamp(
      (dist - this.CRATER_RIM_R * 0.5) / (this.CRATER_RIM_R * 0.9), 0.1, 1);
  }

  /** Returns the mountain surface height at a given (x,z), matching buildMountain's displacement exactly. */
  private sampleTerrainHeight(x: number, z: number): number {
    const dist = Math.sqrt(x * x + z * z);
    const baseY = this.edificeProfile(dist);
    const heightFrac = baseY / this.SUMMIT_HEIGHT;
    const damp = this.summitDamp(dist);
    const s = this.RIDGE_SCALE;

    let y = baseY + this.terrainNoise(x, z) * (0.4 + heightFrac * 0.6) * 2.3 * damp;
    y += this.ridgeProfile(x * s, z * s, heightFrac) * damp;
    y += this.gullyProfile(x * s, z * s, heightFrac);
    y += this.craterCarve(dist, this.calderaCollapse);
    return y + this.mountainMesh.position.y;
  }

  // ================= SCENE SETUP =================

  private initScene(): void {
    const canvas = this.canvasRef.nativeElement;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.scene = new THREE.Scene();
    // Fog now tuned to the warm sunset sky tone instead of a flat dark color,
    // so distance haze blends into the skybox rather than fading to black.
    this.scene.fog = new THREE.FogExp2(0x8a5a48, 0.0075);

        this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 700); 
    this.camera.position.set(0, 9, 26);
    this.camera.lookAt(0, 6, 0);

    // --- Environment lighting: hemisphere + warm directional key, tuned so sky color bounces onto terrain ---
    this.scene.add(new THREE.HemisphereLight(0xffb377, 0x3a2e28, 1.4));

    const keyLight = new THREE.DirectionalLight(0xffcf9e, 1.7); // warm "low sun" key light
    keyLight.position.set(-18, 20, 14);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -20;
    keyLight.shadow.camera.right = 20;
    keyLight.shadow.camera.top = 20;
    keyLight.shadow.camera.bottom = -20;
    keyLight.shadow.bias = -0.0015;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xff8a4d, 0.6);
    rimLight.position.set(10, 8, -22);
    this.scene.add(rimLight);

    const fillLight = new THREE.DirectionalLight(0x6a584a, 0.6);
    fillLight.position.set(14, 10, 18);
    this.scene.add(fillLight);

    this.buildSky();
    this.buildTerrainTexture();
    this.buildMountain();
    this.buildCraterLava();
    this.buildSmokeSystem();
    this.buildLightning();
    this.computeFumaroleVents();
    // Ground cracks disabled: seven thin emissive bars radiating from the crater out to
    // ~5 units. They read as hard red sticks poking out of the terrain rather than as
    // fissures. Re-enable by uncommenting; stepCracks() safely no-ops on the empty array.
    // this.buildCracks();
    this.buildRain();
    this.buildStorm();
    // Built after the mountain, because settlements, roads and rivers all sample the
    // terrain height to sit on the surface.
    this.buildRegion();
    this.buildLakeIsland();
    // Shared particle geometries — created once, reused by every ejecta/rock instance.
    this.ejectaGeoAsh = new THREE.SphereGeometry(0.12, 6, 6);
    this.ejectaGeoBomb = new THREE.DodecahedronGeometry(0.16, 0);
    this.bubbleGeo = new THREE.SphereGeometry(1, 14, 10);
    this.rockGeos = [
      new THREE.DodecahedronGeometry(0.15, 0),
      new THREE.DodecahedronGeometry(0.15, 1),
      new THREE.IcosahedronGeometry(0.15, 0),
    ];

    this.scene.add(this.geoGroup);
    this.scene.add(this.ejectaGroup);

    // --- Orbit controls: click-and-drag rotation around the volcano ---
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 6, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 12;
    // Wide enough for the aftermath's regional framing (~54 units) without letting the
    // viewer pull back so far that the volcano stops being the subject.
        this.controls.maxDistance = 160;
    this.controls.minPolarAngle = 0.15;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.update();
  }

  /** Large inward-facing sphere with a vertical gradient shader — replaces the flat background color
   *  with a proper sunset skybox (deep dusk blue at the zenith, warm orange/pink at the horizon).
   *  Colors are mutable uniforms so they can be darkened as unrest builds. */
  private buildSky(): void {
    const geo = new THREE.SphereGeometry(400, 32, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: this.skyCalm.top.clone() },
        horizonColor: { value: this.skyCalm.horizon.clone() },
        bottomColor: { value: this.skyCalm.bottom.clone() },
        offset: { value: 8 },
        exponent: { value: 0.7 },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
          vec3 sky = h > 0.0
            ? mix(horizonColor, topColor, pow(max(h, 0.0), exponent))
            : mix(horizonColor, bottomColor, pow(max(-h, 0.0), exponent * 1.4));
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });
    this.skyMesh = new THREE.Mesh(geo, mat);
    this.scene.add(this.skyMesh);
  }

  /** Noise-displaced cone with height-based vertex coloring: earthy brown base transitioning
   *  to dark basalt-grey slopes, with a warm red tint near the crater rim. Smooth shaded
   *  (flatShading: false + computeVertexNormals) so triangles blend into rugged, continuous terrain. */
  private buildMountain(): void {
    // The cone is used only as a convenient radial mesh topology (and for its UVs, which the
    // terrain texture needs). Every vertex's height is recomputed from edificeProfile() below,
    // so the straight cone silhouette is entirely replaced.
    const radius = this.EDIFICE_RADIUS, height = this.SUMMIT_HEIGHT;
    const radialSegments = 200, heightSegments = 96;
    const geo = new THREE.ConeGeometry(radius, height, radialSegments, heightSegments, true);
    const pos = geo.attributes['position'] as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const basePositions = new Float32Array(pos.count * 3);
    const craterDists = new Float32Array(pos.count);

    // Heights are absolute now (the mesh sits at y = 0), and the rim is the plateau top, so
    // rim - floor is exactly craterDepth. That keeps the existing lava fill maths intact.
    this.craterRimY = this.SUMMIT_HEIGHT;
    this.craterFloorY = this.SUMMIT_HEIGHT - this.craterDepth;

    // Color stops for the height gradient
    // One dark brown for the whole edifice. The old ramp graded brown -> grey -> a warm red
    // tint at the rim, which is where the reddish summit came from; that is gone entirely.
    // Shading is still carried by the lighting, the per-vertex variance and the gully
    // darkening below, so the mountain keeps its relief without a colour gradient.
    const rockBrown = new THREE.Color(0x4a3626);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const dist = Math.sqrt(x * x + z * z);

      // Height comes from the profile, not from the cone's own linear slope.
      const baseY = this.edificeProfile(dist);
      const heightFrac = baseY / this.SUMMIT_HEIGHT;
      const damp = this.summitDamp(dist);
      const sc = this.RIDGE_SCALE;

      const roughness = this.terrainNoise(x, z) * (0.4 + heightFrac * 0.6) * damp;
      const scale = dist > 0.001 ? (dist + roughness) / dist : 1;

      let newX = x * scale;
      let newZ = z * scale;
      let newY = baseY + roughness * 2.3;
      newY += this.ridgeProfile(x * sc, z * sc, heightFrac) * damp;
      const gully = this.gullyProfile(x * sc, z * sc, heightFrac);
      newY += gully;

      // Cache the shape *before* the crater is carved, so the caldera can be re-carved every
      // frame during the collapse without recomputing noise, ridge and gully work each time.
      basePositions[i * 3] = newX;
      basePositions[i * 3 + 1] = newY;
      basePositions[i * 3 + 2] = newZ;
      // The crater is radial now, so what gets cached per-vertex is its distance from the axis.
      craterDists[i] = dist;

      newY += this.craterCarve(dist, 0);

      pos.setXYZ(i, newX, newY, newZ);

      // A single dark brown everywhere, summit included.
      tmp.copy(rockBrown);
      // Slight per-vertex variance so it doesn't look like flat color bands, plus a gentle
      // darkening inside the gully floors so the channels read as shadowed drainage.
      // Same color stops as before — only the shading varies.
      const variance = (0.92 + Math.random() * 0.16) * (1 + gully * 0.22);
      colors[i * 3] = tmp.r * variance;
      colors[i * 3 + 1] = tmp.g * variance;
      colors[i * 3 + 2] = tmp.b * variance;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals(); // smooth normals — no more harsh flat-shaded facets

    this.mountainBasePositions = basePositions;
    this.mountainCraterDists = craterDists;

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.terrainTexture,
      roughness: 0.92,
      metalness: 0.03,
      flatShading: false, // smooth shading, per your requirement
      color: this.noTint.clone(),
    });

    this.mountainMesh = new THREE.Mesh(geo, mat);
    // Heights are absolute, so the mesh is not offset. craterFloorY is already a world
    // height, which leaves the lava positioning expression unchanged and still correct.
    this.mountainMesh.position.y = 0;
    this.mountainMesh.castShadow = true;
    this.mountainMesh.receiveShadow = true;
    this.scene.add(this.mountainMesh);
  }

  /** The lava disc inside the crater doubles as an emissive material AND the source of the key point light.
   *  Later in the story (aftermath) this same disc transitions into a still, reflective crater lake. */
  /** A radially-subdivided disc for the lava surface, with a deliberately ragged outer edge.
   *  Two reasons this replaces CircleGeometry: that geometry has only a centre vertex and a rim,
   *  so there is nothing in between to displace, and its perfectly circular outline is exactly
   *  what made the pool read as a flat orange disc sliding up and down. The rim radius here is
   *  perturbed so the lava meets the crater wall in an irregular line instead of a clean circle.
   *  Built flat in XZ (y up), so it needs no rotation. */
  private makeLavaDisc(radius: number, rings: number, segs: number): THREE.BufferGeometry {
    // Deterministic wobble on the outline - a few octaves so it is irregular, not a flower shape.
    const rimAt = (ang: number) => {
      const w = Math.sin(ang * 3 + 0.7) * 0.055
        + Math.sin(ang * 5 - 1.9) * 0.035
        + Math.sin(ang * 9 + 2.4) * 0.02;
      return 1 + w;
    };

    const pos: number[] = [0, 0, 0];
    const nrm: number[] = [0, 1, 0];
    const uv: number[] = [0.5, 0.5];

    for (let r = 1; r <= rings; r++) {
      const t = r / rings;
      for (let a = 0; a < segs; a++) {
        const ang = (a / segs) * Math.PI * 2;
        // The wobble fades toward the centre, so only the outline is irregular.
        const rr = radius * t * (1 + (rimAt(ang) - 1) * t);
        const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
        pos.push(x, 0, z);
        nrm.push(0, 1, 0);
        uv.push(0.5 + (x / radius) * 0.5, 0.5 + (z / radius) * 0.5);
      }
    }

    // Winding matters here. The disc is built directly in XZ, and three.js treats
    // counter-clockwise as the front face, so these triangles must wind CCW *as seen from
    // above* or the whole pool is back-face culled and renders as an empty crater.
    const idx: number[] = [];
    for (let a = 0; a < segs; a++) idx.push(0, 1 + ((a + 1) % segs), 1 + a);   // centre fan
    for (let r = 0; r < rings - 1; r++) {
      for (let a = 0; a < segs; a++) {
        const a2 = (a + 1) % segs;
        const cur = 1 + r * segs, nxt = 1 + (r + 1) * segs;
        idx.push(cur + a, cur + a2, nxt + a);
        idx.push(cur + a2, nxt + a2, nxt + a);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    return geo;
  }

  /** The crater pool. Deliberately still a MeshStandardMaterial: the render loop writes
   *  emissiveIntensity, emissive, color and roughness on this material every frame, and a raw
   *  ShaderMaterial has none of those properties. Injecting the magma behaviour through
   *  onBeforeCompile leaves every one of those existing writes working untouched, and keeps the
   *  pool lit and fogged consistently with the rest of the scene.
   *
   *  The shader does three things: domain-warped simplex noise drives slow convection cells that
   *  drift and fold, cubed noise peaks push rounded bulges up through the surface, and thin
   *  incandescent veins glow where the cooling crust splits apart. */
  private buildCraterLava(): void {
    // Sized to fill the basin: ~80% of CRATER_RIM_R, and it widens with the same
    // CALDERA_WIDEN factor as the rim, so the pool keeps filling the crater as it opens
    // instead of leaving a bare ring of rock around a small central puddle.
    const craterRadius = 5.4;
    const geo = this.makeLavaDisc(craterRadius, 26, 96);

    this.lavaMaterial = new THREE.MeshStandardMaterial({
      color: this.lavaBaseColor.clone(),
      emissive: 0xff5a1f,
      emissiveIntensity: 0,
      roughness: 0.4,
      // DoubleSide as insurance: a ~2.5k-vertex pool costs nothing to draw both ways, and it
      // means the lava can never vanish to a culling issue at an unusual camera angle.
      side: THREE.DoubleSide,
    });

    this.lavaMaterial.onBeforeCompile = (shader: any) => {
      shader.uniforms['uTime'] = { value: 0 };
      shader.uniforms['uMolten'] = { value: 0 };
      shader.uniforms['uRadius'] = { value: craterRadius };

      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `
#include <common>
uniform float uTime;
uniform float uMolten;
uniform float uRadius;
varying float vLavaCrack;
varying float vLavaGlow;

// Ashima 3D simplex noise (public domain) - compact and derivative-free.
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float lavaFbm(vec3 p){
  float amp = 0.5, sum = 0.0;
  for (int i = 0; i < 4; i++){ sum += amp * snoise(p); p *= 2.03; amp *= 0.5; }
  return sum;
}
`)
        .replace('#include <begin_vertex>', `
#include <begin_vertex>
{
  float r = length(position.xz) / uRadius;
  float t = uTime * 0.32;

  // Domain warp: the noise field is advected by a second noise field, which is what turns a
  // static ripple into slow convection cells that drift, shear and fold into one another.
  vec3 q  = vec3(position.x * 0.45, position.z * 0.45, t);
  float w = lavaFbm(q * 0.9);
  float n = lavaFbm(q * 1.35 + vec3(w * 0.9, w * 0.7, t * 0.5));

  // Thin veins where the cooled crust splits open.
  float crack = 1.0 - smoothstep(0.0, 0.30, abs(n));
  // Cubed peaks: isolated rounded bulges that swell and subside, not a uniform wobble.
  float bub = pow(max(0.0, n), 3.0);

  // Flatten toward the rim so the pool still meets the crater wall cleanly.
  float edge = smoothstep(1.0, 0.66, r);

  transformed.y += (n * 0.10 + bub * 0.60) * uMolten * edge;

  vLavaCrack = crack * edge * uMolten;
  vLavaGlow  = bub * edge * uMolten;
}
`);

      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `
#include <common>
uniform float uMolten;
varying float vLavaCrack;
varying float vLavaGlow;
`)
        .replace('#include <normal_fragment_begin>', `
#include <normal_fragment_begin>
{
  // Cheap bump from the height field so the bulges catch the light instead of reading flat.
  float hgt = vLavaCrack * 0.35 + vLavaGlow;
  vec3 dn = vec3(dFdx(hgt), 0.0, dFdy(hgt));
  normal = normalize(normal - dn * 1.6 * uMolten);
}
`)
        .replace('#include <emissivemap_fragment>', `
#include <emissivemap_fragment>
{
  float hot = clamp(vLavaCrack * 1.15 + vLavaGlow * 1.7, 0.0, 1.0);
  vec3 hotCol = mix(vec3(1.0, 0.30, 0.05), vec3(1.0, 0.86, 0.42), smoothstep(0.55, 1.0, hot));
  vec3 crust  = vec3(0.055, 0.020, 0.014);

  // Everything is mixed by uMolten so that at zero - the cooled aftermath crater lake - the
  // surface falls back to exactly the plain material the render loop is already driving.
  // The crust floor is deliberately well above zero. Dropping it near black is physically
  // truer for a cooled surface, but it made the crater read as empty - the whole pool has to
  // stay visibly molten, with the veins and bulges brighter on top of that, not instead of it.
  totalEmissiveRadiance *= mix(1.0, mix(0.60, 2.8, hot), uMolten);
  totalEmissiveRadiance *= mix(vec3(1.0), hotCol, 0.85 * uMolten);
  diffuseColor.rgb = mix(diffuseColor.rgb,
                         mix(diffuseColor.rgb * 0.55 + crust, diffuseColor.rgb, hot),
                         uMolten);
}
`);

      this.lavaShader = shader;
    };
    // Without this three.js can hand back a cached program compiled from the un-injected source.
    this.lavaMaterial.customProgramCacheKey = () => 'pinatubo-magma-v1';

    this.lavaMesh = new THREE.Mesh(geo, this.lavaMaterial);
    this.lavaMesh.position.set(0, this.craterFloorY + this.mountainMesh.position.y, 0);

    // Driving the uniforms from onBeforeRender keeps this self-contained - the main animation
    // loop needs no new lines at all. uMolten is *read* from the emissive intensity that loop
    // already sets, so the pool stills itself automatically as the crater cools into a lake.
    this.lavaMesh.onBeforeRender = () => {
      const sh = this.lavaShader;
      if (!sh) return;
      sh.uniforms['uTime'].value = this.clock.getElapsedTime();
      // Read from the emissive intensity the render loop already sets. The 0.35 floor keeps a
      // visible molten surface whenever there is any glow at all, instead of only once the
      // crater is nearly full; it still falls to 0 for the cooled aftermath lake.
      const e = this.lavaMaterial.emissiveIntensity;
      sh.uniforms['uMolten'].value = e < 0.02 ? 0 : THREE.MathUtils.clamp(0.35 + e * 0.5, 0, 1);
    };

    this.scene.add(this.lavaMesh);

    this.lavaLight = new THREE.PointLight(0xff6a2a, 0, 40, 1.6);
    this.lavaLight.position.copy(this.lavaMesh.position);
    this.lavaLight.position.y += 0.4;
    this.scene.add(this.lavaLight);
  }

  private buildSmokeSystem(): void {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const cctx = c.getContext('2d')!;
    const grad = cctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = grad;
    cctx.fillRect(0, 0, size, size);
    this.smokeTexture = new THREE.CanvasTexture(c);

    this.scene.add(this.smokeGroup);
  }

  // ================= VOLCANIC LIGHTNING (ash-rich plume only) =================

  private buildLightning(): void {
    this.lightningLight = new THREE.PointLight(0xd8e8ff, 0, 60, 1.4);
    this.lightningLight.position.set(0, 14, 0);
    this.scene.add(this.lightningLight);
  }

  private stepLightning(dt: number): void {
    if (this.lightningLight.intensity > 0) {
      this.lightningLight.intensity = Math.max(0, this.lightningLight.intensity - dt * 14);
    }
    const active = (this.phase === 'burst' || this.phase === 'overflow') && this.outcome.kind === 'ash';
    if (!active) return;

    this.lightningTimer -= dt;
    if (this.lightningTimer <= 0) {
      this.lightningLight.intensity = 6 + Math.random() * 4;
      this.lightningLight.position.set(
        (Math.random() - 0.5) * 6,
        this.lavaMesh.position.y + 8 + Math.random() * 6,
        (Math.random() - 0.5) * 6
      );
      this.lightningTimer = 0.4 + Math.random() * 1.2;
    }
  }

  // ================= TERRAIN SURFACE TEXTURE (replaces discrete tree instances) =================

  /** A tiled, mottled ground-cover texture — clumps of shrub, grass, and bare-earth fleck at
   *  varying tones — multiplied against the mountain's existing height-based vertex color gradient.
   *  This reads as natural vegetation coverage following the terrain's contours, rather than rows
   *  of individually placed tree objects. */
  private buildTerrainTexture(): void {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#8a8578';
    ctx.fillRect(0, 0, size, size);

    const clumpCount = 2600;
    for (let i = 0; i < clumpCount; i++) {
      const x = Math.random() * size, y = Math.random() * size;
      const r = 1.5 + Math.random() * 5;
      const shade = Math.random();
      let color: string;
      if (shade < 0.42) {
        color = `rgba(${70 + Math.random() * 35},${88 + Math.random() * 32},${52 + Math.random() * 22},0.55)`; // shrub clump
      } else if (shade < 0.72) {
        color = `rgba(${100 + Math.random() * 30},${108 + Math.random() * 26},${68 + Math.random() * 20},0.4)`; // dry grass
      } else {
        color = `rgba(${118 + Math.random() * 24},${104 + Math.random() * 18},${86 + Math.random() * 16},0.35)`; // bare earth / rock fleck
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.65, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }

    this.terrainTexture = new THREE.CanvasTexture(c);
    this.terrainTexture.wrapS = THREE.RepeatWrapping;
    this.terrainTexture.wrapT = THREE.RepeatWrapping;
    this.terrainTexture.repeat.set(7, 7);
  }

  // ================= BIRDS (stage I only) =================

  // ================= FUMAROLES (stages III & IV) =================

  private computeFumaroleVents(): void {
    const count = 5;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 3.5 + Math.random() * 0.8; // just outside the crater rim
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      // y is resampled at spawn time, not baked here, so the vents stay on the surface when
      // the summit opens instead of hanging where the sealed slope used to be.
      this.fumaroleVents.push(new THREE.Vector3(x, 0, z));
    }
  }

  private maybeSpawnFumaroleSteam(): void {
    if (!this.fumarolesActive || this.fumaroleVents.length === 0) return;
    if (Math.random() > 0.35) return;

    const vent = this.fumaroleVents[Math.floor(Math.random() * this.fumaroleVents.length)];
    const mat = new THREE.SpriteMaterial({
      map: this.smokeTexture, color: 0xe8e2da, transparent: true, opacity: 0.4, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const scale = 0.35 + Math.random() * 0.3;
    sprite.scale.set(scale, scale, 1);
    sprite.position.copy(vent).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.1, (Math.random() - 0.5) * 0.2));
    sprite.position.y = this.sampleTerrainHeight(sprite.position.x, sprite.position.z) + 0.1;
    this.smokeGroup.add(sprite);
    this.smokeSprites.push({ sprite, vy: 0.5 + Math.random() * 0.3, seed: Math.random() * 1000 });
  }

  // ================= GROUND CRACKS (stages III & IV, remain scarred afterward) =================

  private buildCracks(): void {
    const count = 7;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
      const innerDist = 2.3, outerDist = 4.2 + Math.random() * 1.5;
      const x1 = Math.cos(angle) * innerDist, z1 = Math.sin(angle) * innerDist;
      const angle2 = angle + (Math.random() - 0.5) * 0.3;
      const x2 = Math.cos(angle2) * outerDist, z2 = Math.sin(angle2) * outerDist;
      const y1 = this.sampleTerrainHeight(x1, z1), y2 = this.sampleTerrainHeight(x2, z2);
      const mid = new THREE.Vector3((x1 + x2) / 2, (y1 + y2) / 2 + 0.05, (z1 + z2) / 2);
      const len = Math.hypot(x2 - x1, y2 - y1, z2 - z1);

      const geo = new THREE.BoxGeometry(0.12, 0.04, len);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1a0e08, emissive: 0xff4010, emissiveIntensity: 0, roughness: 0.9,
        transparent: true, opacity: 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(mid);
      mesh.lookAt(x2, y2, z2);
      this.crackMeshes.push(mesh);
      this.cracksGroup.add(mesh);
    }
    this.scene.add(this.cracksGroup);
  }

  private stepCracks(dt: number): void {
    this.crackVisibility += (this.crackVisibilityTarget - this.crackVisibility) * dt * 2;
    this.crackMeshes.forEach((m) => {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.opacity = this.crackVisibility;
      mat.emissiveIntensity = Math.max(0, this.crackVisibility - 0.4) * this.magmaBaseGlow * 3;
    });
  }

  // ================= ROCKFALLS (stage IV) =================

  /** Rocks are released just below the crater rim and given only a small outward nudge — from
   *  there the slope does the work, so they tumble down the gullies rather than being launched.
   *  Spawn rate and size both scale with rockfallIntensity, which the eruption climax raises. */
  private maybeSpawnRockfall(dt: number): void {
    if (!this.rockfallsActive) return;
    this.rockfallTimer -= dt;
    if (this.rockfallTimer > 0) return;
    this.rockfallTimer = (0.28 + Math.random() * 0.45) / this.rockfallIntensity;

    // Cap live rocks so a long eruption can't pile up unbounded geometry.
    if (this.rockfalls.length > 90) return;

    const angle = Math.random() * Math.PI * 2;
    const dist = 3.2 + Math.random() * 2.2;
    const x = Math.cos(angle) * dist, z = Math.sin(angle) * dist;
    const y = this.sampleTerrainHeight(x, z) + 0.25;

    const radius = (0.1 + Math.random() * 0.16) * (0.8 + this.rockfallIntensity * 0.35);
    const geo = this.rockGeos[Math.floor(Math.random() * this.rockGeos.length)];
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0x4a4741).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12),
      roughness: 0.95,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.scale.setScalar(radius / 0.15);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.scene.add(mesh);

    // Small outward push only; gravity plus the slope gradient supply the real motion.
    const vel = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).multiplyScalar(0.6 + Math.random() * 0.9);
    vel.y = 0.2 + Math.random() * 0.4;

    this.rockfalls.push({
      mesh, vel, life: 1, radius, bounces: 0,
      spin: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 9),
    });
  }

  /** Rocks now actually roll: they read the local slope gradient and accelerate downhill, bounce
   *  with damping when they hit the surface, kick up a dust puff on the first solid impact, and
   *  only settle once they've lost their energy — instead of fading out mid-air on a timer. */
  private stepRockfalls(dt: number): void {
    const gravity = 14;
    for (let i = this.rockfalls.length - 1; i >= 0; i--) {
      const r = this.rockfalls[i];
      const p = r.mesh.position;

      r.vel.y -= gravity * dt;
      p.addScaledVector(r.vel, dt);

      const groundY = this.sampleTerrainHeight(p.x, p.z);
      const restY = groundY + r.radius;

      if (p.y <= restY) {
        // Sample the slope so the rock knows which way is downhill.
        const eps = 0.35;
        const gx = this.sampleTerrainHeight(p.x + eps, p.z) - this.sampleTerrainHeight(p.x - eps, p.z);
        const gz = this.sampleTerrainHeight(p.x, p.z + eps) - this.sampleTerrainHeight(p.x, p.z - eps);
        const slope = new THREE.Vector3(-gx, 0, -gz).multiplyScalar(1 / (2 * eps));
        const steepness = slope.length();

        const impactSpeed = Math.abs(r.vel.y);
        p.y = restY;

        if (impactSpeed > 1.4 && r.bounces < 4) {
          r.vel.y = impactSpeed * 0.36;              // damped bounce
          r.vel.x *= 0.72; r.vel.z *= 0.72;
          r.bounces++;
          if (r.bounces === 1 && impactSpeed > 2.4) this.spawnDustPuff(p, r.radius);
        } else {
          r.vel.y = 0;
        }

        // Roll downhill; friction rises sharply as the ground flattens out.
        r.vel.x += slope.x * steepness * 26 * dt;
        r.vel.z += slope.z * steepness * 26 * dt;
        const friction = steepness < 0.25 ? 1.9 : 0.55;
        r.vel.x -= r.vel.x * friction * dt;
        r.vel.z -= r.vel.z * friction * dt;

        const speed = Math.hypot(r.vel.x, r.vel.z);
        if (speed < 0.22) r.life -= dt * 1.4;        // come to rest, then fade
      }

      // Spin rate follows actual travel speed, so rocks look like they're rolling, not spinning in place.
      const travel = r.vel.length();
      r.mesh.rotation.x += r.spin.x * dt * (0.25 + travel * 0.14);
      r.mesh.rotation.y += r.spin.y * dt * (0.25 + travel * 0.14);
      r.mesh.rotation.z += r.spin.z * dt * (0.25 + travel * 0.14);

      const mat = r.mesh.material as THREE.MeshStandardMaterial;
      if (r.life < 1) { mat.transparent = true; mat.opacity = Math.max(0, r.life); }

      // Retire once faded, run out past the base, or fallen through the world.
      if (r.life <= 0 || Math.hypot(p.x, p.z) > 18 || p.y < groundY - 4) {
        this.scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose(); // geometry is shared — never disposed here
        this.rockfalls.splice(i, 1);
      }
    }
  }

  /** Short-lived dust kicked up where a tumbling rock lands. */
  private spawnDustPuff(at: THREE.Vector3, scale: number): void {
    if (this.dustPuffs.length > 40) return;
    const mat = new THREE.SpriteMaterial({
      map: this.smokeTexture, color: 0x9a8d7f, transparent: true, opacity: 0.42, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const s = 0.5 + scale * 2.4;
    sprite.scale.set(s, s, 1);
    sprite.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.05, (Math.random() - 0.5) * 0.15));
    this.scene.add(sprite);
    this.dustPuffs.push({ sprite, life: 1, vy: 0.25 + Math.random() * 0.25 });
  }

  private stepDustPuffs(dt: number): void {
    for (let i = this.dustPuffs.length - 1; i >= 0; i--) {
      const d = this.dustPuffs[i];
      d.life -= dt * 1.1;
      d.sprite.position.y += d.vy * dt;
      d.sprite.scale.multiplyScalar(1 + dt * 0.9);
      (d.sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, d.life * 0.42);
      if (d.life <= 0) {
        this.scene.remove(d.sprite);
        (d.sprite.material as THREE.Material).dispose();
        this.dustPuffs.splice(i, 1);
      }
    }
  }

  // ================= PYROCLASTIC DENSITY CURRENTS (stage V climax) =================

  /** Fast, ground-hugging, radially-expanding surge — visually and physically distinct from the
   *  vertical ash column (ejecta) and from lava flows, which Pinatubo produced little of. */
  private spawnPyroclasticSurge(): void {
    const count = 160;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const geo = new THREE.SphereGeometry(0.25 + Math.random() * 0.3, 5, 5);
      const mat = new THREE.MeshStandardMaterial({ color: 0x5a4a42, roughness: 1, transparent: true, opacity: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);
      const startDist = 2.2 + Math.random() * 1.1;
      const x = Math.cos(angle) * startDist, z = Math.sin(angle) * startDist;
      mesh.position.set(x, this.sampleTerrainHeight(x, z) + 0.3, z);
      this.scene.add(mesh);
      this.pyroclastic.push({ mesh, angle, dist: startDist, speed: 5 + Math.random() * 4, life: 1 });
    }
  }

  private stepPyroclastic(dt: number): void {
    for (let i = this.pyroclastic.length - 1; i >= 0; i--) {
      const p = this.pyroclastic[i];
      p.dist += p.speed * dt;
      p.life -= dt * 0.35;
      const x = Math.cos(p.angle) * p.dist, z = Math.sin(p.angle) * p.dist;
      const y = this.sampleTerrainHeight(x, z) + 0.3 + (1 - p.life) * 0.6;
      p.mesh.position.set(x, y, z);
      p.mesh.scale.setScalar(1 + (1 - p.life) * 2.2);
      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      mat.opacity = Math.max(0, p.life * 0.85);
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.pyroclastic.splice(i, 1);
      }
    }
  }

  // ================= PLUME EDDIES (turbulent billow cells) =================

  /** Spawns billow cells at the vent while the eruption is venting. Each one is a discrete
   *  convective cloud: it rises at its own speed, swells as it entrains air, drifts with the
   *  wind, and eventually dies — at which point its particles detach and disperse. Overlapping
   *  cells read as billows merging; dying cells read as billows tearing apart. */
 private maybeSpawnEddy(dt: number): void {
  if (this.phase !== 'pressure' && this.phase !== 'burst' && this.phase !== 'overflow') return;
  this.eddyTimer -= dt;
  if (this.eddyTimer > 0) return;
  this.eddyTimer = 0.05 + Math.random() * 0.09;
  if (this.plumeEddies.length > 90) return;

  const ventY = this.lavaMesh.position.y;
  const a = Math.random() * Math.PI * 2;
  const r = Math.pow(Math.random(), 1.6) * 4.5;

  this.plumeEddies.push({
    pos: new THREE.Vector3(Math.cos(a) * r, ventY + 1 + Math.random() * 5, Math.sin(a) * r),
    vel: new THREE.Vector3((Math.random() - 0.5) * 5, 16 + Math.random() * 22, (Math.random() - 0.5) * 5),
    radius: 1.5 + Math.random() * 2,
    targetRadius: 6 + Math.pow(Math.random(), 0.7) * 20,
    life: 1,
    spin: (Math.random() - 0.5) * 1.5,
    rise: 0.9 + Math.random() * 1.1,
  });
}

  private stepEddies(dt: number, elapsed: number): void {
  const ventY = this.lavaMesh.position.y;

  const wStr = 0.6 + this.stormIntensity * 1.3;
  this.plumeWind.set(
    Math.sin(elapsed * 0.17 + this.windSeed) * wStr + Math.sin(elapsed * 0.41) * wStr * 0.35,
    0,
    Math.cos(elapsed * 0.13 + this.windSeed * 0.7) * wStr * 0.8
  );

  for (let i = this.plumeEddies.length - 1; i >= 0; i--) {
    const ed = this.plumeEddies[i];
    const alt = Math.max(0, ed.pos.y - ventY);

    const buoy = Math.max(0, 1 - alt / 90) * 14 * ed.rise;
    ed.vel.y += (buoy - 4.2) * dt;
    ed.vel.y -= ed.vel.y * 0.5 * dt;

    ed.vel.x += (this.plumeWind.x * Math.min(1, alt / 45) - ed.vel.x) * 1.1 * dt;
    ed.vel.z += (this.plumeWind.z * Math.min(1, alt / 45) - ed.vel.z) * 1.1 * dt;

    if (alt > 55) {
      const t = Math.min(1, (alt - 55) / 25);
      const cur = Math.hypot(ed.pos.x, ed.pos.z) || 0.001;
      if (cur < 70) {
        ed.vel.x += (ed.pos.x / cur) * t * 2.1 * dt;
        ed.vel.z += (ed.pos.z / cur) * t * 2.1 * dt;
      }
      ed.vel.y -= ed.vel.y * 2.2 * dt;
      ed.targetRadius = Math.min(30, ed.targetRadius + t * 2.4 * dt);
      ed.vel.x -= ed.vel.x * 0.9 * dt;
      ed.vel.z -= ed.vel.z * 0.9 * dt;
    }

    ed.pos.addScaledVector(ed.vel, dt);
    ed.radius += (ed.targetRadius - ed.radius) * dt * 0.5;
    ed.life -= dt * 0.06;

    if (ed.life <= 0) this.plumeEddies.splice(i, 1);
  }
}

  // ================= MAGMA BUBBLES (boiling lava surface) =================

  /** Domes of molten rock that swell up through the lava surface, hold, then burst — the
   *  classic visual shorthand for "this is dangerously hot". They only appear once the crater
   *  has actually opened up (so there's a visible pool to boil) and they shut off as the pool
   *  cools into the aftermath lake. Positions are stored in polar form so they can ride the
   *  lava disc outward as the caldera widens beneath them. */
  private maybeSpawnMagmaBubble(dt: number): void {
    // Never in the aftermath: the pool there is a cooling crater lake, not molten rock.
    // Without this the bubbles would keep spawning while lakeFormation ramps up.
    if (this.currentChapter.id === 'aftermath') return;

    // Needs an exposed, still-molten pool: crater open, lava present, not yet a cold lake.
    const heat = this.craterFill * (1 - this.lakeFormation);
    const opened = Math.min(1, this.calderaCollapse / 0.35);
    const activity = heat * opened;
    if (activity < 0.08) return;

    this.bubbleTimer -= dt;
    if (this.bubbleTimer > 0) return;
    this.bubbleTimer = (0.16 + Math.random() * 0.34) / (0.4 + activity);
    if (this.magmaBubbles.length > 40) return;

    const mat = new THREE.MeshStandardMaterial({
      color: 0x5a1405,
      emissive: 0xff6a1a,
      emissiveIntensity: 2.4,
      roughness: 0.35,
      transparent: true,
      opacity: 1,
    });
    const mesh = new THREE.Mesh(this.bubbleGeo, mat);
    mesh.scale.setScalar(0.01);

    // Bias toward the middle of the pool, where the lava is hottest.
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.pow(Math.random(), 0.7) * 0.82;
    mesh.position.set(0, 0, 0);
    this.scene.add(mesh);

    this.magmaBubbles.push({
      mesh, life: 1, popped: false, angle, dist,
      maxScale: 0.19 + Math.random() * 0.53,
    });
  }

  private stepMagmaBubbles(dt: number): void {
    const surfaceY = this.lavaMesh.position.y;
    const poolRadius = 5.4 * this.lavaMesh.scale.x;

    for (let i = this.magmaBubbles.length - 1; i >= 0; i--) {
      const b = this.magmaBubbles[i];
      const mat = b.mesh.material as THREE.MeshStandardMaterial;

      // Track the pool as it widens and drops with the collapsing caldera.
      b.mesh.position.set(
        Math.cos(b.angle) * b.dist * poolRadius,
        surfaceY,
        Math.sin(b.angle) * b.dist * poolRadius
      );

      b.life -= dt * 0.85;

      if (!b.popped) {
        // Swell up out of the surface with an ease-out, so it bulges rather than pops into view.
        const swell = 1 - Math.pow(Math.max(0, b.life - 0.35) / 0.65, 2);
        b.mesh.scale.set(b.maxScale * swell, b.maxScale * swell * 0.72, b.maxScale * swell);
        // Brighten as it thins and the incandescent interior shows through.
        mat.emissiveIntensity = 2.4 + swell * 2.2;

        if (b.life <= 0.35) {
          b.popped = true;
          // Burst: flatten and flash, and release a wisp of steam like a real bursting bubble.
          mat.emissiveIntensity = 6.5;
          this.spawnBubbleSteam(b.mesh.position, b.maxScale);
        }
      } else {
        // Collapse back into the pool.
        const t = Math.max(0, b.life / 0.35);
        b.mesh.scale.set(b.maxScale * (1 + (1 - t) * 0.9), b.maxScale * 0.72 * t, b.maxScale * (1 + (1 - t) * 0.9));
        mat.emissiveIntensity = 6.5 * t;
        mat.opacity = t;
      }

      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose(); // geometry shared
        this.magmaBubbles.splice(i, 1);
      }
    }
  }

  /** The small puff of gas released when a magma bubble bursts. */
  private spawnBubbleSteam(at: THREE.Vector3, scale: number): void {
    if (this.smokeSprites.length > 200) return;
    const mat = new THREE.SpriteMaterial({
      map: this.smokeTexture, color: 0x6a5a50, transparent: true, opacity: 0.32, depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const s = 0.25 + scale * 1.6;
    sprite.scale.set(s, s, 1);
    sprite.position.copy(at).add(new THREE.Vector3(0, 0.08, 0));
    this.smokeGroup.add(sprite);
    this.smokeSprites.push({ sprite, vy: 0.5 + Math.random() * 0.4, seed: Math.random() * 1000 });
  }

  // ================= CALDERA COLLAPSE (live geometry deformation) =================

  /** Re-carves the summit from the cached pre-crater vertex positions. Only runs when the
   *  collapse value has actually moved a meaningful amount — a full re-carve plus normal
   *  recompute over ~13k vertices is too expensive to do on every frame of an idle scene,
   *  but it's fine as an occasional update while the caldera is actively forming. */
  private updateCalderaGeometry(): void {
    if (!this.mountainMesh || !this.mountainBasePositions) return;
    // Keyed on both values: the summit can change because it is opening as well as because
    // it is collapsing, and watching only the collapse would freeze the mesh shut.
    const shape = this.calderaCollapse + this.craterOpen * 10;
    if (Math.abs(shape - this.lastAppliedCollapse) < 0.004) return;
    this.lastAppliedCollapse = shape;

    const geo = this.mountainMesh.geometry;
    const pos = geo.attributes['position'] as THREE.BufferAttribute;
    const base = this.mountainBasePositions;
    const dists = this.mountainCraterDists;
    const collapse = this.calderaCollapse;

    for (let i = 0; i < pos.count; i++) {
      const carve = this.craterCarve(dists[i], collapse);
      pos.setXYZ(i, base[i * 3], base[i * 3 + 1] + carve, base[i * 3 + 2]);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }

  // ================= STORM WEATHER (Typhoon Yunya) =================

  private buildStorm(): void {
    // A broad, cool-white flash light standing in for sheet lightning across the storm cell —
    // deliberately different in color, position and falloff from the volcanic lightning inside
    // the plume, so the two read as separate phenomena happening at once.
    this.stormFlashLight = new THREE.DirectionalLight(0xcfe0ff, 0);
    this.stormFlashLight.position.set(-30, 45, -20);
    this.scene.add(this.stormFlashLight);
  }

  /** Builds one jagged bolt path from cloud base down toward the ground, with a couple of
   *  short forks branching off it — the flash light alone reads as an unexplained brightness,
   *  so the visible bolt is what actually sells the storm. */
  private spawnLightningBolt(atX: number, atZ: number): void {
    const topY = 34 + Math.random() * 10;
    const groundY = 0.2;
    const steps = 11 + Math.floor(Math.random() * 5);

    const makePath = (sx: number, sz: number, sy: number, ey: number, jitter: number, n: number) => {
      const pts: THREE.Vector3[] = [];
      let x = sx, z = sz;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const y = THREE.MathUtils.lerp(sy, ey, t);
        // Deviation shrinks toward the strike point so the bolt converges instead of wandering.
        const spread = jitter * (1 - t * 0.55);
        x += (Math.random() - 0.5) * spread;
        z += (Math.random() - 0.5) * spread;
        pts.push(new THREE.Vector3(x, y, z));
      }
      return pts;
    };

    const mainPts = makePath(atX, atZ, topY, groundY, 3.2, steps);

    const mat = new THREE.MeshBasicMaterial({
      color: 0xeaf2ff, transparent: true, opacity: 0.95, depthWrite: false,
    });
    const curve = new THREE.CatmullRomCurve3(mainPts);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, steps * 3, 0.11, 5, false), mat);
    this.scene.add(mesh);
    this.lightningBolts.push({ mesh, life: 1 });

    // One or two short forks peeling off the main channel partway down.
    const forks = 1 + Math.floor(Math.random() * 2);
    for (let f = 0; f < forks; f++) {
      const idx = Math.floor(mainPts.length * (0.25 + Math.random() * 0.45));
      const origin = mainPts[idx];
      const forkPts = makePath(origin.x, origin.z, origin.y, origin.y - (5 + Math.random() * 9), 2.4, 5);
      const forkMat = new THREE.MeshBasicMaterial({
        color: 0xdce9ff, transparent: true, opacity: 0.75, depthWrite: false,
      });
      const forkMesh = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(forkPts), 12, 0.06, 4, false),
        forkMat
      );
      this.scene.add(forkMesh);
      this.lightningBolts.push({ mesh: forkMesh, life: 0.8 });
    }
  }

  private stepLightningBolts(dt: number): void {
    for (let i = this.lightningBolts.length - 1; i >= 0; i--) {
      const b = this.lightningBolts[i];
      b.life -= dt * 4.5; // bolts are visible for a fraction of a second
      const mat = b.mesh.material as THREE.MeshBasicMaterial;
      // Flicker rather than a smooth fade — real strikes stutter as they re-strike the channel.
      mat.opacity = Math.max(0, b.life * (0.55 + Math.random() * 0.45));
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        this.lightningBolts.splice(i, 1);
      }
    }
  }

  private stepStorm(dt: number): void {
    // Decay any active flash.
    if (this.stormFlashLight.intensity > 0) {
      this.stormFlashLight.intensity = Math.max(0, this.stormFlashLight.intensity - dt * 9);
    }

    if (this.stormIntensity < 0.05) return;

    this.stormFlashTimer -= dt * this.stormIntensity;
    if (this.stormFlashTimer <= 0) {
      // Occasional double-strike, which reads far more like real lightning than single pops.
      const strength = 1.6 + Math.random() * 3.4 * this.stormIntensity;
      this.stormFlashLight.intensity = strength;
      const boltX = (Math.random() - 0.5) * 60;
      const boltZ = (Math.random() - 0.5) * 60;
      this.stormFlashLight.position.set(boltX, 35 + Math.random() * 25, boltZ);
      // Most flashes get a visible channel; the rest read as in-cloud sheet lightning.
      if (Math.random() < 0.75) this.spawnLightningBolt(boltX, boltZ);
      if (Math.random() < 0.4) {
        clearTimeout(this.stormDoubleStrikeTimer);
        this.stormDoubleStrikeTimer = setTimeout(() => {
          if (this.stormFlashLight) this.stormFlashLight.intensity = strength * 0.7;
        }, 90 + Math.random() * 80);
      }
      this.playThunder();
      this.stormFlashTimer = 2.2 + Math.random() * 5 - this.stormIntensity * 1.6;
    }
  }

  /** Thunder: a longer, softer, lower-passed cousin of the eruption boom, delayed slightly
   *  after the flash the way distance actually delays it. */
  private playThunder(): void {
    if (!this.audioCtx || !this.audioMaster || this.audioMuted) return;
    const delay = 0.25 + Math.random() * 1.1;
    const t = this.audioCtx.currentTime + delay;
    const len = Math.floor(this.audioCtx.sampleRate * 1.6);
    const buf = this.audioCtx.createBuffer(1, len, this.audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 1.7);
      data[i] = (Math.random() * 2 - 1) * env;
    }

    const src = this.audioCtx.createBufferSource();
    src.buffer = buf;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(420, t);
    filter.frequency.exponentialRampToValueAtTime(70, t + 1.5);

    const gain = this.audioCtx.createGain();
    const peak = 0.16 + this.stormIntensity * 0.2;
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.6);

    src.connect(filter).connect(gain).connect(this.audioMaster);
    src.start(t);
    src.stop(t + 1.7);
  }

  // ================= RAIN / CRATER LAKE (stage VI) =================

  private buildRain(): void {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(this.rainCount * 3);
    this.rainVelocities = new Float32Array(this.rainCount);
    for (let i = 0; i < this.rainCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = Math.random() * 26;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
      this.rainVelocities[i] = 11 + Math.random() * 9;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xaac4d8, size: 0.09, transparent: true, opacity: 0.55, depthWrite: false });
    this.rainPoints = new THREE.Points(geo, mat);
    this.rainPoints.visible = false;
    this.scene.add(this.rainPoints);
  }

  /** Rain density is controlled by the geometry's draw range rather than by spawning and
   *  destroying particles — the full buffer is allocated once and we simply draw more of it as
   *  the storm builds, which costs nothing to scale up and down. Drops are also blown sideways
   *  in proportion to storm strength, so heavy rain visibly slants. */
  private stepRain(dt: number, elapsed: number): void {
    const active = this.rainActive || this.rainIntensity > 0.02;
    this.rainPoints.visible = active;
    if (!active) return;

    const drawn = Math.max(1, Math.floor(this.rainCount * Math.min(1, this.rainIntensity)));
    this.rainPoints.geometry.setDrawRange(0, drawn);

    const mat = this.rainPoints.material as THREE.PointsMaterial;
    mat.opacity = 0.3 + this.rainIntensity * 0.4;
    mat.size = 0.07 + this.rainIntensity * 0.06;

    // Gusting crosswind — the slant strengthens and eases rather than holding steady.
    const gust = (0.55 + Math.sin(elapsed * 0.7) * 0.3) * this.stormIntensity;
    const pos = this.rainPoints.geometry.attributes['position'] as THREE.BufferAttribute;

    for (let i = 0; i < drawn; i++) {
      const fall = this.rainVelocities[i] * (0.65 + this.rainIntensity * 0.5);
      let y = pos.getY(i) - fall * dt;
      let x = pos.getX(i) + gust * fall * 0.42 * dt;

      if (y < -1) {
        y = 22 + Math.random() * 6;
        x = (Math.random() - 0.5) * 40;
        pos.setZ(i, (Math.random() - 0.5) * 40);
      }
      if (x > 22) x -= 44;
      pos.setY(i, y);
      pos.setX(i, x);
    }
    pos.needsUpdate = true;
  }

  // ================= REGIONAL GEOGRAPHY (Central Luzon) =================
  //
  // Scene axes: +X = east, -X = west, -Z = north, +Z = south, Pinatubo at the origin.
  // Scale is roughly 1 unit ≈ 1.6 km, so the 12-unit mountain base ≈ 19 km across, which is
  // about right for Pinatubo's edifice and keeps Clark (~22 km east) at a plausible distance.
  //
  // Bearings below are real compass bearings from Pinatubo and the distances are approximate
  // but geographically ordered — this is meant to be recognisable, not survey-grade.

  /** Compass bearing (0 = north, 90 = east) + distance -> scene x/z. */
  private bearingXZ(bearingDeg: number, dist: number): { x: number; z: number } {
    const r = (bearingDeg * Math.PI) / 180;
    return { x: Math.sin(r) * dist, z: -Math.cos(r) * dist };
  }

  /** Lowland relief outside the volcano's own cone: gentle rolling ground, a broad apron
   *  sloping away from the edifice, and drops toward the west coast and Manila Bay.
   *  The ground mesh is displaced with this, and everything placed on the lowlands samples it,
   *  so settlements and rivers sit on the surface rather than floating above a flat plane. */
  private lowlandHeight(x: number, z: number): number {
    const d = Math.hypot(x, z);

    // Rolling relief — three offset waves so it doesn't read as a regular grid.
    let h =
      Math.sin(x * 0.055 + 1.3) * 0.55 +
      Math.cos(z * 0.048 - 0.7) * 0.5 +
      Math.sin((x + z) * 0.031 + 2.1) * 0.7;

    // Volcanic apron: the ground is raised close to the mountain and flattens out with distance.
    h += Math.max(0, 1 - d / 36) * 3.4;

    // West: the land falls away to the Zambales coast and the South China Sea.
    h -= Math.max(0, -x - 44) * 0.16;

    // South-east: the Pampanga delta drops toward Manila Bay.
    const bay = this.bearingXZ(150, 78);
    h -= Math.max(0, 1 - Math.hypot(x - bay.x, z - bay.z) / 40) * 4.2;

    return h;
  }

  /** Surface height for anything placed in the region: the cone near the middle, lowlands beyond. */
  private regionGroundHeight(x: number, z: number): number {
    const d = Math.hypot(x, z);
    if (d < this.EDIFICE_RADIUS) return this.sampleTerrainHeight(x, z);
    if (d < this.EDIFICE_RADIUS + 6) {
      // Blend across the join so nothing steps abruptly at the foot of the mountain.
      // Pushed out from 12.5/15 to match the wider edifice, or the lowland mesh would cut
      // straight through the new flanks.
      const t = (d - this.EDIFICE_RADIUS) / 6;
      return THREE.MathUtils.lerp(this.sampleTerrainHeight(x, z), this.lowlandHeight(x, z), t);
    }
    return this.lowlandHeight(x, z);
  }

  /** The five provinces around Pinatubo, at their real bearings. Zambales holds the volcano's
   *  west flank and the coast, Tarlac lies north, Pampanga east across the plain, Bataan south
   *  down the peninsula, and Bulacan further east beyond Pampanga. */
  private readonly provinces: { name: string; bearing: number; dist: number; color: number; spread: number }[] = [
    { name: 'ZAMBALES', bearing: 278, dist: 30, color: 0x4c5a44, spread: 26 },
    { name: 'TARLAC', bearing: 25, dist: 34, color: 0x5c5136, spread: 26 },
    { name: 'PAMPANGA', bearing: 108, dist: 32, color: 0x4e5638, spread: 26 },
    { name: 'BATAAN', bearing: 190, dist: 52, color: 0x43503c, spread: 22 },
    { name: 'BULACAN', bearing: 100, dist: 74, color: 0x4f4838, spread: 24 },
  ];

  /** Real towns and installations, placed at their approximate bearing/distance from the summit.
   *  `weight` drives settlement size, which is what produces the rural -> village -> town
   *  gradient rather than scattering identical buildings everywhere. */
 private readonly settlements: { name: string; bearing: number; dist: number; weight: number; civic: boolean }[] = [
  { name: 'Angeles', bearing: 88, dist: 55, weight: 1.0, civic: true },   // largest nearby city, east
  { name: 'Clark', bearing: 79, dist: 42, weight: 0.7, civic: false },    // air base, east
  { name: 'Bamban', bearing: 57, dist: 48, weight: 0.5, civic: true },    // north-east, on the Sacobia
  { name: 'Capas', bearing: 38, dist: 56, weight: 0.55, civic: true },    // north-east, Tarlac
  { name: 'Botolan', bearing: 264, dist: 46, weight: 0.45, civic: true }, // west, Zambales
  { name: 'Iba', bearing: 291, dist: 70, weight: 0.5, civic: true },      // north-west coast, Zambales capital
  { name: 'San Marcelino', bearing: 213, dist: 54, weight: 0.4, civic: true }, // south-west
  { name: 'San Fernando', bearing: 112, dist: 82, weight: 0.7, civic: true },  // east, Pampanga capital
  { name: 'Orani', bearing: 176, dist: 100, weight: 0.35, civic: false },  // south, Bataan
];

  private buildingWallMat!: THREE.MeshStandardMaterial;
  private buildingRoofMat!: THREE.MeshStandardMaterial;
  private buildingCivicMat!: THREE.MeshStandardMaterial;
  private vegetationMat!: THREE.MeshStandardMaterial;
  private fieldMats: THREE.MeshStandardMaterial[] = [];
  private seaMat!: THREE.MeshStandardMaterial;
  private roadMat!: THREE.MeshStandardMaterial;
  private lastAshApplied = -1;

  /** Everything sits in one group so the whole region can be tinted/aged as one unit. */
  private buildRegion(): void {
    this.buildRegionalGround();
    this.buildCoastalWater();
    this.buildBackgroundRanges();
    // Kept although nothing draws these any more: buildVegetation() still uses the paths
    // to keep forest clear of the drainage corridors, which reads as natural open ground.
    this.computeRiverPaths();
    this.buildFieldPatches();
    this.buildSettlements();
    this.buildVegetation();
    this.buildRoads();
    this.buildRailroad();
    this.buildProvinceLabels();
  }

  /** Displaced ground plane. Replaces the old flat 200x200 quad so the lowlands actually have
   *  relief — river valleys, the volcanic apron, and the drop toward the coast and the bay. */
  private buildRegionalGround(): void {
    const size = 400, seg = 150;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    const pos = geo.attributes['position'] as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);

    const lowGreen = new THREE.Color(0x3f5133);   // irrigated lowland
    const dryBrown = new THREE.Color(0x5a4a30);   // drier upland / apron
    const shore = new THREE.Color(0x6b6250);      // coastal flats
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      // Plane is built in XY then rotated, so its local y maps to world z.
      const x = pos.getX(i), z = pos.getY(i);
      const h = this.lowlandHeight(x, -z);
      pos.setZ(i, h);

      const d = Math.hypot(x, z);
      // Greener out on the plains, drier on the apron near the volcano, pale at the shoreline.
      const dryness = Math.max(0, 1 - d / 30);
      tmp.lerpColors(lowGreen, dryBrown, dryness);
      if (h < -0.6) tmp.lerp(shore, Math.min(1, -h / 3));

      const v = 0.9 + Math.random() * 0.2;
      colors[i * 3] = tmp.r * v;
      colors[i * 3 + 1] = tmp.g * v;
      colors[i * 3 + 2] = tmp.b * v;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, color: this.groundBaseColor.clone(),
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    this.groundMesh = ground;
    this.scene.add(ground);
  }

  /** The South China Sea off the Zambales coast to the west, and Manila Bay to the south-east —
   *  both real and both important for orienting the region. */
  private buildCoastalWater(): void {
    this.seaMat = new THREE.MeshStandardMaterial({
      color: 0x2f4a58, roughness: 0.18, metalness: 0.25, transparent: true, opacity: 0.92,
    });

    // West coast: a long strip beyond the Zambales lowlands.
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(120, 300), this.seaMat);
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(-118, -1.6, 0);
    this.geoGroup.add(sea);

    // Manila Bay to the south-east.
    const bay = this.bearingXZ(150, 92);
    const bayMesh = new THREE.Mesh(new THREE.CircleGeometry(46, 40), this.seaMat);
    bayMesh.rotation.x = -Math.PI / 2;
    bayMesh.position.set(bay.x, -1.5, bay.z);
    this.geoGroup.add(bayMesh);
  }

  /** One summit within a landform. A formation is built from several of these combined with
   *  max(), which is what produces saddles, shoulders and connected ridgelines rather than a
   *  collection of separate cones. */
  private makeMassifGeometry(
    centerX: number, centerZ: number, baseY: number,
    gridRadius: number,
    summits: { x: number; z: number; r: number; h: number; ex: number; ez: number; exp: number; rot: number }[],
    spurs: number, seed: number, haze: number
  ): THREE.BufferGeometry {
    const RINGS = 24, SEGS = 60;

    const maxH = Math.max(...summits.map((s) => s.h));
    // Noise sampled in a space scaled to the main edifice, so a small hill gets proportionally
    // the same size of bumps and channels as a large one rather than finer ones.
    const nScale = 26 / gridRadius;
    const uvScale = 1 / (8 * 7);   // ~8 world units per tile; terrainTexture.repeat is (7,7)

    const pos: number[] = [];
    const col: number[] = [];
    const uv: number[] = [];

    // Same stops as buildMountain, so the range shares the main mountain's palette.
    const baseColor = new THREE.Color(0x5a4326);
    const midColor = new THREE.Color(0x3f382f);
    const rockColor = new THREE.Color(0x4a4741);
    const hazeCol = new THREE.Color(0x93a0ad);
    const tmp = new THREE.Color();

    /** Surface height at a point, plus which summit dominates there. */
    const surface = (x: number, z: number) => {
      let y = 0, near = summits[0], nd = Infinity;

      for (const s of summits) {
        // Rotate into the summit's own frame so its elongation keeps its strike direction.
        // The mesh can no longer be rotated as a whole, because its skirt is now sampled
        // against world terrain and rotating it would slide the skirt off the ground.
        const c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
        const px = x - s.x, pz = z - s.z;
        const dx = (px * c - pz * sn) / s.ex;
        const dz = (px * sn + pz * c) / s.ez;
        const d = Math.hypot(dx, dz);
        if (d < nd) { nd = d; near = s; }
        if (d >= s.r) continue;
        // max(), not sum: overlapping summits meet in a saddle instead of piling into one
        // taller lump, which is what makes a connected ridge read as a ridge.
        const hh = s.h * Math.pow(1 - d / s.r, s.exp);
        if (hh > y) y = hh;
      }
      return { y, near, nd };
    };

    const emit = (x: number, y: number, z: number, hFrac: number, gully: number) => {
      pos.push(x, y, z);
      uv.push(x * uvScale, z * uvScale);

      const hf = Math.max(0, hFrac);
      if (hf < 0.35) tmp.lerpColors(baseColor, midColor, hf / 0.35);
      else tmp.lerpColors(midColor, rockColor, Math.min(1, (hf - 0.35) / 0.5));
      tmp.lerp(hazeCol, haze);

      const v = (0.9 + Math.abs(this.terrainNoise(x * 2.1, z * 2.1)) * 0.2) * (1 + gully * 0.22);
      col.push(tmp.r * v, tmp.g * v, tmp.b * v);
    };

    const sample = (x: number, z: number) => {
      const { y: base, near, nd } = surface(x, z);
      const t = THREE.MathUtils.clamp(nd / Math.max(0.001, near.r), 0, 1);
      const hFrac = base / maxH;

      let y = base;
      // Same roughness treatment as the main edifice.
      y += this.terrainNoise(x * nScale, z * nScale) * (0.35 + hFrac * 0.55) * maxH * 0.14;

      // Ridge spurs radiating from whichever summit is nearest.
      const ang = Math.atan2(z - near.z, x - near.x);
      const ridge =
        Math.sin(ang * spurs + seed) * 0.5 +
        Math.sin(ang * (spurs * 2 + 1) - seed * 1.7) * 0.28 +
        Math.sin(ang * (spurs * 3 + 2) + seed * 0.6) * 0.12;
      y += ridge * near.h * 0.09 * t * (1 - t) * 3;

      // Radial erosion channels, faded out at the summit and at the foot.
      const ch = Math.sin(ang * (spurs * 3 + 5) + seed * 0.3) + Math.sin(ang * (spurs * 5 + 3) - seed) * 0.4;
      const carve = Math.max(0, 1 - Math.pow(Math.abs(ch) / 1.4, 0.55));
      const gFade = t < 0.15 ? t / 0.15 : t > 0.9 ? Math.max(0, (1 - t) / 0.1) : 1;
      const gully = -carve * gFade * Math.min(1, t * 2);
      y += gully * near.h * 0.1;
      y = Math.max(0, y);

      // Outside the summits' footprints this mesh is a flat disc, and a flat disc laid on
      // rolling ground reads as a mud pool around the mountain. The skirt is therefore blended
      // onto the actual terrain height, so the mesh meets the ground exactly at its rim and
      // disappears into it instead of floating as a plate.
      // Keyed off how much mountain is actually here, not off grid radius.
      //
      // The skirt is pushed BELOW the ground, not onto it. The ground mesh sits at exactly
      // lowlandHeight - 0.05, so conforming the skirt to lowlandHeight put the two surfaces
      // precisely co-planar, and two co-planar surfaces z-fight - which renders as flickering
      // rings around every formation. Sinking it half a unit hides it under opaque ground.
      const cover = THREE.MathUtils.smoothstep(base, 0.02 * maxH, 0.30 * maxH);
      const groundOffset = this.lowlandHeight(centerX + x, centerZ + z) - baseY;
      const SKIRT_SINK = 0.9;
      y += (groundOffset - SKIRT_SINK) * (1 - cover);

      return { y, hFrac: THREE.MathUtils.clamp(y / maxH, 0, 1), gully };
    };

    // Trim the disc to the landform's actual outline. Previously the mesh was a full disc out
    // to gridRadius, so most of its area was flat ground-coloured plate with no mountain on it
    // at all - the thing that was reading as a pool. Marching inward per direction finds where
    // the terrain actually rises, so the mesh is only as wide as the mountain is.
    const edgeR: number[] = [];
    for (let a = 0; a < SEGS; a++) {
      const ang = (a / SEGS) * Math.PI * 2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      let r = gridRadius * 0.3;
      const STEPS = 40;
      for (let i = STEPS; i >= 1; i--) {
        const rr = gridRadius * (i / STEPS);
        if (surface(ca * rr, sa * rr).y > maxH * 0.015) { r = rr; break; }
      }
      // A little margin so the toe has room to taper down and sink out of sight.
      edgeR.push(Math.min(gridRadius, r * 1.12 + 0.8));
    }

    const c0 = sample(0, 0);
    emit(0, c0.y, 0, c0.hFrac, c0.gully);

    for (let r = 1; r <= RINGS; r++) {
      const t = r / RINGS;
      for (let a = 0; a < SEGS; a++) {
        const ang = (a / SEGS) * Math.PI * 2;
        const rr = edgeR[a] * t;
        const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
        const sres = sample(x, z);
        emit(x, sres.y, z, sres.hFrac, sres.gully);
      }
    }

    // Counter-clockwise seen from above, so faces point outward.
    const idx: number[] = [];
    for (let a = 0; a < SEGS; a++) idx.push(0, 1 + ((a + 1) % SEGS), 1 + a);
    for (let r = 0; r < RINGS - 1; r++) {
      for (let a = 0; a < SEGS; a++) {
        const a2 = (a + 1) % SEGS;
        const cur = 1 + r * SEGS, nxt = 1 + (r + 1) * SEGS;
        idx.push(cur + a, cur + a2, nxt + a);
        idx.push(cur + a2, nxt + a2, nxt + a);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /** Scatters a background range around the volcano.
   *
   *  Built as *formations* rather than as individual peaks. Each formation gets a landform type
   *  and one to four summits, combined with max() inside a single mesh so they share saddles and
   *  ridgelines and read as one connected massif. Formations themselves are also allowed to
   *  overlap, so massifs run into each other along the horizon.
   *
   *  Placement is rejection-sampled at random bearings rather than stepped around a ring, since
   *  evenly spaced bearings read as a fence however much the sizes vary. Formation size is drawn
   *  from a skewed distribution: mostly small hills, fewer medium, a handful of large ranges. */
  private buildBackgroundRanges(): void {
    type Summit = { x: number; z: number; r: number; h: number; ex: number; ez: number; exp: number; rot: number };
    const placed: { x: number; z: number; r: number }[] = [];

    const NEAR = 70, FAR = 180;
    const TARGET = 22;
    let attempts = 0;

    while (placed.length < TARGET && attempts < 1400) {
      attempts++;

      const bearing = Math.random() * 360;
      let dist = NEAR + Math.sqrt(Math.random()) * (FAR - NEAR);
      let p = this.bearingXZ(bearing, dist);
      let ground = this.lowlandHeight(p.x, p.z);

      // The land falls away west to the coast, and formations cannot sit nearer than ~52 without
      // cutting into the main edifice - so discarding wet candidates outright emptied the whole
      // western horizon. A candidate instead walks inward along its own bearing until it finds
      // land, which keeps bearings uniform while the range hugs the coastline.
      const wet = () => ground < -5 || p.x < -95;
      let guard = 0;
      while (wet() && dist > NEAR && guard++ < 10) {
        dist = Math.max(NEAR, dist * 0.9);
        p = this.bearingXZ(bearing, dist);
        ground = this.lowlandHeight(p.x, p.z);
      }
      if (wet()) continue;
      const baseY = Math.max(ground, -0.7);

      const near = 1 - (dist - NEAR) / (FAR - NEAR);

      // Size class, skewed so small hills dominate and big ranges are rare.
      const roll = Math.random();
      const cls = roll < 0.45 ? 'small' : roll < 0.8 ? 'medium' : 'large';
      const scale = cls === 'small' ? 0.55 + Math.random() * 0.25
        : cls === 'medium' ? 0.8 + Math.random() * 0.35
          : 1.2 + Math.random() * 0.5;

      const baseR = (8 + Math.random() * 7) * scale * (0.8 + near * 0.4);
      // Kept firmly under the main edifice's 17.
      const baseH = (2.2 + Math.random() * 4.4) * scale * (0.8 + near * 0.35);

      // --- landform type: not everything is a cone ---
      const forms = ['ridge', 'massif', 'dome', 'peak', 'twin'] as const;
      const form = forms[Math.floor(Math.random() * forms.length)];

      const summits: Summit[] = [];
      const axis = Math.random() * Math.PI * 2;   // strike direction of the formation

      // Each summit carries its own strike direction, since the mesh as a whole can no longer
      // be rotated (its skirt is sampled against world terrain).
      const addSummit = (ox: number, oz: number, r: number, h: number, ex: number, ez: number, exp: number) => {
        summits.push({ x: ox, z: oz, r, h, ex, ez, exp, rot: axis + (Math.random() - 0.5) * 0.8 });
      };

      if (form === 'ridge') {
        // A long crest with uneven high points strung along it — no radial symmetry at all.
        const n = 3 + Math.floor(Math.random() * 3);
        const span = baseR * (0.9 + Math.random() * 0.7);
        for (let i = 0; i < n; i++) {
          const f = (i / (n - 1) - 0.5) * 2;
          const jitter = (Math.random() - 0.5) * baseR * 0.25;
          addSummit(
            Math.cos(axis) * f * span + Math.cos(axis + 1.57) * jitter,
            Math.sin(axis) * f * span + Math.sin(axis + 1.57) * jitter,
            baseR * (0.55 + Math.random() * 0.25),
            baseH * (0.6 + Math.random() * 0.5),          // uneven elevations along the crest
            1.25 + Math.random() * 0.5, 0.7 + Math.random() * 0.25,
            1.5 + Math.random() * 0.7
          );
        }
      } else if (form === 'massif') {
        // A blocky cluster of shouldered summits at different heights.
        const n = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, d = Math.random() * baseR * 0.5;
          addSummit(Math.cos(a) * d, Math.sin(a) * d,
            baseR * (0.5 + Math.random() * 0.3),
            baseH * (0.55 + Math.random() * 0.55),
            0.85 + Math.random() * 0.5, 0.85 + Math.random() * 0.5,
            1.3 + Math.random() * 0.6);                   // low exponent -> broad, shouldered
        }
      } else if (form === 'dome') {
        // Old, weathered, rounded — a single very gentle swell.
        addSummit(0, 0, baseR * 0.95, baseH * 0.8,
          1 + Math.random() * 0.4, 0.8 + Math.random() * 0.3,
          1.15 + Math.random() * 0.35);                   // lowest exponent -> rounded top
      } else if (form === 'twin') {
        // Two peaks sharing a saddle.
        const sep = baseR * (0.35 + Math.random() * 0.25);
        for (let i = 0; i < 2; i++) {
          const sgn = i === 0 ? 1 : -1;
          addSummit(Math.cos(axis) * sep * sgn, Math.sin(axis) * sep * sgn,
            baseR * (0.6 + Math.random() * 0.2),
            baseH * (i === 0 ? 1 : 0.62 + Math.random() * 0.3),   // deliberately unequal
            1 + Math.random() * 0.3, 0.85 + Math.random() * 0.3,
            2.0 + Math.random() * 0.9);
        }
      } else {
        // A sharp single peak, with a smaller shoulder off to one side.
        addSummit(0, 0, baseR * 0.8, baseH,
          0.9 + Math.random() * 0.3, 0.85 + Math.random() * 0.3,
          2.4 + Math.random() * 1.1);                     // highest exponent -> sharp summit
        if (Math.random() < 0.7) {
          const a = Math.random() * Math.PI * 2, d = baseR * (0.4 + Math.random() * 0.2);
          addSummit(Math.cos(a) * d, Math.sin(a) * d,
            baseR * 0.45, baseH * (0.35 + Math.random() * 0.25),
            1, 1, 2.0 + Math.random() * 0.6);
        }
      }

      // Grid must cover every summit's footprint.
      let gridRadius = Math.max(...summits.map((s) =>
        Math.hypot(s.x, s.z) + s.r * Math.max(s.ex, s.ez))) * 1.05;

      // Clamp the formation into the background rather than clamping the inputs, so the shape
      // variety above is preserved and only the overall scale is bounded. Without this, long
      // ridges compounded span x summit-radius x elongation and reached 54 units wide - wider
      // than the main edifice itself, which would have stolen the scene.
      const MAX_EXTENT = 24;    // stays clearly under the main mountain's 30
      const MAX_HEIGHT = 8.5;   // and half its 17-unit summit
      if (gridRadius > MAX_EXTENT) {
        const k = MAX_EXTENT / gridRadius;
        summits.forEach((s) => { s.x *= k; s.z *= k; s.r *= k; });
        gridRadius = MAX_EXTENT;
      }
      const hMax = Math.max(...summits.map((s) => s.h));
      if (hMax > MAX_HEIGHT) {
        const k = MAX_HEIGHT / hMax;
        summits.forEach((s) => { s.h *= k; });
      }

      // Formations are allowed to run into one another (~40% overlap), so the horizon shows
      // connected ranges rather than a line of discrete islands.
      let crowded = false;
      for (const q of placed) {
        if (Math.hypot(p.x - q.x, p.z - q.z) < (gridRadius + q.r) * 0.6) { crowded = true; break; }
      }
      if (crowded) continue;

      const haze = THREE.MathUtils.clamp((dist - NEAR) / (FAR - NEAR), 0, 1) * 0.62;
      const geo = this.makeMassifGeometry(
        p.x, p.z, baseY,
        gridRadius, summits,
        3 + Math.floor(Math.random() * 4),
        Math.random() * 100, haze
      );

      // Same material setup as the main mountain: shared terrain texture over vertex colours,
      // matching roughness and metalness, smooth shading.
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        map: this.terrainTexture,
        roughness: 0.92,
        metalness: 0.03,
        flatShading: false,
        color: this.noTint.clone(),
      });
      const mesh = new THREE.Mesh(geo, mat);
      // Only a hair below baseY: the skirt already meets the terrain exactly, so a large
      // offset would sink the formation instead of seating it.
      mesh.position.set(p.x, baseY - 0.05, p.z);
      this.geoGroup.add(mesh);

      placed.push({ x: p.x, z: p.z, r: gridRadius });
    }

    // --- Mount Arayat: real, isolated, ~40 km east on the Pampanga plain. Built with the same
    // --- generator so it matches the range's style, but kept as its own named landmark. ---
    const ar = this.bearingXZ(94, 27);
    const arayatMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: this.terrainTexture,
      roughness: 0.92,
      metalness: 0.03,
      flatShading: false,
      color: new THREE.Color(0xa8b39a),   // slight green cast; ash aging still drives this
    });
    const arBase = this.lowlandHeight(ar.x, ar.z);
    const arayat = new THREE.Mesh(
      this.makeMassifGeometry(ar.x, ar.z, arBase, 7.4, [
        { x: 0, z: 0, r: 7.0, h: 8.1, ex: 1, ez: 0.88, exp: 2.1, rot: 0.6 },
      ], 4, 12.5, 0),
      arayatMat
    );
    arayat.position.set(ar.x, arBase - 0.05, ar.z);
    arayat.castShadow = true;
    this.geoGroup.add(arayat);
    this.arayatMat = arayatMat;
  }

  /** Local surface gradient, used to decide what can grow or be farmed where. Forests thin out
   *  on cliffs, fields only occupy genuinely flat ground — the same rules that shape the real
   *  landscape, rather than scattering things at random. */
  private terrainSlope(x: number, z: number): number {
    const e = 1.2;
    const gx = this.regionGroundHeight(x + e, z) - this.regionGroundHeight(x - e, z);
    const gz = this.regionGroundHeight(x, z + e) - this.regionGroundHeight(x, z - e);
    return Math.hypot(gx, gz) / (2 * e);
  }

  /** The drainage radiating off Pinatubo. Computed once and shared, because both the water
   *  channels and the lahar deposits that buried them follow the same lines. */
  private computeRiverPaths(): void {
    const systems: { bearing: number; drift: number; len: number; w0: number; w1: number }[] = [
      { bearing: 10, drift: -14, len: 66, w0: 0.9, w1: 4.6 },   // O'Donnell — north into Tarlac
      { bearing: 48, drift: 12, len: 60, w0: 1.0, w1: 5.4 },    // Sacobia–Bamban — NE past Clark
      { bearing: 96, drift: 6, len: 52, w0: 0.9, w1: 4.0 },     // Abacan — east toward Angeles
      { bearing: 126, drift: 14, len: 62, w0: 1.0, w1: 5.0 },   // Pasig–Potrero — SE into the delta
      { bearing: 168, drift: -10, len: 48, w0: 0.8, w1: 3.4 },  // Gumain — south
      { bearing: 214, drift: 12, len: 52, w0: 0.9, w1: 4.4 },   // Sto. Tomas — SW
      { bearing: 268, drift: -6, len: 54, w0: 1.0, w1: 4.8 },   // Bucao — west to the coast
      { bearing: 300, drift: -12, len: 50, w0: 0.8, w1: 3.6 },  // Maloma/Balin-Baquero — NW
    ];

    this.riverPaths = systems.map((s) => {
      const pts: { x: number; z: number; w: number }[] = [];
      let dist = 7;
      for (let i = 0; i < 16; i++) {
        const t = i / 15;
        // Meander grows downstream: headwaters run straight off the cone, lowland reaches wander.
        const bear = s.bearing + s.drift * t + Math.sin(i * 1.9 + s.bearing) * (1.5 + t * 7);
        const p = this.bearingXZ(bear, dist);
        pts.push({ x: p.x, z: p.z, w: THREE.MathUtils.lerp(s.w0, s.w1, Math.pow(t, 0.7)) });
        dist += s.len / 16;
      }
      return pts;
    });
  }

  /** Builds a ribbon that follows a path and widens downstream, hugging the ground.
   *  Used for both the lahar fans and the rail alignment. */
  private buildRibbon(
    path: { x: number; z: number; w: number }[], lift: number,
    colA: THREE.Color, colB: THREE.Color, jitter: number
  ): THREE.BufferGeometry {
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const tmp = new THREE.Color();

    for (let i = 0; i < path.length; i++) {
      const p = path[i];
      const prev = path[Math.max(0, i - 1)], next = path[Math.min(path.length - 1, i + 1)];
      // Perpendicular to the direction of travel.
      const dx = next.x - prev.x, dz = next.z - prev.z;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len, nz = dx / len;

      const t = i / (path.length - 1);
      for (const side of [-1, 1]) {
        // Ragged edges: a deposit does not have parallel banks.
        const w = p.w * (1 + (Math.sin(i * 2.3 + side * 1.7) * jitter));
        const x = p.x + nx * w * side, z = p.z + nz * w * side;
        pos.push(x, this.regionGroundHeight(x, z) + lift, z);
        tmp.lerpColors(colA, colB, THREE.MathUtils.clamp(t + (Math.random() - 0.5) * 0.25, 0, 1));
        const v = 0.9 + Math.random() * 0.2;
        col.push(tmp.r * v, tmp.g * v, tmp.b * v);
      }
    }
    for (let i = 0; i < path.length - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, c, b); idx.push(b, c, d);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  /** Forest canopy.
   *
   *  Two things were making the old vegetation read as artificial: the geometry was a 5-sided
   *  cone, which at any distance is a green spike, and placement was uniform random, which
   *  produces even stipple rather than woodland. Now the unit is a lumpy canopy blob, and trees
   *  are grown in clumps whose position is decided by the terrain itself — dense on moist
   *  mid-slopes, thinning at altitude, absent on cliffs, on the farmed plain, and along the
   *  lahar channels, which in reality are scoured bare. */
  private buildVegetation(): void {
    this.vegetationMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 1, flatShading: true,
    });

    const mats: THREE.Matrix4[] = [];
    const tints: THREE.Color[] = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const tmp = new THREE.Color();

    const TREELINE = this.SUMMIT_HEIGHT * 0.72;

    /** How much forest belongs at this point, 0..1 — the rule that ties canopy to terrain. */
    const suitability = (x: number, z: number, y: number) => {
      if (y < -0.3) return 0;                                   // water
      const slope = this.terrainSlope(x, z);
      if (slope > 1.35) return 0;                               // cliff faces stay bare
      // Scoured bare along the lahar channels.
      for (const path of this.riverPaths) {
        for (const p of path) {
          if (Math.hypot(x - p.x, z - p.z) < p.w * 2.1) return 0;
        }
      }
      // Thins out toward the treeline, and the exposed summit carries none.
      const alt = 1 - THREE.MathUtils.smoothstep(y, TREELINE * 0.55, TREELINE);
      // Densest on the flanks and foothills, thinner out on the cultivated plain.
      const d = Math.hypot(x, z);
      const belt = d < 40 ? 1 : 1 - THREE.MathUtils.smoothstep(d, 40, 95) * 0.65;
      // Slope preference: gentle-to-moderate ground carries the best forest.
      const slopePref = 0.45 + THREE.MathUtils.smoothstep(slope, 0.05, 0.5) * 0.55;
      return alt * belt * slopePref;
    };

    // Grow clumps rather than individual trees: this is what produces irregular stands with
    // ragged edges and open gaps, instead of an even stipple across the whole map.
    let guard = 0;
    while (mats.length < 6400 && guard < 24000) {
      guard++;
      const bearing = Math.random() * 360;
      const dist = 7 + Math.pow(Math.random(), 0.75) * 88;
      const c = this.bearingXZ(bearing, dist);
      const cy = this.regionGroundHeight(c.x, c.z);
      const fit = suitability(c.x, c.z, cy);
      if (fit < 0.25 || Math.random() > fit) continue;

      // Clump size varies a lot, so stands read as unevenly sized woods.
      const spread = 2.2 + Math.random() * 5.5;
      const n = 4 + Math.floor(Math.random() * 13 * fit);
      // One hue per clump, varied slightly per tree — real canopies are patchy, not rainbow.
      const clumpHue = 0.26 + Math.random() * 0.07;
      const clumpLight = 0.14 + Math.random() * 0.1;

      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.pow(Math.random(), 0.6) * spread;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        const y = this.regionGroundHeight(x, z);
        if (suitability(x, z, y) < 0.12) continue;

        const h = 0.55 + Math.random() * 1.25;
        const w = h * (0.7 + Math.random() * 0.5);
        q.setFromEuler(new THREE.Euler(
          (Math.random() - 0.5) * 0.25, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.25));
        v.set(x, y + h * 0.42, z);
        sc.set(w, h, w * (0.8 + Math.random() * 0.4));
        mats.push(m.clone().compose(v, q, sc));

        tmp.setHSL(
          clumpHue + (Math.random() - 0.5) * 0.03,
          0.34 + Math.random() * 0.2,
          clumpLight + (Math.random() - 0.5) * 0.05
        );
        tints.push(tmp.clone());
      }
    }

    // A lumpy blob rather than a cone: at this scale it reads as a rounded canopy crown, and
    // flat shading keeps the facets reading as foliage clumps.
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), this.vegetationMat, mats.length);
    mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
    tints.forEach((c, i) => mesh.setColorAt(i, c));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    this.vegetationMesh = mesh;
    this.geoGroup.add(mesh);
  }

  /** Agricultural mosaic. Fields are irregular polygons on genuinely flat lowland rather than
   *  rotated rectangles scattered by radius — so they sit where farmland would actually be, and
   *  their boundaries look surveyed rather than stamped. */
  private buildFieldPatches(): void {
    const palette = [0x5f7c40, 0x82803f, 0x6f8d4e, 0x8f8450, 0x506d38, 0x9a9264];
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const tmp = new THREE.Color();
    let base = 0;
    let placed = 0, guard = 0;

    while (placed < 150 && guard < 2200) {
      guard++;
      // The Pampanga plain east and south-east carries most of the farmland.
      const bearing = Math.random() < 0.72 ? 55 + Math.random() * 120 : Math.random() * 360;
      const dist = 22 + Math.random() * 62;
      const c = this.bearingXZ(bearing, dist);
      const cy = this.regionGroundHeight(c.x, c.z);
      if (cy < -0.2 || cy > 6) continue;                       // not in water, not up the mountain
      if (this.terrainSlope(c.x, c.z) > 0.28) continue;        // farmland needs flat ground

      // An irregular polygon: jittered radii around the centre, slightly elongated.
      const sides = 5 + Math.floor(Math.random() * 4);
      const rad = 2.2 + Math.random() * 4.5;
      const rot = Math.random() * Math.PI * 2;
      const elong = 0.6 + Math.random() * 0.8;
      const col0 = new THREE.Color(palette[Math.floor(Math.random() * palette.length)]);

      const centreIdx = base;
      pos.push(c.x, cy + 0.05, c.z);
      tmp.copy(col0); col.push(tmp.r, tmp.g, tmp.b);
      base++;

      for (let i = 0; i < sides; i++) {
        const a = rot + (i / sides) * Math.PI * 2;
        const rr = rad * (0.7 + Math.random() * 0.6);
        const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr * elong;
        pos.push(x, this.regionGroundHeight(x, z) + 0.05, z);
        const v = 0.9 + Math.random() * 0.18;
        col.push(col0.r * v, col0.g * v, col0.b * v);
        base++;
      }
      for (let i = 0; i < sides; i++) {
        idx.push(centreIdx, centreIdx + 1 + ((i + 1) % sides), centreIdx + 1 + i);
      }
      placed++;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    this.fieldMats = [mat];
    this.fieldMesh = undefined;                                 // no longer instanced
    this.geoGroup.add(new THREE.Mesh(geo, mat));
  }

  /** The rail line across the Central Luzon plain. It runs north–south well clear of the
   *  volcano, keeping to the flat ground east of the foothills as the real alignment does,
   *  rather than striking across the terrain. */
  private buildRailroad(): void {
    const pts: { x: number; z: number; w: number }[] = [];
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const z = THREE.MathUtils.lerp(-95, 105, t);
      // Follows the plain, easing around the foothills rather than climbing them.
      let x = 44 + Math.sin(t * 2.6 + 0.4) * 7 + Math.sin(t * 6.1) * 2.5;
      // Nudge downhill if the alignment strays onto rising ground.
      for (let k = 0; k < 6; k++) {
        if (this.regionGroundHeight(x, z) < 3.2) break;
        x += 2.2;
      }
      pts.push({ x, z, w: 0.42 });
    }
    const railMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.95, metalness: 0.05,
    });
    // Alternating tone along the ribbon suggests ballast and sleepers without extra geometry.
    const geo = this.buildRibbon(pts, 0.1, new THREE.Color(0x584f45), new THREE.Color(0x6d6558), 0.05);
    const cols = geo.attributes['color'] as THREE.BufferAttribute;
    for (let i = 0; i < cols.count; i++) {
      const k = Math.floor(i / 2) % 2 === 0 ? 1.18 : 0.85;
      cols.setXYZ(i, cols.getX(i) * k, cols.getY(i) * k, cols.getZ(i) * k);
    }
    cols.needsUpdate = true;
    this.geoGroup.add(new THREE.Mesh(geo, railMat));
  }





  /** Settlements are built with instanced meshes: five archetypes, one draw call each, with
   *  per-instance transforms and colors. Density falls off from each town centre, so the
   *  landscape reads as town core -> village fringe -> scattered rural homes. */
  private buildSettlements(): void {
    this.buildingWallMat = new THREE.MeshStandardMaterial({ color: 0xc9bda4, roughness: 0.95 });
    this.buildingRoofMat = new THREE.MeshStandardMaterial({ color: 0x8a5f42, roughness: 0.95 });
    this.buildingCivicMat = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.85 });

    const walls: THREE.Matrix4[] = [];
    const wallTints: THREE.Color[] = [];
    const roofs: THREE.Matrix4[] = [];
    const roofTints: THREE.Color[] = [];
    const civic: THREE.Matrix4[] = [];
    const towers: THREE.Matrix4[] = [];

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();

    const push = (
      list: THREE.Matrix4[], x: number, y: number, z: number,
      sx: number, sy: number, sz: number, rotY: number
    ) => {
      e.set(0, rotY, 0);
      q.setFromEuler(e);
      v.set(x, y, z);
      s.set(sx, sy, sz);
      list.push(m.clone().compose(v, q, s));
    };

    for (const town of this.settlements) {
      const c = this.bearingXZ(town.bearing, town.dist);
      const count = Math.round(18 + town.weight * 60);
      const radius = 2.5 + town.weight * 6;

      for (let i = 0; i < count; i++) {
        // Radial falloff: dense core, sparse fringe.
        const t = Math.pow(Math.random(), 0.55);
        const a = Math.random() * Math.PI * 2;
        const x = c.x + Math.cos(a) * t * radius;
        const z = c.z + Math.sin(a) * t * radius;
        const y = this.lowlandHeight(x, z);
        if (y < -0.7) continue;

        const central = 1 - t;                       // 1 at the core, 0 at the edge
        const rotY = Math.random() * Math.PI * 2;

        // Core buildings are bigger and blockier; fringe buildings are small rural homes.
        const big = central > 0.55 && Math.random() < town.weight;
        const w = big ? 1.4 + Math.random() * 1.6 : 0.7 + Math.random() * 0.6;
        const d = big ? 1.4 + Math.random() * 1.6 : 0.7 + Math.random() * 0.6;
        const hgt = big ? 1.0 + Math.random() * 1.8 : 0.5 + Math.random() * 0.35;

        push(walls, x, y + hgt / 2, z, w, hgt, d, rotY);
        wallTints.push(new THREE.Color().setHSL(0.09, 0.16, big ? 0.58 + Math.random() * 0.16 : 0.46 + Math.random() * 0.2));

        // Roof: pyramidal on rural homes, low and flat-ish on bigger town blocks.
        const roofH = big ? 0.28 + Math.random() * 0.25 : 0.4 + Math.random() * 0.3;
        push(roofs, x, y + hgt + roofH / 2, z, Math.max(w, d) * 0.78, roofH, Math.max(w, d) * 0.78, rotY + Math.PI / 4);
        roofTints.push(new THREE.Color().setHSL(
          0.03 + Math.random() * 0.06, 0.3 + Math.random() * 0.2, 0.24 + Math.random() * 0.16
        ));
      }

      // Civic core: a church with a bell tower plus a long school/municipal block. Generic
      // silhouettes standing for the kind of buildings these towns have — not named landmarks.
      if (town.civic) {
        const y = this.lowlandHeight(c.x, c.z);
        const rot = Math.random() * Math.PI * 2;
        push(civic, c.x, y + 0.9, c.z, 1.5, 1.8, 3.6, rot);                    // church nave
        push(towers, c.x + Math.cos(rot) * 1.9, y + 1.7, c.z + Math.sin(rot) * 1.9, 0.7, 3.4, 0.7, rot); // bell tower
        push(civic, c.x + 3.2, y + 0.5, c.z - 2.4, 4.4, 1.0, 1.4, rot * 0.5);  // school block
      }
    }

    const instance = (
      geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial,
      mats: THREE.Matrix4[], tints?: THREE.Color[]
    ) => {
      if (!mats.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, mats.length);
      mats.forEach((mm, i) => mesh.setMatrixAt(i, mm));
      if (tints) tints.forEach((c, i) => mesh.setColorAt(i, c));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.geoGroup.add(mesh);
      this.settlementMeshes.push(mesh);
      return mesh;
    };

    instance(new THREE.BoxGeometry(1, 1, 1), this.buildingWallMat, walls, wallTints);
    instance(new THREE.ConeGeometry(0.72, 1, 4), this.buildingRoofMat, roofs, roofTints);
    instance(new THREE.BoxGeometry(1, 1, 1), this.buildingCivicMat, civic);
    instance(new THREE.BoxGeometry(1, 1, 1), this.buildingCivicMat, towers);
  }



  /** Roads linking the towns back toward the volcano's foot, with simple bridge decks where
   *  they cross the major channels. */
  private buildRoads(): void {
    this.roadMat = new THREE.MeshStandardMaterial({ color: 0x6a6156, roughness: 1 });
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.9 });

    for (const town of this.settlements) {
      const pts: THREE.Vector3[] = [];
      const steps = 7;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const dist = THREE.MathUtils.lerp(19, town.dist, t);
        const bear = town.bearing + Math.sin(t * 3.1) * 5;
        const p = this.bearingXZ(bear, dist);
        pts.push(new THREE.Vector3(p.x, this.regionGroundHeight(p.x, p.z) + 0.07, p.z));
      }
      const road = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 30, 0.22, 4, false),
        this.roadMat
      );
      this.geoGroup.add(road);

      // A short bridge deck partway along, where the road crosses a drainage channel.
      const mid = pts[Math.floor(steps * 0.55)];
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.7), bridgeMat);
      deck.position.copy(mid).setY(mid.y + 0.12);
      deck.rotation.y = Math.atan2(mid.z, mid.x);
      this.geoGroup.add(deck);
    }
  }

  /** Province name plates, placed at each province's real bearing from the summit. Kept small
   *  and semi-transparent so they annotate the 3D scene rather than turning it into a flat map. */
  private buildProvinceLabels(): void {
    for (const prov of this.provinces) {
      const p = this.bearingXZ(prov.bearing, prov.dist);

      const canvas = document.createElement('canvas');
      canvas.width = 256; canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, 256, 64);
      ctx.font = '600 30px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,214,180,0.92)';
      ctx.fillText(prov.name, 128, 32);

      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.75, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(p.x, this.lowlandHeight(p.x, p.z) + 6.5, p.z);
      sprite.scale.set(11, 2.75, 1);
      this.geoGroup.add(sprite);
      this.provinceLabels.push(sprite);

      // A small ground marker under each label so it reads as anchored to a place.
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.5, 12),
        new THREE.MeshBasicMaterial({ color: 0xe8622f, transparent: true, opacity: 0.5 })
      );
      dot.rotation.x = -Math.PI / 2;
      dot.position.set(p.x, this.lowlandHeight(p.x, p.z) + 0.1, p.z);
      this.geoGroup.add(dot);
    }
  }

  /** Ages the whole region as ash accumulates: vegetation greys and dulls, buildings and fields
   *  get buried, rivers turn to sediment-grey lahar channels, and the sea goes flat and murky.
   *  Driven by the existing landscapeAsh value, so it tracks the timeline automatically. */
  private applyRegionAsh(): void {
    if (Math.abs(this.landscapeAsh - this.lastAshApplied) < 0.01) return;
    this.lastAshApplied = this.landscapeAsh;
    const a = this.landscapeAsh;

    const ashGrey = this.groundAshColor;
    const lerpTo = (mat: THREE.MeshStandardMaterial, base: THREE.Color, amount: number) => {
      mat.color.copy(base).lerp(ashGrey, amount);
    };

    if (this.vegetationMat) {
      // The canopy carries its greens per-instance now, so this material's colour is a white
      // multiplier — seeding it with the old dark green would have blackened every tree.
      // Vegetation doesn't just grey as ash falls, it dies back, so it darkens as well as dulls.
      this.vegetationMat.color.setRGB(1, 1, 1).lerp(ashGrey, a * 0.8);
      this.vegetationMat.color.multiplyScalar(1 - a * 0.35);
    }
    if (this.buildingWallMat) lerpTo(this.buildingWallMat, new THREE.Color(0xc9bda4), a * 0.8);
    if (this.buildingRoofMat) lerpTo(this.buildingRoofMat, new THREE.Color(0x8a5f42), a * 0.85);
    if (this.buildingCivicMat) lerpTo(this.buildingCivicMat, new THREE.Color(0xd8d2c2), a * 0.8);
    // Arayat is textured now, so its colour multiplies the map rather than being the final
    // shade — the old dark 0x47563f base would render it nearly black. Lightened to match.
    if (this.arayatMat) lerpTo(this.arayatMat, new THREE.Color(0xa8b39a), a * 0.7);
    if (this.roadMat) lerpTo(this.roadMat, new THREE.Color(0x6a6156), a * 0.9);

    this.fieldMats.forEach((mat) => { mat.color.setRGB(1, 1, 1).lerp(ashGrey, a * 0.55); });
    // Crops are buried outright, so the per-instance colors are aged too rather than only
    // multiplying a grey over them.
    if (this.fieldMesh && this.fieldMesh.instanceColor) {
      const c = new THREE.Color();
      this.fieldBaseColors.forEach((base, i) => {
        c.copy(base).lerp(ashGrey, a * 0.9);
        this.fieldMesh!.setColorAt(i, c);
      });
      this.fieldMesh.instanceColor.needsUpdate = true;
    }

    if (this.seaMat) {
      this.seaMat.color.copy(new THREE.Color(0x2f4a58)).lerp(new THREE.Color(0x4a4f4e), a * 0.6);
      this.seaMat.roughness = THREE.MathUtils.lerp(0.18, 0.5, a * 0.7);
    }
  }

  /** Small rocky protrusions sitting just above the eventual aftermath lake level — matching the
   *  real dome-island documented in Lake Pinatubo's crater lake in years after the eruption. */
  private buildLakeIsland(): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4741, roughness: 0.95 });
    const islandY = this.craterFloorY + this.mountainMesh.position.y + this.craterDepth * 0.5 + 0.08;
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + Math.random() * 0.18, 0), mat);
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.6 + Math.random() * 0.8;
      mesh.position.set(Math.cos(angle) * dist, islandY, Math.sin(angle) * dist);
      mesh.userData['baseY'] = islandY;
      this.lakeIslands.push(mesh);
      this.scene.add(mesh);
    }
  }

  // ================= AMBIENT AUDIO (procedural synthesis — no external assets) =================

  private initAudio(): void {
    if (this.audioCtx) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    this.audioCtx = new Ctx();

    this.audioMaster = this.audioCtx.createGain();
    this.audioMaster.gain.value = this.audioMuted ? 0 : 0.35;
    this.audioMaster.connect(this.audioCtx.destination);

    // A single shared filtered-noise bed stands in for wind, steam, rain, and rumble alike —
    // only the filter's tuning changes between chapters, rather than separate synth voices.
    const buffer = this.audioCtx.createBuffer(1, this.audioCtx.sampleRate * 2, this.audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.noiseSource = this.audioCtx.createBufferSource();
    this.noiseSource.buffer = buffer;
    this.noiseSource.loop = true;

    this.noiseFilter = this.audioCtx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.value = 1400;
    this.noiseFilter.Q.value = 0.5;

    this.noiseGain = this.audioCtx.createGain();
    this.noiseGain.gain.value = 0;

    this.noiseSource.connect(this.noiseFilter).connect(this.noiseGain).connect(this.audioMaster);
    this.noiseSource.start();

    this.rumbleOsc = this.audioCtx.createOscillator();
    this.rumbleOsc.type = 'sine';
    this.rumbleOsc.frequency.value = 40;

    this.rumbleGain = this.audioCtx.createGain();
    this.rumbleGain.gain.value = 0;

    this.rumbleOsc.connect(this.rumbleGain).connect(this.audioMaster);
    this.rumbleOsc.start();

    this.applyAudioProfile();
  }

  private applyAudioProfile(): void {
    if (!this.audioCtx || !this.noiseFilter || !this.noiseGain || !this.rumbleGain || !this.rumbleOsc) return;
    const t = this.audioCtx.currentTime;
    const ramp = 1.4;

    const profiles: Record<ChapterId, { freq: number; q: number; noise: number; rumble: number; rumbleHz: number }> = {
      'before-1991': { freq: 1400, q: 0.5, noise: 0.10, rumble: 0, rumbleHz: 40 },
      'early-unrest': { freq: 2200, q: 0.8, noise: 0.12, rumble: 0.04, rumbleHz: 40 },
      'escalating-unrest': { freq: 900, q: 0.8, noise: 0.20, rumble: 0.18, rumbleHz: 46 },
      'eruption': { freq: 500, q: 0.6, noise: 0.28, rumble: 0.30, rumbleHz: 55 },
      'aftermath': { freq: 3200, q: 0.5, noise: 0.16, rumble: 0.02, rumbleHz: 36 },
    };
    const p = profiles[this.currentChapter.id];
    this.noiseFilter.frequency.setTargetAtTime(p.freq, t, ramp);
    this.noiseFilter.Q.setTargetAtTime(p.q, t, ramp);
    this.noiseGain.gain.setTargetAtTime(this.audioMuted ? 0 : p.noise, t, ramp);
    this.rumbleGain.gain.setTargetAtTime(this.audioMuted ? 0 : p.rumble, t, ramp);
    this.rumbleOsc.frequency.setTargetAtTime(p.rumbleHz, t, ramp);
  }

  private playBoom(): void {
    if (!this.audioCtx || !this.audioMaster) return;
    const t = this.audioCtx.currentTime;
    const len = Math.floor(this.audioCtx.sampleRate * 0.6);
    const buf = this.audioCtx.createBuffer(1, len, this.audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);

    const src = this.audioCtx.createBufferSource();
    src.buffer = buf;

    const filter = this.audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 0.55);

    const gain = this.audioCtx.createGain();
    gain.gain.setValueAtTime(this.audioMuted ? 0 : 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

    src.connect(filter).connect(gain).connect(this.audioMaster);
    src.start(t);
    src.stop(t + 0.6);
  }

  // ================= ERUPTION SEQUENCE =================

  triggerEruption(): void {
    if (this.isErupting) return;
    this.initAudio();
    clearTimeout(this.phaseTimer);
    this.setPhase('rumble');
  }

  /** Resets just the eruption — clears every particle, restores the intact summit and calm
   *  weather, then re-runs the sequence from the first rumble. Unlike replay(), this stays on
   *  the eruption chapter and keeps the viewer's unlocked progress. */
  restartEruption(): void {
    // Cancel every timer this component owns, not just the eruption ones — a restart mid-sequence
    // must not leave an older callback alive to fire into the new run. Repeated clicks are safe
    // because each one cancels the previous restart's pending trigger before scheduling its own.
    clearTimeout(this.phaseTimer);
    clearTimeout(this.eruptionBurstTimer);
    clearTimeout(this.quakeTimer);
    clearTimeout(this.precursorPuffTimer);
    clearTimeout(this.stormDoubleStrikeTimer);
    clearInterval(this.plumeCountUpId);
    this.clearEruptionParticles();

    this.phase = 'idle';
    this.shakeAmount = 0;
    this.displayedPlume = 0;
    this.smokeTarget = 0.4;
    this.smokeIntensity = 0.4;
    this.craterFill = 0;
    this.craterFillTarget = 0;
    this.rockfallIntensity = 1;
    this.rockfallsActive = false;

    // Reset every free-running accumulator, so spawn cadences restart from a clean phase
    // instead of inheriting wherever the previous run happened to leave them.
    this.rockfallTimer = 0;
    this.bubbleTimer = 0;
    this.eddyTimer = 0;
    this.lightningTimer = 0;
    this.stormFlashTimer = 2;
    if (this.lightningLight) this.lightningLight.intensity = 0;

    // Snap the summit back before re-running, so the collapse is visible again from the start.
    this.calderaCollapse = 0;
    this.calderaCollapseTarget = 0;
    this.craterOpen = 0;          // re-seal the summit
    this.craterOpenTarget = 0;
    this.updateCalderaGeometry();

    this.stormIntensity = 0.3;
    this.stormIntensityTarget = 0.3;
    this.rainIntensity = 0.18;
    this.rainIntensityTarget = 0.18;
    if (this.stormFlashLight) this.stormFlashLight.intensity = 0;

    // Brief beat so the reset state is visible before it all kicks off again.
    this.phaseTimer = setTimeout(() => this.triggerEruption(), 420);
  }

  /** Shared teardown for every transient eruption particle pool. */
  private clearEruptionParticles(): void {
    this.ejecta.forEach((e) => {
      this.ejectaGroup.remove(e.mesh);
      (e.mesh.material as THREE.Material).dispose();
    });
    this.ejecta = [];

    this.rockfalls.forEach((r) => {
      this.scene.remove(r.mesh);
      (r.mesh.material as THREE.Material).dispose();
    });
    this.rockfalls = [];

    this.pyroclastic.forEach((p) => {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    });
    this.pyroclastic = [];

    this.shockwaves.forEach((s) => {
      this.scene.remove(s.mesh);
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
    });
    this.shockwaves = [];

    this.dustPuffs.forEach((d) => {
      this.scene.remove(d.sprite);
      (d.sprite.material as THREE.Material).dispose();
    });
    this.dustPuffs = [];

    this.magmaBubbles.forEach((b) => {
      this.scene.remove(b.mesh);
      (b.mesh.material as THREE.Material).dispose();
    });
    this.magmaBubbles = [];

    this.lightningBolts.forEach((b) => {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
    });
    this.lightningBolts = [];

    // Smoke sprites are shared with the ambient (non-eruption) system, so they're cleared here
    // too — otherwise a restart leaves the previous eruption's plume hanging in the sky.
    this.smokeSprites.forEach((s) => {
      this.smokeGroup.remove(s.sprite);
      (s.sprite.material as THREE.Material).dispose();
    });
    this.smokeSprites = [];

    // Billow cells are plain data, but they must go or the new column inherits the old one's shape.
    this.plumeEddies = [];
  }

  private setPhase(phase: EruptionPhase): void {
    this.phase = phase;
    clearTimeout(this.phaseTimer);

    switch (phase) {
      case 'rumble':
        this.shakeAmount = 0.03;
        this.smokeTarget = 0.45;
        this.rockfallsActive = true;      // the mountain starts shedding material before it opens
        this.rockfallIntensity = 1.6;
        this.craterOpenTarget = 0.18;     // the sealed summit starts to give
        // Yunya's outer bands arrive first: cloud thickens and the first rain starts.
        this.stormIntensityTarget = 0.45;
        this.rainIntensityTarget = 0.3;
        this.rainActive = true;
        this.skyDarknessTarget = 0.9;
        this.phaseTimer = setTimeout(() => this.setPhase('rising'), 1400);
        break;
      case 'rising':
        this.craterFillTarget = 0.9;
        this.smokeTarget = 0.7;
        this.shakeAmount = 0.06;
        this.rockfallIntensity = 2.4;
        this.craterOpenTarget = 0.55;     // the vent tears open as magma rises
        this.stormIntensityTarget = 0.7;
        this.rainIntensityTarget = 0.55;
        this.calderaCollapseTarget = 0.12;  // the summit begins to sag as the chamber empties
        this.phaseTimer = setTimeout(() => this.setPhase('pressure'), 2200);
        break;
      case 'pressure':
        // The quiet-before beat: shaking peaks, rockfalls go constant, but nothing has vented yet.
        this.craterFillTarget = 0.98;
        this.shakeAmount = 0.11;
        this.smokeTarget = 0.4;           // smoke briefly *drops* — the conduit has sealed
        this.rockfallIntensity = 3.6;
        this.craterOpenTarget = 0.85;
        this.stormIntensityTarget = 0.85;
        this.rainIntensityTarget = 0.7;
        this.calderaCollapseTarget = 0.25;
        this.phaseTimer = setTimeout(() => this.setPhase('burst'), 1100);
        break;
      case 'burst':
        this.shakeAmount = 0.55;
        this.smokeTarget = 1;
        this.spawnShockwave();
        // Seed billow cells first, so the opening blast's ash has cells to bind to immediately
        // rather than spending its first second as unattached drift.
        this.eddyTimer = 0;
        for (let k = 0; k < 9; k++) { this.eddyTimer = 0; this.maybeSpawnEddy(0.001); }
        this.spawnEjecta(1.4);
        this.spawnPyroclasticSurge();
        this.playBoom();
        this.rockfallIntensity = 4.5;
        this.craterOpenTarget = 1;        // fully open for the blast
        // Full typhoon plus the summit giving way — both peak together, as they did on June 15.
        this.stormIntensityTarget = 1;
        this.rainIntensityTarget = 1;
        this.calderaCollapseTarget = 0.7;
        this.stormFlashTimer = 0;          // strike immediately on the blast
        this.animatePlumeCountUp(this.outcome.plumeHeightKm);
        this.startContinuousBursts();
        this.phaseTimer = setTimeout(() => this.setPhase('overflow'), 900);
        break;
      case 'overflow':
        this.spawnPyroclasticSurge();
        this.shakeAmount = 0.22;
        this.rockfallIntensity = 3;
        this.calderaCollapseTarget = 1;    // caldera fully open
        this.eruptionWitnessed = true;
        // Second surge partway through, so the climax keeps developing instead of decaying flat.
        this.phaseTimer = setTimeout(() => {
          if (this.phase !== 'overflow') return;
          this.spawnPyroclasticSurge();
          this.spawnEjecta(0.8);
          this.playBoom();
          this.shakeAmount = Math.max(this.shakeAmount, 0.3);
          this.phaseTimer = setTimeout(() => this.setPhase('cooling'), 3600);
        }, 2600);
        break;
      case 'cooling':
        this.smokeTarget = 0.12;
        this.craterFillTarget = 0.15;
        this.shakeAmount = 0.02;
        this.rockfallIntensity = 1.4;
        this.stormIntensityTarget = 0.5;   // the storm outlasts the blast, then eases
        this.rainIntensityTarget = 0.55;
        this.phaseTimer = setTimeout(() => {
          this.phase = 'idle';
          this.shakeAmount = 0;
          this.rockfallIntensity = 1;
          this.rockfallsActive = this.currentChapter.id === 'escalating-unrest';
        }, 5000);
        break;
    }
  }

  /** "Continuous explosions" during the climax — repeated smaller ejecta pulses (with a matching
   *  boom and a forced lightning flash) rather than a single burst. Self-terminates once the
   *  eruption moves past the burst/overflow phases. */
  private startContinuousBursts(): void {
    clearTimeout(this.eruptionBurstTimer);
    const tick = () => {
      if (this.phase !== 'burst' && this.phase !== 'overflow') return;
      this.spawnEjecta(0.35);
      this.playBoom();
      this.lightningTimer = 0;
      this.eruptionBurstTimer = setTimeout(tick, 650 + Math.random() * 500);
    };
    this.eruptionBurstTimer = setTimeout(tick, 700 + Math.random() * 400);
  }

  private animatePlumeCountUp(target: number): void {
    clearInterval(this.plumeCountUpId);
    this.displayedPlume = 0;
    const steps = 24;
    let i = 0;
    this.plumeCountUpId = setInterval(() => {
      i++;
      this.displayedPlume = Math.round((target * i) / steps);
      if (i >= steps) clearInterval(this.plumeCountUpId);
    }, 25);
  }

  // ================= EJECTA (ash column, real 3D particles) =================

  /** Two particle populations, because a Plinian column has two: the fine ash that makes up the
   *  column itself (light, draggy, rises high, spreads into the umbrella), and a much smaller
   *  number of incandescent ballistic bombs thrown clear on steep arcs. Mixing them in one
   *  population is what made the old burst read as a uniform spray. */
  private spawnEjecta(scale: number = 1): void {
        const baseCount = this.outcome.kind === 'ash' ? 900 : this.outcome.kind === 'steam' ? 380 : 260;
    const count = Math.max(8, Math.round(baseCount * scale));
    if (this.ejecta.length > 5000) return; // hard ceiling

    // Ash is emitted in clumps rather than evenly, so the column develops lumpy billows
    // instead of a smooth, even sheet of particles.
    let clumpAngle = Math.random() * Math.PI * 2;
    let clumpRadius = Math.sqrt(Math.random());
    let clumpLeft = 0;

    for (let i = 0; i < count; i++) {
      const isBomb = Math.random() < 0.07; // a small minority, so they read as individual events

      if (!isBomb && clumpLeft <= 0) {
        clumpAngle = Math.random() * Math.PI * 2;
        clumpRadius = Math.sqrt(Math.random());
        clumpLeft = 4 + Math.floor(Math.random() * 7);
      }
      if (!isBomb) clumpLeft--;

      // Very wide size variance — big slow clots plus fine fast ash is what makes a real
      // column look cauliflowered rather than uniformly grainy.
      const size = isBomb ? 0.6 + Math.random() * 0.9 : 1.1 + Math.pow(Math.random(), 1.7) * 6.5;

      const mat = new THREE.MeshStandardMaterial({
        color: isBomb ? 0x3a1206 : 0x2a2521,
        emissive: isBomb ? 0xff5a1f : 0x000000,
        emissiveIntensity: isBomb ? 2.2 : 0,
        roughness: isBomb ? 0.55 : 1,
        transparent: true,
        opacity: 1,
        depthWrite: false, // soft overlapping ash rather than hard intersecting spheres
      });
      const mesh = new THREE.Mesh(isBomb ? this.ejectaGeoBomb : this.ejectaGeoAsh, mat);
      mesh.scale.setScalar(size);

            // Launch from a tight throat — the column is forced through a vent under pressure.
      const throat = isBomb ? 2.2 : 1.6;
      const a = isBomb ? Math.random() * Math.PI * 2 : clumpAngle + (Math.random() - 0.5) * 0.7;
      const rr = (isBomb ? Math.sqrt(Math.random()) : clumpRadius) * throat;
      mesh.position.set(Math.cos(a) * rr, this.ventTopY + 0.3, Math.sin(a) * rr);
      this.ejectaGroup.add(mesh);

      let vel: THREE.Vector3;
            if (isBomb) {
        // Steep ballistic arcs that clear the rim and land back on the flanks.
        const outward = 6 + Math.random() * 10;
        vel = new THREE.Vector3(Math.cos(a) * outward, 14 + Math.random() * 10, Math.sin(a) * outward);
      } else {
        // Gas-thrust jet: fast core, slower margins, and heavy clots launched slower than fines.
        const coreness = 1 - rr / throat;
        const massDrag = 1 - (size - 0.6) / 4 * 0.45;
        const upSpeed = (18 + coreness * 22 + Math.random() * 10) * massDrag;
        vel = new THREE.Vector3((Math.random() - 0.5) * 2, upSpeed, (Math.random() - 0.5) * 2);
      }

      // Bind this particle to one of the live billow cells rather than to the column axis.
      // Newer (lower) cells are favoured so fresh ash joins the cells still near the vent.
      let eddy: PlumeEddy | null = null;
      const offset = new THREE.Vector3();
      if (!isBomb && this.plumeEddies.length) {
        const pool = this.plumeEddies;
        let best: PlumeEddy | null = null;
        for (let k = 0; k < 3; k++) {
          const cand = pool[Math.floor(Math.random() * pool.length)];
          if (!best || cand.pos.y < best.pos.y) best = cand;
        }
        eddy = best;
        // A random point inside the cell, biased toward its edge so cells look shell-like
        // and lumpy rather than as solid uniform balls.
        const u = Math.random() * Math.PI * 2;
        const v = Math.acos(2 * Math.random() - 1);
        const rad = 0.45 + Math.pow(Math.random(), 0.5) * 0.75;
        offset.set(
          Math.sin(v) * Math.cos(u) * rad,
          Math.cos(v) * rad * 0.75,
          Math.sin(v) * Math.sin(u) * rad
        );
      }

      this.ejecta.push({
        mesh, vel, life: 1, size, bomb: isBomb, eddy, offset,
        spin: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
        swirl: (Math.random() - 0.5) * 1.7,               // churn around the column axis
        radialJitter: 0.55 + Math.random() * 1.05,        // how far out this particle rides
      });
    }
  }

  private stepEjecta(dt: number): void {
    const ventY = this.lavaMesh.position.y;

    for (let i = this.ejecta.length - 1; i >= 0; i--) {
      const e = this.ejecta[i];
      const p = e.mesh.position;
      const mat = e.mesh.material as THREE.MeshStandardMaterial;

      if (e.bomb) {
        // Heavy, barely any drag, cools from white-hot to dull red as it flies.
        e.vel.y -= 13 * dt;
        p.addScaledVector(e.vel, dt);
        e.life -= dt * 0.22;
        mat.emissiveIntensity = Math.max(0, 2.2 * e.life);
        mat.color.setRGB(0.23 * e.life, 0.07 * e.life, 0.02);
        e.mesh.rotation.x += e.spin.x * dt;
        e.mesh.rotation.z += e.spin.z * dt;

        // Bombs land on the flanks and throw dust rather than passing through the mountain.
        const groundY = this.sampleTerrainHeight(p.x, p.z);
        if (p.y < groundY && e.vel.y < 0) {
          this.spawnDustPuff(p.clone().setY(groundY), e.size * 0.5);
          e.life = 0;
        }
      } else {
        // Ash no longer follows a radius function around the column axis — that is what made
        // the plume axisymmetric and tube-like no matter how wide it got. Instead each particle
        // tracks its own turbulent billow cell, so the plume's shape is the emergent sum of
        // dozens of independently rising, swelling, drifting clouds.
                const alt = Math.max(0, p.y - ventY);

        // The gas-thrust root stays narrow and violent: right at the vent the jet dominates and
        // cell-following is suppressed, so the column has a tight, powerful base.
        const jet = alt < 9 ? 1 - alt / 9 : 0;

        if (e.eddy && e.eddy.life > 0) {
          const ed = e.eddy;

          // Slowly rotate the particle's offset within its cell — the cell churns internally.
          const s = ed.spin * dt;
          const cs = Math.cos(s), sn = Math.sin(s);
          const ox = e.offset.x * cs - e.offset.z * sn;
          const oz = e.offset.x * sn + e.offset.z * cs;
          e.offset.x = ox; e.offset.z = oz;

          const tx = ed.pos.x + e.offset.x * ed.radius;
          const ty = ed.pos.y + e.offset.y * ed.radius;
          const tz = ed.pos.z + e.offset.z * ed.radius;

          // Loose attraction, so particles trail and lag behind their cell instead of moving
          // rigidly with it — that lag is what produces wispy, torn billow edges.
          const grip = 2.3 * (1 - jet);
          e.vel.x += (tx - p.x) * grip * dt;
          e.vel.y += (ty - p.y) * grip * 0.75 * dt;
          e.vel.z += (tz - p.z) * grip * dt;
               } else {
          // Detached — the cell that carried this particle has broken up. It now drifts on
          // its own residual buoyancy and the wind, dispersing at the plume's ragged margins.
          const buoy = Math.max(0, 1 - alt / 55) * 5.5;
          e.vel.y += (buoy - 3.0) * dt;
          const shear = Math.min(1, alt / 45);
          e.vel.x += (this.plumeWind.x * shear - e.vel.x * 0.4) * dt * 0.6;
          e.vel.z += (this.plumeWind.z * shear - e.vel.z * 0.4) * dt * 0.6;
        }

        // Fine-grained turbulence on top of the cell motion, strongest mid-column where
        // entrainment is doing the most work.
        const turb = 3.4 * (1 - jet * 0.7);
        e.vel.x += (Math.random() - 0.5) * turb * dt;
        e.vel.y += (Math.random() - 0.5) * turb * 0.5 * dt;
        e.vel.z += (Math.random() - 0.5) * turb * dt;

        // Drag — heavier clots shed momentum faster, so different portions of the plume
        // visibly move at different speeds.
        const massDrag = 0.5 + (e.size - 0.6) / 4 * 0.5;
        e.vel.x -= e.vel.x * massDrag * dt;
        e.vel.z -= e.vel.z * massDrag * dt;
        e.vel.y -= e.vel.y * massDrag * 0.5 * dt;

        p.addScaledVector(e.vel, dt);
        e.life -= dt * 0.085;

        // Clots swell as they rise and entrain air — the cauliflower texture.
        e.mesh.scale.setScalar(e.size * (1 + alt * 0.13 + (1 - e.life) * 1.4));

                // Dark, dirty ash — near-black in the dense lower column, lifting only to a mid grey
        // in the diffuse top. Deliberately never approaches white.
        const paleness = Math.min(1, alt / 60);
        mat.color.setRGB(0.10 + paleness * 0.30, 0.09 + paleness * 0.28, 0.09 + paleness * 0.27);
        e.mesh.rotation.y += e.spin.y * dt * 0.3;
      }

      mat.opacity = Math.max(0, Math.min(1, e.life * (e.bomb ? 1 : 0.62)));

      if (e.life <= 0 || p.y < -2) {
        this.ejectaGroup.remove(e.mesh);
        (e.mesh.material as THREE.Material).dispose(); // geometry is shared — never disposed here
        this.ejecta.splice(i, 1);
      }
    }
  }

  // ================= SHOCKWAVE RING (burst only) =================

  /** The condensation ring that snaps outward from the vent at the moment of the blast.
   *  One clear, fast, readable event — it's what sells the burst as an impact rather than
   *  a gradual ramp-up. */
  private spawnShockwave(): void {
    const geo = new THREE.RingGeometry(0.6, 1.0, 64);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd9b8, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, this.lavaMesh.position.y + 0.5, 0);
    this.scene.add(mesh);
    this.shockwaves.push({ mesh, life: 1 });
  }

  private stepShockwaves(dt: number): void {
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.life -= dt * 0.85;
      const t = 1 - s.life;
      s.mesh.scale.setScalar(1 + t * 16);          // races outward
      s.mesh.position.y += dt * 1.6;               // and lifts slightly as it goes
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, s.life * 0.5);
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        s.mesh.geometry.dispose();
        (s.mesh.material as THREE.Material).dispose();
        this.shockwaves.splice(i, 1);
      }
    }
  }

  // ================= SMOKE (billboarded sprites, curling upward with turbulence) =================

  private maybeSpawnSmoke(): void {
    const spawnChance = 0.1 + this.smokeIntensity * 0.5;
    if (Math.random() > spawnChance) return;

    const mat = new THREE.SpriteMaterial({
      map: this.smokeTexture,
      color: this.isErupting ? 0x2a2622 : 0x6a625a,
      transparent: true,
      opacity: 0.28 + this.smokeIntensity * 0.3,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const scale = 0.8 + Math.random() * 0.6;
    sprite.scale.set(scale, scale, 1);
    sprite.position.set(
      (Math.random() - 0.5) * 0.6,
      this.ventTopY + 0.4,
      (Math.random() - 0.5) * 0.6
    );
    this.smokeGroup.add(sprite);
    this.smokeSprites.push({ sprite, vy: 0.4 + this.smokeIntensity * 1.2, seed: Math.random() * 1000 });
  }

  private stepSmoke(dt: number, elapsed: number): void {
    this.smokeSprites.forEach((s) => {
      s.sprite.position.x += Math.sin(elapsed * 0.6 + s.seed) * 0.006 + Math.sin(elapsed * 1.7 + s.seed * 2) * 0.003;
      s.sprite.position.z += Math.cos(elapsed * 0.5 + s.seed) * 0.006;
      s.sprite.position.y += s.vy * dt;

      const heightFrac = (s.sprite.position.y - this.ventTopY) / 14;
      if (this.isErupting && heightFrac > 0.5) {
        const spread = (heightFrac - 0.5) * 2;
        s.sprite.position.x += Math.sign(s.sprite.position.x || 1) * spread * 0.02;
        s.vy *= 0.995;
      }

      s.sprite.scale.multiplyScalar(1 + dt * 0.15);
      const mat = s.sprite.material as THREE.SpriteMaterial;
      mat.opacity -= dt * 0.045;
      const lightness = Math.min(1, heightFrac * 1.2);
      if (this.isErupting) {
        // Eruption smoke is ash-laden: dark grey-brown, lifting only slightly with height.
        mat.color.setRGB(0.12 + lightness * 0.22, 0.11 + lightness * 0.20, 0.10 + lightness * 0.19);
      } else {
        mat.color.setRGB(0.3 + lightness * 0.4, 0.28 + lightness * 0.38, 0.26 + lightness * 0.36);
      }
    });

    for (let i = this.smokeSprites.length - 1; i >= 0; i--) {
      const s = this.smokeSprites[i];
      if ((s.sprite.material as THREE.SpriteMaterial).opacity <= 0) {
        this.smokeGroup.remove(s.sprite);
        (s.sprite.material as THREE.Material).dispose();
        this.smokeSprites.splice(i, 1);
      }
    }
  }

  // ================= MAIN LOOP =================

  private animate = (): void => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.getElapsedTime();

    // ---- smoothly-animated ambient targets ----
    this.smokeIntensity += (this.smokeTarget - this.smokeIntensity) * dt * 1.2;
    this.craterFill += (this.craterFillTarget - this.craterFill) * dt * 1.4;
    this.magmaBaseGlow += (this.magmaBaseGlowTarget - this.magmaBaseGlow) * dt * 0.8;
    this.skyDarkness += (this.skyDarknessTarget - this.skyDarkness) * dt * 0.6;
    this.landscapeAsh += (this.landscapeAshTarget - this.landscapeAsh) * dt * 0.5;
    this.lakeFormation += (this.lakeFormationTarget - this.lakeFormation) * dt * 0.3;
    // Collapse is deliberately slow — the summit should visibly give way over seconds, not snap.
    this.calderaCollapse += (this.calderaCollapseTarget - this.calderaCollapse) * dt * 0.45;
    // The vent opens on the same easing, so the summit splits rather than popping open.
    this.craterOpen += (this.craterOpenTarget - this.craterOpen) * dt * 0.9;
    this.stormIntensity += (this.stormIntensityTarget - this.stormIntensity) * dt * 0.5;
    this.rainIntensity += (this.rainIntensityTarget - this.rainIntensity) * dt * 0.6;

    this.updateCalderaGeometry();

    // ---- crater: magma glow, later transitioning into a still crater lake ----
    // The disc both widens and drops as the caldera opens, so the lava pool — and later the
    // crater lake — fills the new, larger basin instead of floating in the middle of it.
    const collapseDrop = this.calderaCollapse * this.craterDepth * this.CALDERA_DROP;
    const lavaY = this.craterFloorY + this.mountainMesh.position.y + this.craterDepth * this.craterFill - collapseDrop;
    this.lavaMesh.position.y = lavaY;
    this.lavaMesh.scale.setScalar(1 + this.calderaCollapse * this.CALDERA_WIDEN);
    this.lavaLight.position.y = lavaY + 0.3;

    // Rocky islets ride the collapsing floor down rather than hanging in mid-air.
    this.lakeIslands.forEach((m) => { m.position.y = (m.userData['baseY'] as number) - collapseDrop; });

    const dynamicGlow = this.magmaBaseGlow + this.craterFill * 1.6;
    this.lavaMaterial.emissiveIntensity = dynamicGlow * (1 - this.lakeFormation);
    this.lavaLight.intensity = (1.8 + this.craterFill * 4) * (1 - this.lakeFormation * 0.85);
    const heat = 0.5 + Math.sin(elapsed * 6) * 0.05;
    this.lavaMaterial.emissive.setRGB(1, 0.35 + this.craterFill * heat * 0.3, 0.1);
    this.lavaMaterial.color.lerpColors(this.lavaBaseColor, this.lakeColor, this.lakeFormation);
    this.lavaMaterial.roughness = THREE.MathUtils.lerp(0.4, 0.15, this.lakeFormation);

    // ---- landscape recoloring toward ash-grey ----
    (this.mountainMesh.material as THREE.MeshStandardMaterial).color.lerpColors(this.noTint, this.ashTint, this.landscapeAsh);
    (this.groundMesh.material as THREE.MeshStandardMaterial).color.lerpColors(this.groundBaseColor, this.groundAshColor, this.landscapeAsh);
    // Vegetation, settlements, fields, roads, rivers and sea all age with the same value.
    this.applyRegionAsh();

    // ---- water movement: slow shimmer on the sea, calming right down once ash smothers it ----
    if (this.seaMat) {
      this.seaMat.roughness = THREE.MathUtils.lerp(0.18, 0.5, this.landscapeAsh * 0.7)
        + Math.sin(elapsed * 0.4) * 0.03;
    }

    // ---- sky and fog darkening as unrest builds ----
    const skyMat = this.skyMesh.material as THREE.ShaderMaterial;
    (skyMat.uniforms['topColor'].value as THREE.Color).lerpColors(this.skyCalm.top, this.skyDark.top, this.skyDarkness);
    (skyMat.uniforms['horizonColor'].value as THREE.Color).lerpColors(this.skyCalm.horizon, this.skyDark.horizon, this.skyDarkness);
    (skyMat.uniforms['bottomColor'].value as THREE.Color).lerpColors(this.skyCalm.bottom, this.skyDark.bottom, this.skyDarkness);
    (this.scene.fog as THREE.FogExp2).color.lerpColors(this.fogCalm, this.fogDark, this.skyDarkness);

    this.stepCracks(dt);

    this.maybeSpawnSmoke();
    this.maybeSpawnFumaroleSteam();
    this.stepSmoke(dt, elapsed);
    this.stepLightning(dt);
    this.stepStorm(dt);
    this.stepLightningBolts(dt);
    this.maybeSpawnEddy(dt);
    this.stepEddies(dt, elapsed);
    this.maybeSpawnMagmaBubble(dt);
    this.stepMagmaBubbles(dt);
    this.maybeSpawnRockfall(dt);
    this.stepRockfalls(dt);
    this.stepDustPuffs(dt);
    this.stepShockwaves(dt);
    this.stepPyroclastic(dt);
    this.stepRain(dt, elapsed);

    if (this.ejecta.length > 0) this.stepEjecta(dt);

    this.stepCameraFly(dt);
    this.controls.update();

    if (this.shakeAmount > 0.001) {
      // Two layers: a slow ground roll (the low-frequency body wave you feel) plus fine chatter
      // on top. Decay is now per-second rather than per-frame, so the rumble lasts the same
      // length of time at 30fps and 144fps instead of dying ~5x faster on a fast display.
      const roll = Math.sin(elapsed * 7.3) * 0.55 + Math.sin(elapsed * 11.9) * 0.3;
      this.camera.position.x += (roll + (Math.random() - 0.5) * 0.9) * this.shakeAmount;
      this.camera.position.y += (Math.sin(elapsed * 9.1) * 0.4 + (Math.random() - 0.5) * 0.9) * this.shakeAmount * 0.7;
      this.camera.position.z += (Math.random() - 0.5) * this.shakeAmount * 0.35;
      this.shakeAmount *= Math.pow(0.12, dt); // ~88% decay per second, frame-rate independent
    }

    this.renderer.render(this.scene, this.camera);
    this.rafId = requestAnimationFrame(this.animate);
  };
  
}
