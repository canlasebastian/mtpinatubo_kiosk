import {
  Component,
  ElementRef,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

interface AVPVideo {
  id: number;
  title: string;
  description?: string;
  thumbnail: string;
  videoSrc: string;
  duration?: string;
}

@Component({
  selector: 'app-apv-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './apv-page.html',
  styleUrl: './apv-page.css'
})
export class ApvPage {

  @ViewChild('kioskVideoPlayer')
  videoPlayer?: ElementRef<HTMLVideoElement>;

  selectedVideo: AVPVideo | null = null;
  videoUnavailable = false;

  videos: AVPVideo[] = [
    {
      id: 1,
      title: 'PINATUBO LONG VIDEO',
      description: 'Isang audio visual presentation tungkol sa karanasan at alaala ng pagputok ng Mt. Pinatubo.',
      thumbnail: '/assets/images/vid1.png',
      videoSrc: '/assets/videos/vid3.mp4',
      duration: '12:11'
    },

    {
      id: 2,
      title: 'PINATUBO A REMEMBRANCE',
      description: 'Isang paglalakbay sa kasaysayan ng Mt. Pinatubo at ang malaking pagbabagong dulot ng pagsabog nito.',
      thumbnail: '/assets/images/vid2.png',
      videoSrc: '/assets/videos/avp1.mp4',
      duration: '10 :00'
    },

    {
      id: 3,
      title: 'PINATUBO AI VIDEO',
      description: 'Mga kuwento at alaala ng mga taong nakaranas ng epekto ng lahar matapos ang pagsabog ng Mt. Pinatubo.',
      thumbnail: '/assets/images/vid3.png',
      videoSrc: '/assets/videos/vid1.mp4',
      duration: '02:02'
    },

    {
      id: 4,
      title: 'PINATUBO SHORT VIDEO',
      description: 'Mga pagbabagong hinarap ng mga komunidad at ang kanilang pagbangon matapos ang kalamidad.',
      thumbnail: '/assets/images/vid4.png',
      videoSrc: '/assets/videos/vid4.mp4',
      duration: '00:15'
    },

    {
      id: 5,
      title: 'HOW TV PATROL COVERED THE PINATUBO ERUPTION',
      description: 'Mga pagbabagong hinarap ng mga komunidad at ang kanilang pagbangon matapos ang kalamidad.',
      thumbnail: '/assets/images/vid5.png',
      videoSrc: '/assets/videos/Tv_patrol.mp4',
      duration: '03:42'
      
    },

    {
      id: 6,
      title: 'PINATUBO MUSEUM AUGMENTED REALITY',
      description: 'Mga pagbabagong hinarap ng mga komunidad at ang kanilang pagbangon matapos ang kalamidad.',
      thumbnail: '/assets/images/vid6.png',
      videoSrc: '/assets/videos/vid2.mp4',
      duration: '00:56'
    }
  ];

  constructor(private router: Router) {}

  /**
   * Opens the selected AVP video.
   */
  openVideoModal(video: AVPVideo): void {
    this.selectedVideo = video;
    this.videoUnavailable = false;

    setTimeout(() => {
      const player = this.videoPlayer?.nativeElement;

      if (player) {
        player.load();

        player.play().catch(() => {
          // Autoplay may be blocked by the browser.
          // The user can still press play manually.
        });
      }
    });
  }

  /**
   * Closes the video modal.
   */
  closeVideoModal(): void {
    const player = this.videoPlayer?.nativeElement;

    if (player) {
      player.pause();
      player.currentTime = 0;
    }

    this.selectedVideo = null;
    this.videoUnavailable = false;
  }

  /**
   * Handles video loading errors.
   */
  onVideoError(): void {
    this.videoUnavailable = true;
  }

  /**
   * Handles thumbnail loading errors.
   */
  onThumbnailError(event: Event): void {
    const image = event.target as HTMLImageElement;

    image.src = '/assets/images/pinatubo.jpg';
  }

  /**
   * Returns to the previous kiosk page.
   */
  goBack(): void {
    const previousRoute = sessionStorage.getItem(
      'kioskPreviousRoute'
    );

    if (
      previousRoute &&
      previousRoute !== '/apo-pinatubo'
    ) {
      this.router.navigateByUrl(previousRoute);
    } else {
      this.router.navigate(['/menu']);
    }
  }
}