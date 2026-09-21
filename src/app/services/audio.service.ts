// audio.service.ts
import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AudioService {
  private audio: HTMLAudioElement;

  constructor() {
    this.audio = new Audio('assets/audio/bgmusic.mp3');
    this.audio.loop = true;
  }

  play(): void {
    this.audio.muted = false;
    this.audio.play().catch(() => {
      // Blocked until a user gesture happens — call play() again from a click handler.
    });
  }

  toggleMute(): boolean {
    this.audio.muted = !this.audio.muted;
    return !this.audio.muted;
  }

  get isPlaying(): boolean {
    return !this.audio.muted;
  }
}