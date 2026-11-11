/**
 * Dictado por voz con Whisper ejecutado en el navegador (transformers.js): el audio se graba y
 * se transcribe en el propio equipo, sin depender del servicio de voz en la nube del navegador
 * (el de Edge falla a menudo con «network») ni de ningún servidor.
 *
 * Modelo: whisper-small en 8 bits (~250 MB), bastante más preciso en español que whisper-base.
 * Se descarga solo la primera vez que alguien dicta y queda en la caché del navegador.
 * Corre en la CPU (WebAssembly): la GPU (WebGPU) fallaba en Edge y no es necesaria aquí.
 */

// Versión fija de la librería, cargada bajo demanda para no engordar el bundle de la app
const TRANSFORMERS_URL =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js';
const MODEL = 'onnx-community/whisper-small';
const SAMPLE_RATE = 16_000;

export type DictationStatus = { phase: 'loading'; progress?: number } | { phase: 'transcribing' };

type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text: string } | { text: string }[]>;

/** A quién avisar del progreso: la carga empieza al grabar y el estado se muestra al terminar. */
let statusListener: (status: DictationStatus) => void = () => undefined;

let loaded: Promise<Transcriber> | null = null;

/** Carga (una sola vez) la librería y el modelo; informa del progreso de la descarga. */
function loadTranscriber(): Promise<Transcriber> {
  if (!loaded) {
    loaded = (async () => {
      const url = TRANSFORMERS_URL;
      const { pipeline } = await import(/* @vite-ignore */ url);
      // Progreso total: media de los archivos del modelo que se están descargando
      const files = new Map<string, number>();
      return pipeline('automatic-speech-recognition', MODEL, {
        device: 'wasm',
        dtype: 'q8',
        progress_callback: (p: { status: string; file?: string; progress?: number }) => {
          if (p.status === 'progress' && p.file) {
            files.set(p.file, p.progress ?? 0);
            const values = [...files.values()];
            statusListener({
              phase: 'loading',
              progress: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
            });
          }
        },
      }) as Promise<Transcriber>;
    })();
    // Si falla (sin red, navegador sin WebAssembly…), el próximo intento vuelve a probar
    loaded.catch(() => (loaded = null));
  }
  return loaded;
}

/** Audio grabado → muestras mono a 16 kHz, el formato que espera Whisper. */
async function toMono16k(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    return decoded.getChannelData(0);
  } finally {
    void context.close();
  }
}

/** Una grabación en curso: stop() la termina y devuelve el texto transcrito. */
export interface Recording {
  stop(onStatus: (status: DictationStatus) => void): Promise<string>;
  cancel(): void;
}

export class LocalDictation {
  /** Graba solo si el navegador puede (MediaRecorder + AudioContext + WebAssembly). */
  static isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      typeof AudioContext !== 'undefined' &&
      typeof WebAssembly !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  /**
   * Empieza a descargar el modelo en segundo plano (mientras la persona habla), para que al
   * terminar de grabar solo quede transcribir.
   */
  static preload(): void {
    loadTranscriber().catch(() => undefined);
  }

  /** Pide el micrófono y empieza a grabar. */
  static async start(): Promise<Recording> {
    const stream = await navigator.mediaDevices.getUserMedia({
      // Limpieza del navegador: menos eco y ruido de fondo, mejor reconocimiento
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    const finished = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        resolve(new Blob(chunks, { type: recorder.mimeType }));
      };
    });
    recorder.start();

    return {
      async stop(onStatus) {
        if (recorder.state !== 'inactive') recorder.stop();
        const blob = await finished;
        if (!blob.size) return '';
        statusListener = onStatus;
        try {
          const [transcriber, audio] = await Promise.all([loadTranscriber(), toMono16k(blob)]);
          onStatus({ phase: 'transcribing' });
          const output = await transcriber(audio, {
            language: 'spanish',
            task: 'transcribe',
            chunk_length_s: 30,
            stride_length_s: 5,
          });
          const text = Array.isArray(output) ? output.map((o) => o.text).join(' ') : output.text;
          return text.trim();
        } finally {
          statusListener = () => undefined;
        }
      },
      cancel() {
        if (recorder.state !== 'inactive') recorder.stop();
        stream.getTracks().forEach((t) => t.stop());
      },
    };
  }
}
