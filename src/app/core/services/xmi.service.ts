import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { ApiResponse } from '../models/auth.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class XmiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/xmi`;

  /**
   * Exporta un diagrama existente a XMI 2.1 estándar compatible con Enterprise Architect v17.
   */
  exportDiagram(diagramId: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/export/${diagramId}`, {
      responseType: 'blob',
    });
  }

  /**
   * Parsea un archivo XMI/XML 2.1 de Enterprise Architect e importa sus clases, atributos, métodos y coordenadas.
   */
  importXmi(payload: {
    xmiContent: string;
    diagramId?: string;
    projectId?: string;
    diagramName?: string;
  }): Observable<any> {
    return this.http
      .post<ApiResponse<any>>(`${this.apiUrl}/import`, payload)
      .pipe(map((res) => res.data));
  }
}
