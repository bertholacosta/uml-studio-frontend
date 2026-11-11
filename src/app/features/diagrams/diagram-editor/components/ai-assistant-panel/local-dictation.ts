/**
 * Dictado por voz con Whisper ejecutado en el navegador (transformers.js): el audio se graba y
 * se transcribe en el propio equipo, sin depender del servicio de voz en la nube del navegador
 * (el de Edge falla a menudo con «network») ni de ningún servidor.
 *
 * La librería y el modelo se descargan solo la primera vez que alguien dicta y quedan en la
 * caché del navegador. Usa la GPU (WebGPU) si responde y, si no o si falla, WebAssembly.
 */

// Versión fija de la librería, cargada bajo demanda para no engordar el bundle de la app
const TRANSFORMERS_URL =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1/dist/transformers.min.js';
const MODEL = 'onnx-community/whisper-base';
const SAMPLE_RATE = 16_000;

export type DictationStatus = { phase: 'loading'; progress?: number } | { phase: 'transcribing' };

type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text: string } | { text: string }[]>;

/** A quién avisar del progreso: la carga empieza al grabar y el estado se muestra al terminar. */
let statusListener: (status: DictationStatus) => void = () => undefined;

type Device = 'webgpu' | 'wasm';

/** ¿La GPU responde de verdad? Edge puede anunciar WebGPU y no dar adaptador (driver bloqueado). */
async function webgpuUsable(): Promise<boolean> {
  try {
    const gpu = (navigator as any).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function createTranscriber(device: Device): Promise<Transcriber> {
  const url = TRANSFORMERS_URL;
  const { pipeline } = await import(/* @vite-ignore */ url);
  // Progreso total: media de los archivos del modelo que se están descargando
  const files = new Map<string, number>();
  return pipeline('automatic-speech-recognition', MODEL, {
    device,
    dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
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
}

let loaded: { device: Device; transcriber: Promise<Transcriber> } | null = null;

/**
 * Carga (una sola vez) la librería y el modelo, en la GPU si responde y si no en la CPU
 * (WebAssembly). Si la GPU falla al cargar, se reintenta en la CPU. Con `cpuOnly`, descarta
 * la GPU (p. ej. porque falló al transcribir).
 */
function loadTranscriber(cpuOnly = false): {
  device: Device;
  transcriber: Promise<Transcriber>;
} {
  if (loaded && (!cpuOnly || loaded.device === 'wasm')) return loaded;
  const attempt = (async () => {
    if (!cpuOnly && (await webgpuUsable())) {
      try {
        const transcriber = await createTranscriber('webgpu');
        return { device: 'webgpu' as Device, transcriber };
      } catch (err) {
        console.warn('Dictado local: WebGPU no disponible, se usa WebAssembly', err);
      }
    }
    return { device: 'wasm' as Device, transcriber: await createTranscriber('wasm') };
  })();
  const entry = {
    device: 'webgpu' as Device,
    transcriber: attempt.then((r) => {
      entry.device = r.device;
      return r.transcriber;
    }),
  };
  if (cpuOnly) entry.device = 'wasm';
  // Si falla (sin red, navegador sin WebAssembly…), el próximo intento vuelve a probar
  entry.transcriber.catch(() => {
    if (loaded === entry) loaded = null;
  });
  loaded = entry;
  return entry;
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
    loadTranscriber().transcriber.catch(() => undefined);
  }

  /** Pide el micrófono y empieza a grabar. */
  static async start(): Promise<Recording> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
          const audio = await toMono16k(blob);
          const run = async (entry: ReturnType<typeof loadTranscriber>) => {
            const transcriber = await entry.transcriber;
            onStatus({ phase: 'transcribing' });
            return transcriber(audio, {
              language: 'spanish',
              task: 'transcribe',
              chunk_length_s: 30,
              stride_length_s: 5,
            });
          };
          const entry = loadTranscriber();
          let output: Awaited<ReturnType<Transcriber>>;
          try {
            output = await run(entry);
          } catch (err) {
            // La GPU cargó pero falló al transcribir (pasa en algunos Edge): se repite en la CPU
            if (entry.device !== 'webgpu') throw err;
            console.warn('Dictado local: falló en la GPU, se repite en la CPU', err);
            output = await run(loadTranscriber(true));
          }
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
