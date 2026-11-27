interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export function isVoiceCaptureSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export interface VoiceCaptureHandle {
  stop: () => void;
}

export function startVoiceCapture(callbacks: {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (code: string) => void;
  onEnd?: () => void;
}): VoiceCaptureHandle | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = navigator.language || 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let transcript = '';
    let isFinal = false;
    for (let i = 0; i < event.results.length; i += 1) {
      const res = event.results[i];
      transcript += res[0]?.transcript ?? '';
      if (res.isFinal) isFinal = true;
    }
    const cleaned = transcript.trim();
    if (cleaned) {
      callbacks.onTranscript(cleaned, isFinal);
    }
  };

  recognition.onerror = (ev) => {
    callbacks.onError?.(ev.error || 'unknown');
  };

  recognition.onend = () => {
    callbacks.onEnd?.();
  };

  try {
    recognition.start();
  } catch {
    callbacks.onError?.('start-failed');
    return null;
  }

  return {
    stop: () => {
      try {
        recognition.stop();
      } catch {
        // Ignore stop errors
      }
    },
  };
}
