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

export function getVoiceErrorMessage(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Microphone access was blocked. Allow microphone permission in your browser settings.';
    case 'audio-capture':
      return 'No microphone was found. Check your audio input device.';
    case 'no-speech':
      return 'No speech detected. Please try speaking again.';
    case 'network':
      return 'Speech recognition service failed (network error). Check your internet connection or browser speech settings.';
    case 'language-not-supported':
      return 'Your browser language is not supported for voice recognition.';
    case 'insecure-context':
      return 'Voice input requires HTTPS (or localhost).';
    case 'unsupported':
      return 'Voice input is not supported in this browser.';
    default:
      return `Voice input failed (${code}). Please try again.`;
  }
}

export function startVoiceCapture(callbacks: {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (code: string, message: string) => void;
  onEnd?: () => void;
}): VoiceCaptureHandle | null {
  if (typeof window !== 'undefined' && window.isSecureContext === false) {
    callbacks.onError?.('insecure-context', getVoiceErrorMessage('insecure-context'));
    return null;
  }

  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    callbacks.onError?.('unsupported', getVoiceErrorMessage('unsupported'));
    return null;
  }

  const recognition = new Ctor();
  recognition.lang = navigator.language || 'en-US';
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;

  let finished = false;
  let hadError = false;

  recognition.onresult = (event) => {
    let transcript = '';
    let isFinal = false;
    for (let i = 0; i < event.results.length; i += 1) {
      const res = event.results[i];
      const part = res[0]?.transcript ?? '';
      if (part) {
        transcript += transcript && !transcript.endsWith(' ') && !part.startsWith(' ') ? ` ${part}` : part;
      }
      if (res.isFinal) isFinal = true;
    }
    const cleaned = transcript.trim();
    if (cleaned) {
      callbacks.onTranscript(cleaned, isFinal);
    }
  };

  recognition.onerror = (ev) => {
    const code = ev.error || 'unknown';
    if (code === 'aborted' && finished) return;
    hadError = true;
    finished = true;
    callbacks.onError?.(code, getVoiceErrorMessage(code));
  };

  recognition.onend = () => {
    if (!finished) {
      finished = true;
    }
    if (!hadError) {
      callbacks.onEnd?.();
    }
  };

  try {
    recognition.start();
  } catch {
    finished = true;
    callbacks.onError?.('start-failed', getVoiceErrorMessage('start-failed'));
    return null;
  }

  return {
    stop: () => {
      finished = true;
      try {
        recognition.stop();
      } catch {
        // Ignore stop errors
      }
    },
  };
}
