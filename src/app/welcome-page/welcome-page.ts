import { Component, ElementRef, ViewChild, AfterViewInit, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AudioService } from '../services/audio.service'; // adjust path to match your project

@Component({
  selector: 'app-welcome-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './welcome-page.html',
  styleUrls: ['./welcome-page.css']
})
export class WelcomePage implements AfterViewInit, OnInit {
  @ViewChild('bgVideo') videoRef!: ElementRef<HTMLVideoElement>;

  isColored = false;

  constructor(private router: Router, private audioService: AudioService) {}

  ngOnInit(): void {
    // Music is started on first user click (toggleColor), not here,
    // so the browser's autoplay policy doesn't block it.
  }

  ngAfterViewInit(): void {
    if (this.videoRef) {
      this.videoRef.nativeElement.playbackRate = 0.45;
    }
  }

  get isMusicPlaying(): boolean {
    return this.audioService.isPlaying;
  }

  toggleMusic(): void {
    this.audioService.toggleMute();
  }

  toggleColor(): void {
    if (this.isColored) return;
    this.isColored = true;
    this.audioService.play(); // first user gesture — safe to unmute/play here
    setTimeout(() => {
      this.router.navigate(['/menu']);
    }, 3000);
  }
}
