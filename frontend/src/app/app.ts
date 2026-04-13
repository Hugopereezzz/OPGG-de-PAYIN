import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { RiotService } from './servicios/riot';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, FormsModule, HttpClientModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  colegasStats: any[] = [];
  datosJugador: any = null;
  cargandoLista: boolean = true;
  version: string = '14.6.1';

  puntosRango: any = {
    'CHALLENGER': 9000, 'GRANDMASTER': 8000, 'MASTER': 7000,
    'DIAMOND': 6000, 'EMERALD': 5000, 'PLATINUM': 4000,
    'GOLD': 3000, 'SILVER': 2000, 'BRONZE': 1000, 'IRON': 0, 'UNRANKED': -1
  };
  puntosDivision: any = { 'I': 400, 'II': 300, 'III': 200, 'IV': 100, '': 0 };

  constructor(private riotService: RiotService) { }

  ngOnInit() {
    this.riotService.getVersion().subscribe(v => this.version = v.version);
    this.cargarLista();
  }

  cargarLista() {
    this.cargandoLista = true;
    this.riotService.getMultiScouting().subscribe({
      next: (res) => {
        this.colegasStats = res.sort((a, b) => {
          const scoreA = (this.puntosRango[a.rango] || 0) + (this.puntosDivision[a.division] || 0) + a.lp;
          const scoreB = (this.puntosRango[b.rango] || 0) + (this.puntosDivision[b.division] || 0) + b.lp;
          return scoreB - scoreA;
        });
        this.cargandoLista = false;
      },
      error: () => this.cargandoLista = false
    });
  }

  hacerScouting(nombre: string, tag: string) {
    this.riotService.getScouting(nombre, tag).subscribe(res => {
      this.datosJugador = res;
      // Scrollear al detalle
      setTimeout(() => {
        document.querySelector('.detail-card')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    });
  }

  getChampIcon(name: string): string {
    if (name.toLowerCase() === 'fiddlesticks') {
      return 'assets/items/Fiddlesticks.png';
    }
    return `https://ddragon.leagueoflegends.com/cdn/${this.version}/img/champion/${name}.png`;
  }

  getItemIcon(id: number): string {
    if (id === 6694 || id === 3095) {
      return `assets/items/${id}.png`;
    }
    return `https://ddragon.leagueoflegends.com/cdn/${this.version}/img/item/${id}.png`;
  }

  getSpellIcon(name: string): string {
    return `https://ddragon.leagueoflegends.com/cdn/${this.version}/img/spell/${name}.png`;
  }

  getRankIcon(tier: string): string {
    const t = (tier || 'unranked').toLowerCase();
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/emblem-${t}.png`;
  }

  getTierColor(tier: string): string {
    const t = (tier || '').toUpperCase();
    if (t.includes('CHALLENGER')) return '#f4bb45';
    if (t.includes('GRANDMASTER')) return '#ff4c4c';
    if (t.includes('MASTER')) return '#d070ff';
    if (t.includes('DIAMOND')) return '#5765f2';
    if (t.includes('EMERALD')) return '#2ecc71';
    if (t.includes('PLATINUM')) return '#4ea1d3';
    if (t.includes('GOLD')) return '#f1c40f';
    if (t.includes('SILVER')) return '#95a5a6';
    if (t.includes('BRONZE')) return '#e67e22';
    if (t.includes('IRON')) return '#7e7e7e';
    return '#9ca3af';
  }
}