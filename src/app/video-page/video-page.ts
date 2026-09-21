import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';

interface Interviewee {
  id: number;
  name: string;
  avatar: string;
  videoSrc: string;
  storyTitle?: string;
  category?: string;
}

@Component({
  selector: 'app-video-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './video-page.html',
  styleUrl: './video-page.css',
})
export class VideoPage {
  @ViewChild('kioskVideoPlayer') videoPlayer!: ElementRef<HTMLVideoElement>;

  selectedPerson: Interviewee | null = null;
  videoUnavailable = false;

  filters: string[] = ['ALL', 'BEFORE', 'DURING', 'AFTER'];
  selectedFilter: string = 'ALL';

  currentPage = 0;
  itemsPerPage = 6;
  isTransitioning = false;
  swipeDirection: 'left' | 'right' | '' = 'left';

  private touchStartX = 0;
  private touchEndX = 0;

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  goBack(): void {
    const previous = sessionStorage.getItem('kioskPreviousRoute');
    if (previous && previous !== '/apo-pinatubo') {
      this.router.navigateByUrl(previous);
    } else {
      this.router.navigate(['/menu']);
    }
  }

  interviewees: Interviewee[] = [
    {
      id: 1,
      name: 'ELISA FEDELINO',
      avatar: '/assets/images/elisa.png',
      videoSrc: '/assets/videos/elisa.mp4',
      storyTitle: 'Mt. Pinatubo Survivor',
      category: 'DURING'
    },
    {
      id: 2,
      name: 'RANDOLF GARCIA',
      avatar: '/assets/images/randolf.png',
      videoSrc: '/assets/videos/randolf.mp4',
      storyTitle: 'Mt. Pinatubo Survivor',
      category: 'DURING'
    },
    {
      id: 3,
      name: 'VIOLY OCAMPO',
      avatar: '/assets/images/violy.png',
      videoSrc: '/assets/videos/violy.mp4',
      storyTitle: 'Mt. Pinatubo Survivor',
      category: 'DURING'
    },
    {
      id: 4,
      name: 'BISHOP BOBET',
      avatar: '/assets/images/bishop.jpg',
      videoSrc: '/assets/videos/Bishop_Bobet_enhanced.mp4',
      storyTitle: 'Bishop of Tarlac',
      category: 'DURING'
    },
    {
      id: 5,
      name: 'CECILE YUMUL',
      avatar: '/assets/images/cecile.jpg',
      videoSrc: '/assets/videos/Cecile_Yumul_During_enhanced.mp4',
      storyTitle: 'Broadcast Journalist',
      category: 'DURING'
    },
    {
      id: 6,
      name: 'LEVY LAUS',
      avatar: '/assets/images/levy.jpg',
      videoSrc: '/assets/videos/Levi_Laus_During_enhanced.mp4',
      storyTitle: 'Founder of Laus Group of Companies',
      category: 'DURING'
    },
    {
      id: 7,
      name: 'AMONG ED',
      avatar: '/assets/images/among.jpg',
      videoSrc: '/assets/videos/Among_Ed_Before_enhanced.mp4',
      storyTitle: 'Former Catholic Priest',
      category: 'BEFORE'
    },
    {
      id: 8,
      name: 'LILIA PINEDA',
      avatar: '/assets/images/pineda.jpg',
      videoSrc: '/assets/videos/Gov_Pineda_enhanced.mp4',
      storyTitle: 'Vice Governor of Pampanga',
      category: 'AFTER'
    },
    {
      id: 9,
      name: 'ABONG TAYAG',
      avatar: '/assets/images/tayag.jpg',
      videoSrc: '/assets/videos/Abong_Tayag_During_enhanced.mp4',
      storyTitle: 'Leader of MACCII',
      category: 'DURING'
    },
    {
      id: 10,
      name: 'OCA RODRIGUEZ',
      avatar: '/assets/images/oca.jpg',
      videoSrc: '/assets/videos/Oca_Rodriguez_During_enhanced.mp4',
      storyTitle: 'Former Mayor of San Fernando',
      category: 'DURING'
    },
    {
      id: 11,
      name: 'GUY HILBERO',
      avatar: '/assets/images/guy.png',
      videoSrc: '/assets/videos/Guy_Hilbero_Before_enhanced.mp4',
      storyTitle: 'Tourism Officer',
      category: 'BEFORE'
    },
        {
      id: 12,
      name: 'Gregg Westrick',
      avatar: '/assets/images/american.png',
      videoSrc: '/assets/videos/american_before.webm',
      storyTitle: '1991 Earthquake Survivor',
      category: 'BEFORE'
    },
    
  ];

  get filteredInterviewees(): Interviewee[] {
    if (this.selectedFilter === 'ALL') {
      return this.interviewees;
    }
    return this.interviewees.filter(person => person.category === this.selectedFilter);
  }

  get pagedInterviewees(): Interviewee[] {
    const startIndex = this.currentPage * this.itemsPerPage;
    return this.filteredInterviewees.slice(startIndex, startIndex + this.itemsPerPage);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredInterviewees.length / this.itemsPerPage);
  }

  // Prevents DOM element tearing/blinking during *ngFor rendering
  trackByPersonId(index: number, person: Interviewee): number {
    return person.id;
  }

  setFilter(filter: string): void {
    if (this.selectedFilter === filter) return;
    this.swipeDirection = 'left';
    this.selectedFilter = filter;
    this.currentPage = 0;
    this.triggerPageTransition();
  }

  setPage(pageIndex: number): void {
    if (this.currentPage === pageIndex || this.isTransitioning) return;
    this.swipeDirection = pageIndex > this.currentPage ? 'left' : 'right';
    this.currentPage = pageIndex;
    this.triggerPageTransition();
  }

  prevPage(): void {
    if (this.currentPage > 0 && !this.isTransitioning) {
      this.swipeDirection = 'right';
      this.currentPage--;
      this.triggerPageTransition();
    }
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages - 1 && !this.isTransitioning) {
      this.swipeDirection = 'left';
      this.currentPage++;
      this.triggerPageTransition();
    }
  }

  onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.changedTouches[0].screenX;
  }

  onTouchEnd(event: TouchEvent): void {
    this.touchEndX = event.changedTouches[0].screenX;
    this.handleSwipeGesture();
  }

  private handleSwipeGesture(): void {
    const threshold = 60;
    const swipeDistance = this.touchEndX - this.touchStartX;

    if (Math.abs(swipeDistance) > threshold) {
      if (swipeDistance < 0) {
        this.nextPage();
      } else {
        this.prevPage();
      }
    }
  }

  private triggerPageTransition(): void {
    this.isTransitioning = true;
    this.cdr.detectChanges();

    setTimeout(() => {
      this.isTransitioning = false;
      this.cdr.detectChanges();
    }, 320); 
  }

  openVideoModal(person: Interviewee): void {
    this.selectedPerson = person;
    this.videoUnavailable = false;
    this.cdr.detectChanges();

    setTimeout(() => {
      if (this.videoPlayer && this.videoPlayer.nativeElement) {
        this.videoPlayer.nativeElement.load();
        this.videoPlayer.nativeElement.play().catch(err => {
          console.warn("Kiosk presentation automatic media capture initialization intercept:", err);
        });
      }
    }, 50);
  }

  closeVideoModal(): void {
    if (this.videoPlayer && this.videoPlayer.nativeElement) {
      this.videoPlayer.nativeElement.pause();
    }
    this.selectedPerson = null;
    this.videoUnavailable = false;
    this.cdr.detectChanges();
  }

  onAvatarError(event: Event): void {
    (event.target as HTMLImageElement).src = '/assets/images/pinatubo.jpg';
  }

  onVideoError(): void {
    this.videoUnavailable = true;
    this.cdr.detectChanges();
  }
}