import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map, catchError, throwError } from 'rxjs';
import {
  DiagramDto,
  SaveDiagramAstRequest,
  UmlClassNode,
  UmlConnection,
} from '../models/diagram.model';
import { ApiResponse } from '../models/auth.model';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/** Tope de cuerpo de una petición keepalive (64 KiB) con margen. */
const KEEPALIVE_MAX_BYTES = 60 * 1024;

@Injectable({
  providedIn: 'root',
})
export class DiagramService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly apiUrl = `${environment.apiUrl}/diagrams`;

  // Signals para estado reactivo
  readonly currentDiagram = signal<DiagramDto | null>(null);
  readonly isSaving = signal<boolean>(false);
  readonly lastSavedAt = signal<Date | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  loadDiagram(diagramId: string): Observable<DiagramDto> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.http.get<ApiResponse<DiagramDto>>(`${this.apiUrl}/${diagramId}`).pipe(
      map((res) => res.data),
      tap((diagram) => {
        this.currentDiagram.set(diagram);
        this.isLoading.set(false);
      }),
      catchError((err) => {
        this.isLoading.set(false);
        const msg =
          err.error?.error?.message || err.error?.message || 'Error al cargar el diagrama';
        this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
        return throwError(() => err);
      }),
    );
  }

  loadDiagramsByProject(projectId: string): Observable<DiagramDto[]> {
    this.isLoading.set(true);
    return this.http.get<ApiResponse<DiagramDto[]>>(`${this.apiUrl}/project/${projectId}`).pipe(
      map((res) => res.data),
      tap(() => this.isLoading.set(false)),
      catchError((err) => {
        this.isLoading.set(false);
        return throwError(() => err);
      }),
    );
  }

  createDiagram(projectId: string, name: string): Observable<DiagramDto> {
    this.isLoading.set(true);
    return this.http.post<ApiResponse<DiagramDto>>(this.apiUrl, { projectId, name }).pipe(
      map((res) => res.data),
      tap((diagram) => {
        this.currentDiagram.set(diagram);
        this.isLoading.set(false);
      }),
      catchError((err) => {
        this.isLoading.set(false);
        return throwError(() => err);
      }),
    );
  }

  saveAst(diagramId: string, payload: SaveDiagramAstRequest): Observable<DiagramDto> {
    this.isSaving.set(true);
    return this.http.put<ApiResponse<DiagramDto>>(`${this.apiUrl}/${diagramId}/ast`, payload).pipe(
      map((res) => res.data),
      tap((saved) => {
        this.currentDiagram.set(saved);
        this.isSaving.set(false);
        this.lastSavedAt.set(new Date());
      }),
      catchError((err) => {
        this.isSaving.set(false);
        return throwError(() => err);
      }),
    );
  }

  /**
   * Guardado al cerrar la pestaña: fetch con keepalive, que el navegador termina aunque la
   * página se descargue. Devuelve false si no se pudo enviar (p. ej. diagrama muy grande).
   */
  saveAstOnUnload(diagramId: string, payload: SaveDiagramAstRequest): boolean {
    const token = this.auth.token();
    const body = JSON.stringify(payload);
    if (!token || new Blob([body]).size > KEEPALIVE_MAX_BYTES) return false;
    try {
      void fetch(`${this.apiUrl}/${diagramId}/ast`, {
        method: 'PUT',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body,
      }).catch(() => undefined);
      return true;
    } catch {
      return false;
    }
  }
}
