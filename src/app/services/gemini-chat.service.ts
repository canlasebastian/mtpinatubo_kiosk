import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

@Injectable({ providedIn: 'root' })
export class GeminiChatService {
  private apiUrl = `${environment.apiUrl}/api/chat`;

  constructor(private http: HttpClient) {}

  sendMessage(messages: ChatMessage[]): Observable<{ reply: string }> {
    return this.http.post<{ reply: string }>(this.apiUrl, { messages });
  }
}
