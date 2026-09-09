import type { Settings } from '../core/types';
let timer: ReturnType<typeof setTimeout> | undefined;
export function stopSpeech() {
  clearTimeout(timer);
  window.speechSynthesis?.cancel();
}
export function speak(
  text: string,
  language: string,
  settings: Settings,
  done: (error?: string) => void,
) {
  stopSpeech();
  if (!settings.speech) {
    done('Enable Listen in Learning settings first.');
    return;
  }
  const voices = speechSynthesis.getVoices().filter((v) => settings.remoteVoices || v.localService);
  const matches = voices.filter(
    (v) => v.lang.toLowerCase().split('-')[0] === language.toLowerCase().split('-')[0],
  );
  const voice =
    matches.find((v) => v.voiceURI === settings.voice) ||
    matches.find((v) => v.lang.toLowerCase() === language.toLowerCase()) ||
    matches[0];
  if (!voice) {
    done(
      'No matching local browser voice. Install a voice in your system settings or allow remote voices in Learning.',
    );
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.voice = voice;
  utterance.onend = () => {
    clearTimeout(timer);
    done();
  };
  utterance.onerror = () => {
    clearTimeout(timer);
    done('Speech stopped or was unavailable.');
  };
  timer = setTimeout(
    () => {
      stopSpeech();
      done('Speech timed out. Try a shorter selection.');
    },
    Math.min(180000, Math.max(20000, text.length * 160)),
  );
  speechSynthesis.speak(utterance);
}
