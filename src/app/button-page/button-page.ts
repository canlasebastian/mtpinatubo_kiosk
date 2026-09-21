import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, OnInit, OnDestroy, ChangeDetectorRef, AfterViewInit, HostListener } from '@angular/core';
import { Router } from "@angular/router";
import { AudioService } from '../services/audio.service'; // adjust path to match your project

interface TimelineSlide {
  id: number;
  images: string[];
  currentImageIndex: number;
  title: string;
  captionTitle: string;
  description: string;
  route: string;
}

@Component({
  selector: 'app-button-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './button-page.html',
  styleUrl: './button-page.css',
})
export class ButtonPage implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('sliderTrack') sliderTrack!: ElementRef;
  @ViewChild('kioskVideoPlayer') videoPlayer!: ElementRef<HTMLVideoElement>;
  @ViewChild('bgVideo') bgVideo!: ElementRef<HTMLVideoElement>;

  isMenuOpen = false;
  viewMode: 'carousel' | 'grid' = 'carousel';
  activeIndex: number = 1;
  private rotationInterval: any;

  private idleTimer: any;
  private readonly IDLE_DURATION_MS = 100000; // adjust to taste — 5s is very short for a kiosk

  slides: TimelineSlide[] = [
    {
      id: 1,
      images: ['assets/images/ptst1.jpg', 'assets/images/ptst2.JPG', 'assets/images/ptst9.jpg',],
      currentImageIndex: 0,
      title: '',
      captionTitle: 'Pinatubo Videos',
      description: 'Relive the disaster and raw destruction through actual footage of the 1991 eruption.',
      route: '/avp'
    },
    {
      id: 2,
      images: ['assets/images/ptst3.jpg', 'assets/images/ptst4.jpg', 'assets/images/ptst5.jpg', 'assets/images/ptst6.jpg', 'assets/images/ptst7.jpg', 'assets/images/ptst8.jpg', 'assets/images/ptst10.jpg', 'assets/images/ptst11.jpg'],
      currentImageIndex: 0,
      title: 'Mt. Pinatubo Stories',
      captionTitle: 'Pinatubo Stories',
      description: 'Watch personal journal entries and deeply moving stories of loss, hope, and survival.',
      route: '/videos'
    },
    {
      id: 3,
      images: ['assets/images/pttl1.jpg', 'assets/images/pttl2.jpg', 'assets/images/pttl3.jpg', 'assets/images/pttl4.jpg', 'assets/images/pttl5.jpg' ],
      currentImageIndex: 0,
      title: 'Reliving The Pinatubo Eruption',
      captionTitle: 'Reliving The Pinatubo Eruption',
      description: 'Experience the eruption timeline firsthand through an interactive historical simulation.',
      route: '/simulator'
    },
    {
      id: 4,
      images: ['/assets/images/chatbot/namalyariavatar.png' ],
      currentImageIndex: 0,
      title: 'Pinatubo Caldera',
      captionTitle: 'Ask Apo Namalyari (AI)',
      description: 'Let Apo Namalyari guide you through the ancient lore, geology, and history of the volcano.',
      route: '/apo-pinatubo'
    },
    {
      id: 5,
     images: ['assets/images/laharaya/laharaya_logo2.png', 'assets/images/laharaya/img1.png', 'assets/images/laharaya/img2.png', 'assets/images/laharaya/img3.png'],
      currentImageIndex: 0,
      title: 'Pinatubo Game',
      captionTitle: 'Laharaya (Game)',
      description: 'Build strategic defenses to protect towns and save communities from incoming lahar flows.',
      route: '/lahar-defense'
    }
  ];

  constructor(private router: Router, private cdr: ChangeDetectorRef, private audioService: AudioService) {}

  ngOnInit(): void {
    this.startActiveRotation();
    this.resetIdleTimer();
  }

  ngAfterViewInit(): void {
    if (this.bgVideo && this.bgVideo.nativeElement) {
      this.bgVideo.nativeElement.playbackRate = 0.45;
    }
  }

  ngOnDestroy(): void {
    this.stopRotation();
    this.clearIdleTimer();
  }

  goBack(): void {
    this.router.navigate(['']);
  }

  toggleMenu(): void {
    this.isMenuOpen = !this.isMenuOpen;
  }

  get isMusicPlaying(): boolean {
    return this.audioService.isPlaying;
  }

  toggleMusic(): void {
    this.audioService.toggleMute();
  }

  toggleViewMode(): void {
    this.viewMode = this.viewMode === 'carousel' ? 'grid' : 'carousel';

    if (this.viewMode === 'grid') {
      this.stopRotation();
      this.slides.forEach(s => s.currentImageIndex = 0);
    } else {
      this.startActiveRotation();
    }
  }

  onGridCardClick(targetRoute: string, event: MouseEvent): void {
    const clickedCard = event.currentTarget as HTMLElement;
    clickedCard.classList.add('clicked-flash');

    setTimeout(() => {
      this.router.navigate([targetRoute])
        .catch(error => {
          console.error(`Navigation error:`, error);
          clickedCard.classList.remove('clicked-flash');
        });
    }, 200);
  }

  startActiveRotation(): void {
    this.stopRotation();
    this.rotationInterval = setInterval(() => {
      const activeSlide = this.slides[this.activeIndex];
      
      if (activeSlide && activeSlide.images.length > 1) {
        activeSlide.currentImageIndex = (activeSlide.currentImageIndex + 1) % activeSlide.images.length;
        this.cdr.detectChanges();
      }
    }, 3000);
  }

  stopRotation(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
    }
  }

  onTrackScroll(event: Event): void {
    this.resetIdleTimer();
    const track = event.target as HTMLElement;
    const cards = track.querySelectorAll('.polaroid-card');
    const trackCenter = track.getBoundingClientRect().left + (track.offsetWidth / 2);

    let closestIndex = this.activeIndex;
    let minDistance = Infinity;

    cards.forEach((cardElement, i) => {
      const card = cardElement as HTMLElement;
      const cardCenter = card.getBoundingClientRect().left + (card.offsetWidth / 2);
      const distanceFromCenter = Math.abs(trackCenter - cardCenter);

      if (distanceFromCenter < minDistance) {
        minDistance = distanceFromCenter;
        closestIndex = i;
      }
    });

    if (this.activeIndex !== closestIndex) {
      this.slides[this.activeIndex].currentImageIndex = 0;
      this.activeIndex = closestIndex;
      this.startActiveRotation();
    }
  }

  setActiveCard(index: number, targetRoute: string, event: MouseEvent): void {
    const clickedCard = event.currentTarget as HTMLElement;

    if (this.activeIndex !== index) {
      this.slides[this.activeIndex].currentImageIndex = 0;
      this.activeIndex = index;
      
      this.startActiveRotation();
      
      clickedCard.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
      return;
    }

    clickedCard.classList.add('clicked-flash');

    setTimeout(() => {
      this.router.navigate([targetRoute])
        .catch(error => {
          console.error(`Navigation error:`, error);
          clickedCard.classList.remove('clicked-flash');
        });
    }, 200);
  }
  
    private resetIdleTimer(): void {
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      this.goBack(); // navigates to '' — your welcome page
    }, this.IDLE_DURATION_MS);
  }

  private clearIdleTimer(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
  }

  @HostListener('document:click')
  @HostListener('document:touchstart')
  @HostListener('document:mousemove')
  @HostListener('document:keydown')
  @HostListener('document:wheel')
  onUserActivity(): void {
    this.resetIdleTimer();
  }
}
