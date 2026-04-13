import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class RiotService {
  private apiUrl = 'http://localhost:3000';

  constructor(private http: HttpClient) { }

  getVersion(): Observable<{ version: string }> {
    return this.http.get<{ version: string }>(`${this.apiUrl}/version`);
  }

  getMultiScouting(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/scouting-multi`);
  }

  getScouting(nombre: string, tag: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/scouting/${nombre}/${tag}`);
  }
}