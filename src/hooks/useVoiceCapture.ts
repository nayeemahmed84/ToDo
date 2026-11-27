import { useCallback, useEffect, useRef, useState } from 'react';
import { startVoiceCapture, type VoiceCaptureHandle } from '../lib/voiceCapture';

interface UseVoiceCaptureOptions {
  onTranscript: (text: string, isFinal: boolean) => void;
  onStart?: () => void;
  onError?: (code: string, message: string) => void;
}

export function useVoiceCapture({ onTranscript, onStart, onError }: UseVoiceCaptureOptions) {
  const [voiceListening, setVoiceListening] = useState(false);
  const voiceHandleRef = useRef<VoiceCaptureHandle | null>(null);
  const sessionIdRef = useRef(0);
  const onTranscriptRef = useRef(onTranscript);
  const onStartRef = useRef(onStart);
  const onErrorRef = useRef(onError);
  onTranscriptRef.current = onTranscript;
  onStartRef.current = onStart;
  onErrorRef.current = onError;

  const stopVoice = useCallback(() => {
    sessionIdRef.current += 1;
    voiceHandleRef.current?.stop();
    voiceHandleRef.current = null;
    setVoiceListening(false);
  }, []);

  const toggleVoice = useCallback(() => {
    if (voiceListening) {
      stopVoice();
      return;
    }
    sessionIdRef.current += 1;
    const sessionId = sessionIdRef.current;
    onStartRef.current?.();
    const handle = startVoiceCapture({
      onTranscript: (text, isFinal) => {
        if (sessionIdRef.current !== sessionId) return;
        onTranscriptRef.current(text, isFinal);
      },
      onError: (code, message) => {
        if (sessionIdRef.current !== sessionId) return;
        setVoiceListening(false);
        voiceHandleRef.current = null;
        onErrorRef.current?.(code, message);
      },
      onEnd: () => {
        if (sessionIdRef.current !== sessionId) return;
        setVoiceListening(false);
        voiceHandleRef.current = null;
      },
    });
    if (handle && sessionIdRef.current === sessionId) {
      voiceHandleRef.current = handle;
      setVoiceListening(true);
    }
  }, [voiceListening, stopVoice]);

  useEffect(() => {
    return () => {
      sessionIdRef.current += 1;
      voiceHandleRef.current?.stop();
      voiceHandleRef.current = null;
    };
  }, []);

  return { voiceListening, toggleVoice, stopVoice };
}
