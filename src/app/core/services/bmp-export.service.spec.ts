import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BmpExportService } from './bmp-export.service';
import { UmlClassNode, UmlConnection } from '../models/diagram.model';

describe('BmpExportService', () => {
  let service: BmpExportService;

  beforeEach(() => {
    service = new BmpExportService();
  });

  it('debe crearse correctamente', () => {
    expect(service).toBeTruthy();
  });

  it('debe alertar si no hay nodos válidos', () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    service.exportToBmp([], [], 'test');
    expect(alertSpy).toHaveBeenCalledWith('No hay clases en el diagrama para exportar.');
    alertSpy.mockRestore();
  });

  it('debe codificar un ImageData en un ArrayBuffer BMP válido con encabezado BM', () => {
    const width = 10;
    const height = 10;
    const dummyData = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < dummyData.length; i += 4) {
      dummyData[i] = 255; // R
      dummyData[i + 1] = 0; // G
      dummyData[i + 2] = 0; // B
      dummyData[i + 3] = 255; // A
    }

    const mockImageData = {
      width,
      height,
      data: dummyData,
      colorSpace: 'srgb',
    } as unknown as ImageData;

    const buffer = service.convertImageDataToBmp(mockImageData);
    expect(buffer).toBeInstanceOf(ArrayBuffer);

    const view = new DataView(buffer);
    // Firma 'BM'
    expect(view.getUint8(0)).toBe(0x42);
    expect(view.getUint8(1)).toBe(0x4d);
    // Tamaño del header BITMAPINFOHEADER (40)
    expect(view.getUint32(14, true)).toBe(40);
    // Dimensiones
    expect(view.getInt32(18, true)).toBe(10);
    expect(view.getInt32(22, true)).toBe(10);
    // Bits por pixel (24)
    expect(view.getUint16(28, true)).toBe(24);
  });

  it('debe generar y descargar un archivo BMP con nodos y conexiones', () => {
    const mockNodes: UmlClassNode[] = [
      {
        id: 'node_1',
        name: 'Cliente',
        position: { x: 100, y: 100 },
        width: 220,
        attributes: [
          { name: 'id', type: 'UUID' },
          { name: 'nombre', type: 'String' },
        ],
        methods: [],
      },
      {
        id: 'node_2',
        name: 'Venta',
        position: { x: 450, y: 100 },
        width: 220,
        attributes: [
          { name: 'id', type: 'UUID' },
          { name: 'total', type: 'Double' },
        ],
        methods: [],
      },
    ];

    const mockConnections: UmlConnection[] = [
      {
        id: 'conn_1',
        sourceNodeId: 'node_1',
        targetNodeId: 'node_2',
        sourceId: 'node_1_right',
        targetId: 'node_2_left',
        type: 'association',
        name: 'realiza',
        sourceMultiplicity: '1',
        targetMultiplicity: '0..*',
      },
    ];

    const clickSpy = vi.fn();
    const origCreateElement = document.createElement.bind(document);

    vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:http://localhost/dummy');
    vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => {});

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const dummyCanvas = origCreateElement('canvas');
        dummyCanvas.getContext = vi.fn().mockReturnValue({
          scale: vi.fn(),
          fillRect: vi.fn(),
          strokeRect: vi.fn(),
          rect: vi.fn(),
          arc: vi.fn(),
          clip: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          stroke: vi.fn(),
          fillText: vi.fn(),
          fill: vi.fn(),
          closePath: vi.fn(),
          roundRect: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          setLineDash: vi.fn(),
          measureText: vi.fn().mockReturnValue({ width: 30 }),
          getImageData: vi.fn().mockReturnValue({
            width: 100,
            height: 100,
            data: new Uint8ClampedArray(100 * 100 * 4),
          }),
        });
        return dummyCanvas;
      }
      if (tag === 'a') {
        const link = origCreateElement('a');
        link.click = clickSpy;
        return link;
      }
      return origCreateElement(tag);
    });

    service.exportToBmp(mockNodes, mockConnections, 'Mi Diagrama Ferreteria');

    expect(clickSpy).toHaveBeenCalled();
  });
});
