import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, map, catchError, throwError } from 'rxjs';
import { ApiResponse } from '../models/auth.model';
import { environment } from '../../../environments/environment';

export interface GeneratedFile {
  path: string;
  filename: string;
  language: string;
  layer:
    | 'entity'
    | 'repository'
    | 'service'
    | 'controller'
    | 'dto'
    | 'migration'
    | 'config'
    | 'docker'
    | 'docs';
  content: string;
  /** base64 en archivos binarios (p. ej. gradle-wrapper.jar), que no se previsualizan */
  encoding?: 'base64';
}

export interface CodeGenerationPreviewResponse {
  projectName: string;
  totalFiles: number;
  files: GeneratedFile[];
}

export interface GenerateCodeRequest {
  diagramId?: string;
  packageName?: string;
  artifactId?: string;
  groupId?: string;
  projectName?: string;
  javaVersion?: string;
  springBootVersion?: string;
  databaseName?: string;
  databaseUser?: string;
  databasePassword?: string;
  databasePort?: number;
  serverPort?: number;
  platform?: 'all' | 'spring-boot' | 'flutter';
  nodes?: any[];
  connections?: any[];
}

@Injectable({
  providedIn: 'root',
})
export class CodeGeneratorService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/codegen`;

  readonly isGenerating = signal<boolean>(false);
  readonly previewData = signal<CodeGenerationPreviewResponse | null>(null);

  previewFromDiagramId(
    diagramId: string,
    payload: GenerateCodeRequest,
  ): Observable<CodeGenerationPreviewResponse> {
    this.isGenerating.set(true);
    return this.http
      .post<ApiResponse<CodeGenerationPreviewResponse>>(
        `${this.apiUrl}/preview/${diagramId}`,
        payload,
      )
      .pipe(
        map((res) => res.data || (res as any)),
        tap((data) => {
          this.previewData.set(data);
          this.isGenerating.set(false);
        }),
        catchError((err) => {
          this.isGenerating.set(false);
          return throwError(() => err);
        }),
      );
  }

  downloadZipFromDiagramId(diagramId: string, payload: GenerateCodeRequest): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/download/${diagramId}`, payload, {
      responseType: 'blob',
    });
  }
}
