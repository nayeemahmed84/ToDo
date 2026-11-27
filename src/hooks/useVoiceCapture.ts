import { useCallback, useEffect, useRef, useState } from 'react';
import { startVoiceCapture, type VoiceCaptureHandle } from '../lib/voiceCapture';

interface UseVoiceCaptureOptions {
  onTranscript: (text: string) => void;
}

export function useVoiceCapture({ onTranscript }: UseVoiceCaptureOptions) {
  const [voiceListening, setVoiceListening] = useState(false);
  const voiceHandleRef = useRef<VoiceCaptureHandle | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const stopVoice = useCallback(() => {
    voiceHandleRef.current?.stop();
    voiceHandleRef.current = null;
    setVoiceListening(false);
  }, []);

  const toggleVoice = useCallback(() => {
    if (voiceListening) {
      stopVoice();
      return;
    }
    const handle = startVoiceCapture({
      onTranscript: (text) => onTranscriptRef.current(text),
      onError: () => {
        setVoiceListening(false);
        voiceHandleRef.current = null;
      },
      onEnd: () => {
        setVoiceListening(false);
        voiceHandleRef.current = null;
      },
    });
    if (handle) {
      voiceHandleRef.current = handle;
      setVoiceListening(true);
    }
  }, [voiceListening, stopVoice]);

  useEffect(() => {
    return () => {
      voiceHandleRef.current?.stop();
      voiceHandleRef.current = null;
    };
  }, []);

  return { voiceListening, toggleVoice, stopVoice };
}
