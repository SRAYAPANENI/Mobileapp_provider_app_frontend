// A system dialog the test itself opened (the microphone or camera
// permission, the audio session handing over) briefly sends the app to the
// background on Android and to "inactive" on iOS. That is not leaving the
// app: while one is open, and a moment after it closes, the test doesn't
// count it (hooks/use-skill-test.ts). Only the app's own prompts open this
// window — leaving for anything else still loses the question.

let open = 0;
let until = 0;
const AFTER_MS = 1500;

export async function whileSystemPrompt<T>(fn: () => Promise<T>): Promise<T> {
  open += 1;
  try {
    return await fn();
  } finally {
    open -= 1;
    until = Date.now() + AFTER_MS;
  }
}

export const inSystemPrompt = (): boolean => open > 0 || Date.now() < until;
