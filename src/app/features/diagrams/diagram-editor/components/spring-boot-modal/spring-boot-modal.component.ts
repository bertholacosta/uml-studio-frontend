import {
  Component,
  input,
  output,
  signal,
  inject,
  computed,
  effect,
  untracked,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import {
  heroArrowDownTray,
  heroArrowPath,
  heroCheck,
  heroCircleStack,
  heroClipboardDocument,
  heroCodeBracket,
  heroCog6Tooth,
  heroCube,
  heroDevicePhoneMobile,
  heroDocument,
  heroDocumentText,
  heroExclamationTriangle,
  heroMagnifyingGlass,
  heroServer,
  heroSquares2x2,
  heroXMark,
} from '@ng-icons/heroicons/outline';
import {
  CodeGeneratorService,
  GeneratedFile,
  GenerateCodeRequest,
} from '../../../../../core/services/code-generator.service';
import { UmlClassNode, UmlConnection } from '../../../../../core/models/diagram.model';
import { TranslatePipe, TranslationService } from '../../../../../core/i18n';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import hljs from 'highlight.js/lib/core';
import java from 'highlight.js/lib/languages/java';
import dart from 'highlight.js/lib/languages/dart';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import dockerfile from 'highlight.js/lib/languages/dockerfile';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import properties from 'highlight.js/lib/languages/properties';

hljs.registerLanguage('java', java);
hljs.registerLanguage('dart', dart);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);
hljs.registerLanguage('dockerfile', dockerfile);
hljs.registerLanguage('json', json);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('properties', properties);

type Platform = 'all' | 'spring-boot' | 'flutter';

/** Capas que se pueden filtrar en la lista de archivos. */
const CATEGORY_LAYERS = [
  'entity',
  'repository',
  'dto',
  'service',
  'controller',
  'migration',
  'docker',
];

@Component({
  standalone: true,
  selector: 'app-spring-boot-modal',
  imports: [CommonModule, FormsModule, NgIconComponent, TranslatePipe],
  providers: [
    provideIcons({
      heroArrowDownTray,
      heroArrowPath,
      heroCheck,
      heroCircleStack,
      heroClipboardDocument,
      heroCodeBracket,
      heroCog6Tooth,
      heroCube,
      heroDevicePhoneMobile,
      heroDocument,
      heroDocumentText,
      heroExclamationTriangle,
      heroMagnifyingGlass,
      heroServer,
      heroSquares2x2,
      heroXMark,
    }),
  ],
  templateUrl: './spring-boot-modal.component.html',
})
export class SpringBootModalComponent implements OnInit {
  private readonly codegenService = inject(CodeGeneratorService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly i18n = inject(TranslationService);

  readonly isOpen = input<boolean>(false);
  readonly diagramId = input<string | null>(null);
  readonly diagramName = input<string>('Diagrama UML');
  readonly nodes = input<UmlClassNode[]>([]);
  readonly connections = input<UmlConnection[]>([]);

  readonly closeModal = output<void>();

  // Selección de Plataforma
  selectedPlatform = signal<Platform>('all');

  // Configuración del Proyecto
  packageName = signal<string>('com.uagrm.studio');
  artifactId = signal<string>('sistema-app');
  projectName = signal<string>('Sistema App Fullstack');
  javaVersion = signal<string>('21');
  databaseName = signal<string>('uml_studio_db');
  databaseUser = signal<string>('postgres');
  databasePassword = signal<string>('postgres');
  serverPort = signal<number>(8080);
  databasePort = signal<number>(5432);

  // Pestaña activa del explorador
  activeCategory = signal<string>('all');
  selectedFile = signal<GeneratedFile | null>(null);
  isCopied = signal<boolean>(false);
  isGenerating = signal<boolean>(false);
  isDownloading = signal<boolean>(false);

  // Archivos generados
  files = signal<GeneratedFile[]>([]);

  /** Plataformas que se pueden generar. */
  readonly platforms: { id: Platform; icon: string; label: string }[] = [
    { id: 'all', icon: 'heroSquares2x2', label: 'codeGen.platformAll' },
    { id: 'spring-boot', icon: 'heroServer', label: 'codeGen.springBootTab' },
    { id: 'flutter', icon: 'heroDevicePhoneMobile', label: 'codeGen.flutterTab' },
  ];

  /** Búsqueda de archivos por nombre o ruta. */
  readonly fileQuery = signal<string>('');

  private inCategory(file: GeneratedFile, category: string): boolean {
    if (category === 'all') return true;
    if (category === 'flutter') {
      return (
        file.path.includes('mobile_flutter') ||
        file.path.startsWith('lib/') ||
        file.language === 'dart'
      );
    }
    if (category === 'spring-boot') {
      return (
        file.path.includes('backend') || file.path.startsWith('src/') || file.language === 'java'
      );
    }
    return file.layer === category;
  }

  readonly filteredFiles = computed(() => {
    const category = this.activeCategory();
    const query = this.fileQuery().trim().toLowerCase();
    return this.files().filter(
      (f) =>
        this.inCategory(f, category) &&
        (!query ||
          f.filename.toLowerCase().includes(query) ||
          f.path.toLowerCase().includes(query)),
    );
  });

  /** Capas que tienen archivos, con cuántos (para el selector de capa). */
  readonly categoryOptions = computed(() => {
    const files = this.files();
    const ids = [
      'all',
      ...(this.selectedPlatform() === 'all' ? ['spring-boot', 'flutter'] : []),
      ...CATEGORY_LAYERS,
    ];
    return ids
      .map((id) => ({
        id,
        label:
          id === 'all'
            ? 'codeGen.categories.all'
            : id === 'spring-boot'
              ? 'codeGen.categories.springBoot'
              : `codeGen.categories.${id}`,
        count: files.filter((f) => this.inCategory(f, id)).length,
      }))
      .filter((option) => option.id === 'all' || option.count > 0);
  });

  readonly totalClasses = computed(() => {
    return this.nodes().filter((n) => !n.isAnchor).length;
  });

  readonly totalRelations = computed(() => {
    return this.connections().length;
  });

  readonly highlightedCode = computed<SafeHtml>(() => {
    const file = this.selectedFile();
    if (!file || !file.content) return '';
    if (file.encoding === 'base64') {
      return this.sanitizer.bypassSecurityTrustHtml(
        this.escapeHtml(this.i18n.t('codeGen.binaryFile')),
      );
    }

    const rawCode = file.content;
    const lang = this.detectLanguage(file);

    try {
      if (lang && hljs.getLanguage(lang)) {
        const result = hljs.highlight(rawCode, { language: lang, ignoreIllegals: true });
        return this.sanitizer.bypassSecurityTrustHtml(result.value);
      }
      return this.sanitizer.bypassSecurityTrustHtml(this.escapeHtml(rawCode));
    } catch {
      return this.sanitizer.bypassSecurityTrustHtml(this.escapeHtml(rawCode));
    }
  });

  readonly lineNumbers = computed<number[]>(() => {
    const file = this.selectedFile();
    if (!file || !file.content) return [];
    if (file.encoding === 'base64') return [1];
    const count = file.content.split('\n').length;
    return Array.from({ length: count }, (_, i) => i + 1);
  });

  readonly detectedLanguage = computed<string>(() => {
    const file = this.selectedFile();
    if (!file) return '';
    return this.detectLanguage(file);
  });

  private detectLanguage(file: GeneratedFile): string {
    if (file.language) {
      const l = file.language.toLowerCase();
      if (l === 'dart') return 'dart';
      if (l === 'java') return 'java';
      if (l === 'sql') return 'sql';
      if (l === 'yaml' || l === 'yml') return 'yaml';
      if (l === 'json') return 'json';
      if (l === 'xml') return 'xml';
      if (l === 'docker' || l === 'dockerfile') return 'dockerfile';
    }
    const name = (file.filename || file.path).toLowerCase();
    if (name.endsWith('.java')) return 'java';
    if (name.endsWith('.dart')) return 'dart';
    if (name.endsWith('.sql')) return 'sql';
    if (name.endsWith('.yml') || name.endsWith('.yaml')) return 'yaml';
    if (name.endsWith('.json')) return 'json';
    if (name.endsWith('.xml')) return 'xml';
    if (name.endsWith('.properties')) return 'properties';
    if (name.includes('dockerfile')) return 'dockerfile';
    return 'plaintext';
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  constructor() {
    effect(() => {
      const open = this.isOpen();
      const diagId = this.diagramId();
      const name = this.diagramName();

      if (open) {
        if (name) {
          const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
          this.artifactId.set(clean || 'sistema-app');
          this.projectName.set(name);
        }
        // Solo al abrir o cambiar de diagrama: generatePreview lee el diagrama y el formulario,
        // y sin untracked cada cambio de esos datos volvía a generar (dos peticiones al abrir)
        if (diagId) untracked(() => this.generatePreview());
      }
    });
  }

  ngOnInit(): void {
    if (this.diagramName()) {
      const clean = this.diagramName()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
      this.artifactId.set(clean || 'sistema-app');
      this.projectName.set(this.diagramName());
    }
  }

  setPlatform(plat: Platform): void {
    if (plat === this.selectedPlatform()) return;
    this.selectedPlatform.set(plat);
    this.activeCategory.set('all');
    this.generatePreview();
  }

  /** Carpeta de un archivo (lo que va antes del nombre en el visor). */
  dirOf(path: string): string {
    const cut = path.lastIndexOf('/');
    return cut >= 0 ? path.slice(0, cut + 1) : '';
  }

  /** Icono neutro según el tipo de archivo. */
  fileIcon(file: GeneratedFile): string {
    const name = file.filename.toLowerCase();
    if (file.layer === 'docker' || name.includes('docker')) return 'heroCube';
    if (file.layer === 'migration' || name.endsWith('.sql')) return 'heroCircleStack';
    if (file.language === 'dart') return 'heroDevicePhoneMobile';
    if (name.endsWith('.java')) return 'heroCodeBracket';
    if (file.layer === 'docs' || name.endsWith('.md')) return 'heroDocumentText';
    if (/\.(ya?ml|properties|json|xml|gradle|env)$/.test(name) || file.layer === 'config') {
      return 'heroCog6Tooth';
    }
    return 'heroDocument';
  }

  generatePreview(): void {
    const diagId = this.diagramId();
    if (!diagId) {
      this.files.set([]);
      this.selectedFile.set(null);
      this.isGenerating.set(false);
      return;
    }

    this.isGenerating.set(true);

    const payload: GenerateCodeRequest = {
      diagramId: diagId,
      platform: this.selectedPlatform(),
      packageName: this.packageName(),
      artifactId: this.artifactId(),
      projectName: this.projectName(),
      javaVersion: this.javaVersion(),
      databaseName: this.databaseName(),
      databaseUser: this.databaseUser(),
      databasePassword: this.databasePassword(),
      serverPort: this.serverPort(),
      databasePort: this.databasePort(),
      nodes: this.nodes(),
      connections: this.connections(),
    };

    this.codegenService.previewFromDiagramId(diagId, payload).subscribe({
      next: (res) => {
        this.files.set(res.files || []);
        if (res.files && res.files.length > 0) {
          const firstEntity = res.files.find((f) => f.layer === 'entity') || res.files[0];
          this.selectedFile.set(firstEntity);
        }
        this.isGenerating.set(false);
      },
      error: () => {
        this.isGenerating.set(false);
      },
    });
  }

  selectFile(file: GeneratedFile): void {
    this.selectedFile.set(file);
    this.isCopied.set(false);
  }

  copyCode(): void {
    const file = this.selectedFile();
    if (!file) return;

    navigator.clipboard.writeText(file.content).then(() => {
      this.isCopied.set(true);
      setTimeout(() => this.isCopied.set(false), 2000);
    });
  }

  downloadZip(): void {
    const diagId = this.diagramId();
    if (!diagId) {
      alert('Debes guardar el diagrama antes de descargar el proyecto.');
      return;
    }

    this.isDownloading.set(true);

    const payload: GenerateCodeRequest = {
      diagramId: diagId,
      platform: this.selectedPlatform(),
      packageName: this.packageName(),
      artifactId: this.artifactId(),
      projectName: this.projectName(),
      javaVersion: this.javaVersion(),
      databaseName: this.databaseName(),
      databaseUser: this.databaseUser(),
      databasePassword: this.databasePassword(),
      serverPort: this.serverPort(),
      databasePort: this.databasePort(),
      nodes: this.nodes(),
      connections: this.connections(),
    };

    this.codegenService.downloadZipFromDiagramId(diagId, payload).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.artifactId()}-${this.selectedPlatform()}.zip`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.isDownloading.set(false);
      },
      error: (err) => {
        console.error('Error al descargar ZIP:', err);
        this.isDownloading.set(false);
        const errMsg = err?.error?.message || err?.message || 'Error al descargar el archivo ZIP.';
        alert(`Error al descargar el archivo ZIP: ${errMsg}`);
      },
    });
  }

  /** Capa del archivo en palabras, para la lista (sin colores: el estilo de la app es neutro). */
  layerLabel(file: GeneratedFile): string {
    if (file.language === 'dart') {
      if (file.path.endsWith('/schema.dart')) return 'Flutter · Esquema del diagrama';
      if (file.path.endsWith('/api.dart')) return 'Flutter · API (Dio)';
      if (file.path.includes('/screens/')) return 'Flutter · Pantalla';
      if (file.path.includes('/assistant/')) return 'Flutter · Asistente IA';
      return 'Flutter';
    }
    const labels: Record<string, string> = {
      entity: 'Entidad JPA',
      repository: 'Repositorio',
      dto: 'DTO',
      service: 'Servicio',
      controller: 'REST Controller',
      migration: 'Flyway SQL',
      docker: 'Docker Compose',
      config: 'Configuración',
      docs: 'Documentación',
    };
    return labels[file.layer] || file.layer;
  }
}
