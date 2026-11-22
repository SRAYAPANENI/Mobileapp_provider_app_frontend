import { Audio } from 'expo-av';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { whileSystemPrompt } from '@/components/skill-test/system-prompt';

// One spoken answer in a camera skill test: start, stop (or stopped for you
// at `maxSeconds`), and the file to send. Same audio-session handover as the
// customer app's voice posting (components/voice-post-modal.tsx there).

export type Recorded = { uri: string; mimeType: string; seconds: number };

export function useAnswerRecorder(maxSeconds: number) {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const startedAt = useRef(0);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  /** 'mic': no permission; 'failed': it couldn't start. */
  const [error, setError] = useState<'mic' | 'failed' | null>(null);

  // Handing the audio session back can blink the app's state too: not leaving it.
  const release = () => whileSystemPrompt(() => Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {}));

  /** The finished recording, or null if there was none. */
  const stop = useCallback(async (): Promise<Recorded | null> => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setRecording(false);
    if (!rec) return null;
    await whileSystemPrompt(() => rec.stopAndUnloadAsync().catch(() => { /* already stopped */ }));
    await release();
    const uri = rec.getURI();
    const took = (Date.now() - startedAt.current) / 1000;
    // HIGH_QUALITY records AAC in an MPEG-4 box (.m4a) on both platforms.
    return uri ? { uri, mimeType: Platform.OS === 'ios' ? 'audio/x-m4a' : 'audio/mp4', seconds: took } : null;
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    // Allowed already (asked before the test began): no prompt at all.
    let { status } = await Audio.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await whileSystemPrompt(() => Audio.requestPermissionsAsync()));
    if (status !== 'granted') {
      setError('mic');
      return false;
    }
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // The audio session handing over can blink the app's state: not leaving it.
        const { recording: rec } = await whileSystemPrompt(async () => {
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false, shouldDuckAndroid: false }).catch(() => {});
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false,
            shouldDuckAndroid: true, playThroughEarpieceAndroid: false,
          });
          return Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
        });
        recordingRef.current = rec;
        startedAt.current = Date.now();
        setSeconds(0);
        setRecording(true);
        return true;
      } catch {
        if (attempt === 3) setError('failed');
      }
    }
    return false;
  }, []);

  // Elapsed time, and the stop at the limit (the caller sends what it gets from stop()).
  const onLimit = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(s);
      if (s >= maxSeconds) onLimit.current?.();
    }, 250);
    return () => clearInterval(id);
  }, [recording, maxSeconds]);

  // Never left recording when the screen goes.
  useEffect(() => () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (rec) rec.stopAndUnloadAsync().catch(() => {}).finally(() => { void release(); });
  }, []);

  return { start, stop, recording, seconds, error, onLimit };
}
