import { Injectable } from '@angular/core';
import { UmlClassNode, UmlConnection } from '../models/diagram.model';
import { visibilitySymbol } from '../utils/uml-notation';

@Injectable({
  providedIn: 'root',
})
export class BmpExportService {
  /**
   * Exporta una captura visual exacta del DOM del editor de diagramas a formato BMP (Windows Bitmap).
   * @param element Elemento HTML del contenedor del lienzo (FlowContainer).
   * @param diagramName Nombre del archivo generado.
   */
  async exportElementToBmp(element: HTMLElement, diagramName = 'diagrama-uml'): Promise<void> {
    if (!element) {
      alert('No se encontró el contenedor del lienzo para capturar.');
      return;
    }

    try {
      // 1. Sanitizar elementos SVG del DOM para garantizar trazo limpio (sin relleno negro por defecto de SVG)
      const allCircles = element.querySelectorAll<SVGCircleElement>('circle');
      allCircles.forEach((circle) => {
        circle.setAttribute('display', 'none');
        circle.style.display = 'none';
        circle.setAttribute('fill', 'none');
        circle.style.fill = 'none';
      });

      const allPaths = element.querySelectorAll<SVGPathElement>('path');
      allPaths.forEach((path) => {
        path.setAttribute('fill', 'none');
        path.style.fill = 'none';
        if (!path.getAttribute('stroke') || path.getAttribute('stroke') === 'none') {
          path.setAttribute('stroke', '#2A201B');
        }
      });

      const allPolygons = element.querySelectorAll<SVGPolygonElement>('polygon');
      allPolygons.forEach((poly) => {
        const isFilled =
          poly.getAttribute('fill') === '#2A201B' || poly.classList.contains('fill-[#2A201B]');
        if (isFilled) {
          poly.setAttribute('fill', '#2A201B');
          poly.style.fill = '#2A201B';
        } else {
          poly.setAttribute('fill', '#FFFFFF');
          poly.style.fill = '#FFFFFF';
        }
        poly.setAttribute('stroke', '#2A201B');
      });

      const allPolylines = element.querySelectorAll<SVGPolylineElement>('polyline');
      allPolylines.forEach((pline) => {
        pline.setAttribute('fill', 'none');
        pline.style.fill = 'none';
        pline.setAttribute('stroke', '#2A201B');
      });

      // 2. Renderizar el DOM exacto a un Canvas HTML5 a 2x de resolución
      // html-to-image solo se descarga la primera vez que se exporta una imagen
      const { toCanvas } = await import('html-to-image');
      const canvas = await toCanvas(element, {
        backgroundColor: '#0c0d0c',
        pixelRatio: 2,
        cacheBust: true,
        filter: (domNode: HTMLElement) => {
          // Filtrar círculos de conexión (drag handles temporales de Foblex)
          const tag = domNode.tagName?.toLowerCase();
          if (
            tag === 'circle' ||
            domNode.classList?.contains('f-connection-drag-handle') ||
            domNode.hasAttribute?.('f-connection-drag-handle-start') ||
            domNode.hasAttribute?.('f-connection-drag-handle-end')
          ) {
            return false;
          }

          // Filtrar controles flotantes de UI (botones flotantes, cursores remotos temporales)
          if (
            domNode.classList &&
            (domNode.classList.contains('pointer-events-none') ||
              (domNode.classList.contains('z-40') && domNode.tagName === 'BUTTON'))
          ) {
            return false;
          }
          return true;
        },
      });

      // 2. Extraer ImageData del Canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('No se pudo obtener el contexto 2d del canvas.');
      }

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // 3. Codificar a binario BMP de 24 bits
      const bmpBuffer = this.convertImageDataToBmp(imageData);

      // 4. Descargar el archivo .bmp
      const blob = new Blob([bmpBuffer], { type: 'image/bmp' });
      const cleanFileName = diagramName.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${cleanFileName || 'diagrama'}.bmp`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error('Error al capturar imagen BMP del editor:', err);
      alert('Error al generar la captura BMP del diagrama.');
    }
  }

  /**
   * Exporta el diagrama UML a una imagen en formato Windows Bitmap (.bmp) mediante renderizado de fallback.
   * @param nodes Lista de nodos de clases UML.
   * @param connections Lista de conexiones UML.
   * @param diagramName Nombre del diagrama para el archivo de salida.
   */
  exportToBmp(
    nodes: UmlClassNode[],
    connections: UmlConnection[],
    diagramName = 'diagrama-uml',
  ): void {
    const validNodes = nodes.filter((n) => !n.isAnchor);

    if (validNodes.length === 0) {
      alert('No hay clases en el diagrama para exportar.');
      return;
    }

    // 1. Calcular el Bounding Box de todos los elementos
    const padding = 60;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const node of validNodes) {
      const w = node.width || 220;
      const h = this.calculateNodeHeight(node);
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + w);
      maxY = Math.max(maxY, node.position.y + h);
    }

    const canvasWidth = Math.max(800, Math.ceil(maxX - minX + padding * 2));
    const canvasHeight = Math.max(600, Math.ceil(maxY - minY + padding * 2));
    const offsetX = padding - minX;
    const offsetY = padding - minY;

    // 2. Crear Canvas HTML5 con escala de alta definición (2x)
    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth * scale;
    canvas.height = canvasHeight * scale;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      alert('No se pudo inicializar el contexto de dibujo Canvas.');
      return;
    }

    ctx.scale(scale, scale);

    // Fondo blanco limpio estilo Enterprise Architect
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Patrón de cuadrícula tenue
    ctx.strokeStyle = '#F0EDE9';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvasWidth; x += 20) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
      ctx.stroke();
    }
    for (let y = 0; y < canvasHeight; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
      ctx.stroke();
    }

    // Marca de agua sutil de Enterprise Architect / UML Studio en esquina superior
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#94A3B8';
    ctx.textAlign = 'right';
    ctx.fillText(`${diagramName} • Enterprise Architect UML 2.5 Export`, canvasWidth - 20, 25);

    // Mapa de posiciones de nodos para trazar conexiones
    const nodeMap = new Map<string, { x: number; y: number; w: number; h: number; name: string }>();
    for (const node of validNodes) {
      const w = node.width || 220;
      const h = this.calculateNodeHeight(node);
      nodeMap.set(node.id, {
        x: node.position.x + offsetX,
        y: node.position.y + offsetY,
        w,
        h,
        name: node.name,
      });
    }

    // 3. Dibujar Conexiones y Relaciones UML
    for (const conn of connections) {
      const source = this.resolveConnectionNode(conn.sourceNodeId || conn.sourceId, nodeMap);
      const target = this.resolveConnectionNode(conn.targetNodeId || conn.targetId, nodeMap);

      if (source && target && source !== target) {
        this.drawConnection(ctx, source, target, conn);
      }
    }

    // 4. Dibujar Nodos de Clases UML
    for (const node of validNodes) {
      const nInfo = nodeMap.get(node.id);
      if (nInfo) {
        this.drawClassNode(ctx, node, nInfo.x, nInfo.y, nInfo.w, nInfo.h);
      }
    }

    // 5. Extraer ImageData y Convertir a Archivo Binario BMP (24-bit RGB)
    const rawImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bmpBuffer = this.convertImageDataToBmp(rawImageData);

    // 6. Descargar el archivo .bmp
    const blob = new Blob([bmpBuffer], { type: 'image/bmp' });
    const cleanFileName = diagramName.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${cleanFileName || 'diagrama'}.bmp`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  }

  private calculateNodeHeight(node: UmlClassNode): number {
    const headerHeight = 32;
    const attrCount = (node.attributes || []).length;
    const attrHeight = attrCount > 0 ? attrCount * 18 + 12 : 24;
    const methodCount = (node.methods || []).length;
    const methodHeight = methodCount > 0 ? methodCount * 18 + 14 : 0;
    return headerHeight + attrHeight + methodHeight;
  }

  private resolveConnectionNode(
    idOrPort: string,
    nodeMap: Map<string, { x: number; y: number; w: number; h: number; name: string }>,
  ): { x: number; y: number; w: number; h: number; name: string } | undefined {
    if (!idOrPort) return undefined;
    const cleanId = idOrPort.replace(/_(top|bottom|left|right)$/, '').trim();
    return nodeMap.get(cleanId);
  }

  private drawConnection(
    ctx: CanvasRenderingContext2D,
    source: { x: number; y: number; w: number; h: number },
    target: { x: number; y: number; w: number; h: number },
    conn: UmlConnection,
  ): void {
    const sCenter = { x: source.x + source.w / 2, y: source.y + source.h / 2 };
    const tCenter = { x: target.x + target.w / 2, y: target.y + target.h / 2 };

    const start = this.getRectIntersection(sCenter, tCenter, source);
    const end = this.getRectIntersection(tCenter, sCenter, target);

    ctx.save();
    ctx.strokeStyle = '#2A201B';
    ctx.lineWidth = 1.6;

    if (conn.type === 'dependency' || conn.type === 'realization') {
      ctx.setLineDash([6, 4]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.setLineDash([]);
    this.drawRelationshipMarker(ctx, start, end, conn.type);
    this.drawMultiplicityAndLabels(ctx, start, end, conn);

    ctx.restore();
  }

  private drawRelationshipMarker(
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    type: string,
  ): void {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);

    if (type === 'generalization' || type === 'realization') {
      const arrowLength = 14;
      const arrowWidth = 9;

      const p1 = { x: end.x, y: end.y };
      const p2 = {
        x: end.x - arrowLength * Math.cos(angle) + arrowWidth * Math.sin(angle),
        y: end.y - arrowLength * Math.sin(angle) - arrowWidth * Math.cos(angle),
      };
      const p3 = {
        x: end.x - arrowLength * Math.cos(angle) - arrowWidth * Math.sin(angle),
        y: end.y - arrowLength * Math.sin(angle) + arrowWidth * Math.cos(angle),
      };

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.stroke();
    } else if (type === 'composition' || type === 'aggregation') {
      const diamondLen = 14;
      const diamondWidth = 7;
      const oppAngle = angle + Math.PI;

      const p1 = { x: start.x, y: start.y };
      const p2 = {
        x: start.x + (diamondLen / 2) * Math.cos(oppAngle) + diamondWidth * Math.sin(oppAngle),
        y: start.y + (diamondLen / 2) * Math.sin(oppAngle) - diamondWidth * Math.cos(oppAngle),
      };
      const p3 = {
        x: start.x + diamondLen * Math.cos(oppAngle),
        y: start.y + diamondLen * Math.sin(oppAngle),
      };
      const p4 = {
        x: start.x + (diamondLen / 2) * Math.cos(oppAngle) - diamondWidth * Math.sin(oppAngle),
        y: start.y + (diamondLen / 2) * Math.sin(oppAngle) + diamondWidth * Math.cos(oppAngle),
      };

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();

      ctx.fillStyle = type === 'composition' ? '#2A201B' : '#FFFFFF';
      ctx.fill();
      ctx.stroke();
    } else if (type === 'dependency') {
      const arrowLength = 10;
      const arrowAngle = Math.PI / 6;

      ctx.beginPath();
      ctx.moveTo(
        end.x - arrowLength * Math.cos(angle - arrowAngle),
        end.y - arrowLength * Math.sin(angle - arrowAngle),
      );
      ctx.lineTo(end.x, end.y);
      ctx.lineTo(
        end.x - arrowLength * Math.cos(angle + arrowAngle),
        end.y - arrowLength * Math.sin(angle + arrowAngle),
      );
      ctx.stroke();
    }
  }

  private drawMultiplicityAndLabels(
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    conn: UmlConnection,
  ): void {
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (conn.sourceMultiplicity) {
      const pos = this.interpolatePoint(start, end, 0.18);
      this.drawBadge(ctx, pos.x, pos.y - 10, conn.sourceMultiplicity, '#0284C7', '#E0F2FE');
    }

    if (conn.name) {
      const mid = this.interpolatePoint(start, end, 0.5);
      this.drawBadge(ctx, mid.x, mid.y - 12, conn.name, '#475569', '#F8FAFC');
    }

    if (conn.targetMultiplicity) {
      const pos = this.interpolatePoint(start, end, 0.82);
      this.drawBadge(ctx, pos.x, pos.y - 10, conn.targetMultiplicity, '#0284C7', '#E0F2FE');
    }
  }

  private drawBadge(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    textColor: string,
    bgColor: string,
  ): void {
    const textWidth = ctx.measureText(text).width;
    const padX = 4;
    const padY = 2;
    const rectW = textWidth + padX * 2;
    const rectH = 14;

    ctx.save();
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(x - rectW / 2, y - rectH / 2, rectW, rectH, 3);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  private drawClassNode(
    ctx: CanvasRenderingContext2D,
    node: UmlClassNode,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    ctx.save();

    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;

    ctx.fillStyle = '#FFFDF9';
    ctx.strokeStyle = '#796354';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = 'transparent';

    const headerHeight = 30;
    ctx.fillStyle = '#FFFDF9';
    ctx.beginPath();
    ctx.rect(x, y, w, headerHeight);
    ctx.fill();
    ctx.strokeStyle = '#796354';
    ctx.beginPath();
    ctx.moveTo(x, y + headerHeight);
    ctx.lineTo(x + w, y + headerHeight);
    ctx.stroke();

    ctx.font = 'bold 12px sans-serif';
    ctx.fillStyle = '#241C18';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(node.name, x + w / 2, y + headerHeight / 2);

    let currentY = y + headerHeight + 12;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const attributes = node.attributes || [];
    for (const attr of attributes) {
      ctx.fillStyle = '#241C18';
      ctx.fillText(
        `${visibilitySymbol(attr.visibility, 'private')} ${attr.name}: ${attr.type}`,
        x + 10,
        currentY,
      );
      currentY += 18;
    }

    const methods = node.methods || [];
    if (methods.length > 0) {
      currentY += 2;
      ctx.strokeStyle = '#796354';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, currentY);
      ctx.lineTo(x + w, currentY);
      ctx.stroke();

      currentY += 12;
      for (const m of methods) {
        ctx.fillStyle = '#241C18';
        const params = m.parameters ? `(${m.parameters})` : '()';
        const ret = m.returnType ? `: ${m.returnType}` : ': void';
        ctx.fillText(
          `${visibilitySymbol(m.visibility, 'public')} ${m.name}${params}${ret}`,
          x + 10,
          currentY,
        );
        currentY += 18;
      }
    }

    ctx.restore();
  }

  private getRectIntersection(
    center: { x: number; y: number },
    target: { x: number; y: number },
    rect: { x: number; y: number; w: number; h: number },
  ): { x: number; y: number } {
    const dx = target.x - center.x;
    const dy = target.y - center.y;
    if (dx === 0 && dy === 0) return center;

    const hw = rect.w / 2;
    const hh = rect.h / 2;
    const rCenter = { x: rect.x + hw, y: rect.y + hh };

    const slope = dy / (dx || 0.0001);

    if (Math.abs(dy * hw) < Math.abs(dx * hh)) {
      const ix = dx > 0 ? rCenter.x + hw : rCenter.x - hw;
      const iy = rCenter.y + (ix - rCenter.x) * slope;
      return { x: ix, y: iy };
    } else {
      const iy = dy > 0 ? rCenter.y + hh : rCenter.y - hh;
      const ix = rCenter.x + (iy - rCenter.y) / slope;
      return { x: ix, y: iy };
    }
  }

  private interpolatePoint(
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    t: number,
  ): { x: number; y: number } {
    return {
      x: p1.x + (p2.x - p1.x) * t,
      y: p1.y + (p2.y - p1.y) * t,
    };
  }

  /**
   * Codifica un objeto ImageData (RGBA) a un ArrayBuffer con la estructura binaria de un archivo BMP de 24 bits.
   */
  convertImageDataToBmp(imageData: ImageData): ArrayBuffer {
    const width = imageData.width;
    const height = imageData.height;
    const data = imageData.data;

    const bytesPerPixel = 3;
    const rowSize = Math.floor((width * bytesPerPixel + 3) / 4) * 4;
    const pixelArraySize = rowSize * height;
    const fileHeaderSize = 14;
    const infoHeaderSize = 40;
    const fileSize = fileHeaderSize + infoHeaderSize + pixelArraySize;

    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);

    // 1. BITMAPFILEHEADER (14 bytes)
    view.setUint8(0, 0x42); // 'B'
    view.setUint8(1, 0x4d); // 'M'
    view.setUint32(2, fileSize, true); // Tamaño total del archivo
    view.setUint16(6, 0, true); // Reservado 1
    view.setUint16(8, 0, true); // Reservado 2
    view.setUint32(10, fileHeaderSize + infoHeaderSize, true); // Offset a los datos de píxeles

    // 2. BITMAPINFOHEADER (40 bytes)
    view.setUint32(14, infoHeaderSize, true); // Tamaño de este encabezado
    view.setInt32(18, width, true); // Ancho de la imagen en píxeles
    view.setInt32(22, height, true); // Alto de la imagen en píxeles (positivo = bottom-to-top)
    view.setUint16(26, 1, true); // Planos de color = 1
    view.setUint16(28, 24, true); // Bits por píxel (24 bits = RGB)
    view.setUint32(30, 0, true); // Compresión (0 = BI_RGB sin comprimir)
    view.setUint32(34, pixelArraySize, true); // Tamaño del arreglo de píxeles
    view.setInt32(38, 2835, true); // Resolución horizontal (~72 DPI)
    view.setInt32(42, 2835, true); // Resolución vertical (~72 DPI)
    view.setUint32(46, 0, true); // Colores en la paleta (0 = 2^24)
    view.setUint32(50, 0, true); // Colores importantes

    // 3. PIXEL DATA (De abajo hacia arriba, formato BGR con padding de 4 bytes)
    const pixelOffset = fileHeaderSize + infoHeaderSize;
    const uint8View = new Uint8Array(buffer);

    for (let y = 0; y < height; y++) {
      const srcRow = height - 1 - y; // Bottom-to-top
      const destRowOffset = pixelOffset + y * rowSize;

      for (let x = 0; x < width; x++) {
        const srcIdx = (srcRow * width + x) * 4;
        const r = data[srcIdx];
        const g = data[srcIdx + 1];
        const b = data[srcIdx + 2];
        const a = data[srcIdx + 3] / 255;

        // Mezcla con fondo claro en caso de transparencia
        const blendedR = Math.round(r * a + 249 * (1 - a));
        const blendedG = Math.round(g * a + 247 * (1 - a));
        const blendedB = Math.round(b * a + 245 * (1 - a));

        const destIdx = destRowOffset + x * 3;
        uint8View[destIdx] = blendedB; // B
        uint8View[destIdx + 1] = blendedG; // G
        uint8View[destIdx + 2] = blendedR; // R
      }
    }

    return buffer;
  }
}
