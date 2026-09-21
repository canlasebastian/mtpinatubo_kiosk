import { Component, ElementRef, ViewChild, AfterViewInit, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-welcome-page',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './welcome-page.html',
  styleUrls: ['./welcome-page.css']
})
export class WelcomePage implements AfterViewInit, OnInit {
  @ViewChild('bgVideo') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('bgMusic') bgMusic!: ElementRef<HTMLAudioElement>;

  isColored = false;
  isMusicPlaying = true;

  constructor(private router: Router) {}

  ngOnInit(): void {
    // Audio will autoplay and loop
  }

  ngAfterViewInit(): void {
    if (this.videoRef) {
      this.videoRef.nativeElement.playbackRate = 0.45;
    }
  }

  toggleMusic(): void {
    if (this.bgMusic && this.bgMusic.nativeElement) {
      this.bgMusic.nativeElement.muted = !this.bgMusic.nativeElement.muted;
      this.isMusicPlaying = !this.bgMusic.nativeElement.muted;
    }
  }

  toggleColor(): void {
    if (this.isColored) return;
    this.isColored = true;
    setTimeout(() => {
      this.router.navigate(['/menu']);
    }, 3000);
  }
}
