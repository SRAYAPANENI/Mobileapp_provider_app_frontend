import { createContext, useContext } from 'react';

// The skill test's words in English and Spanish (docs/SKILL_VERIFICATION_DESIGN.md §4).
// The questions come from the server in the language chosen; everything
// around them is here. Spanish as spoken in the US, "tú", plain words.

export type TestLanguage = 'en' | 'es';

const en = {
  kicker: 'Skill test',
  close: 'Close the test',
  languageLabel: 'Test language',
  beforeStart: 'Before you start',
  rules: [
    '5 questions. Get 4 right to pass.',
    '30 seconds for each. The clock keeps going even if the app closes.',
    'Stay in the app. Leaving it — even for a call — counts that question as wrong.',
    'Screenshots and screen recording are blocked during the test.',
    'Closing the test counts as a try. The wait before the next grows each time: an hour, a day, a week.',
    'You see your score at the end. Dodorez checks some passes before the badge shows.',
  ],
  quietMoment: 'Find a quiet moment with a good connection. Questions are about real work in this trade.',
  startTest: 'Start the test',
  continue: 'Continue',
  preparing: 'Getting your questions ready…',
  closeBtn: 'Close',
  questionOf: (n: number, total: number) => `Question ${n} of ${total}`,
  secondsLeft: (n: number) => `${n} seconds left`,
  next: 'Next',
  finish: 'Finish',
  sendAgain: 'Send again',
  leftApp: 'You left the app, so that question counted as wrong.',
  timedOut: 'Time ran out on that question.',
  sendFailed: "Your answer didn't send. Check your connection and send it again — the clock is still running.",
  ended: 'This test has ended — it was left open too long. It counts as a try.',
  leaveTitle: 'Leave the test?',
  leaveBody: 'It counts as a try, and the wait before the next one starts now. Your answers so far are kept.',
  keepGoing: 'Keep going',
  leave: 'Leave test',
  reviewing: 'Passed — being reviewed',
  verified: (skill: string) => `${skill} is verified`,
  notThisTime: 'Not this time',
  result: (passed: boolean, review: boolean, camera: boolean): string => review
    ? (camera
      ? 'You scored enough to pass. A person at Dodorez checks every camera test before the badge shows — you’ll be told as soon as yours is decided, usually within two days.'
      : 'You scored enough to pass. Dodorez checks some tests before the badge shows — you’ll be told as soon as yours is decided, usually within two days.')
    : passed ? 'You passed — this skill now shows as verified.' : 'Not this time. Each test has new questions.',
  waitGrows: 'The wait before your next try grows with each one in a row: an hour, then a day, then a week.',
  done: 'Done',
  // Camera tests
  cameraNote: 'This is a camera test: your camera stays on, and you answer 2 more questions out loud at the end (90 seconds each). Every pass is checked by a person.',
  consentTitle: 'This test uses your camera and microphone',
  consentWhy: 'For trades where safety matters, Dodorez checks that the person passing the test is you.',
  consentPoints: [
    'Your front camera is on for the whole test: a photo of your face first, then one every few seconds. You can see it in the corner.',
    'After the 5 multiple-choice questions, you answer 2 questions out loud. Your answers are recorded and written out.',
    'A person at Dodorez compares the photos with your ID to check it was you. No software scans your face.',
    'Only Dodorez’s review team can see or hear them. They’re never shown to customers.',
    'They’re deleted 30 days after your test is decided (180 days if it’s turned down, in case you appeal), or when you delete your account.',
  ],
  consentAgree: 'I agree to photos and recordings of me being taken during this test, for Dodorez to check it was me.',
  faceTitle: 'A photo of your face',
  faceHow: 'Face the camera in good light, nothing covering your face. This is compared with your ID.',
  cameraNeeded: 'This test needs your camera. Turn camera access on for Dodorez Pro, then come back.',
  allowCamera: 'Allow the camera',
  openSettings: 'Open Settings',
  takePhoto: 'Take photo',
  retake: 'Retake',
  cameraOn: 'Camera on',
  answerOutLoud: 'Answer out loud',
  spokenHow: (max: number) => `Say what you’d do and why, as you would to a customer or a new helper. Up to ${max} seconds.`,
  sending: 'Sending your answer…',
  recorded: 'Your answer is recorded.',
  tapToStop: 'Tap to stop and send',
  tapToStart: 'Tap to start answering',
  stopAndSend: 'Stop and send',
  startRecording: 'Start recording',
  micNeeded: 'Microphone access is needed to answer out loud. Turn it on in Settings.',
  micFailed: "The microphone couldn't start. Try again.",
};

const es: typeof en = {
  kicker: 'Prueba de habilidad',
  close: 'Cerrar la prueba',
  languageLabel: 'Idioma de la prueba',
  beforeStart: 'Antes de empezar',
  rules: [
    '5 preguntas. Necesitas 4 correctas para pasar.',
    '30 segundos para cada una. El reloj sigue corriendo aunque se cierre la app.',
    'Quédate en la app. Si sales — aunque sea para una llamada — esa pregunta cuenta como incorrecta.',
    'Las capturas y la grabación de pantalla están bloqueadas durante la prueba.',
    'Cerrar la prueba cuenta como un intento. La espera para el siguiente crece cada vez: una hora, un día, una semana.',
    'Ves tu puntuación al final. Dodorez revisa algunas pruebas aprobadas antes de mostrar la insignia.',
  ],
  quietMoment: 'Busca un momento tranquilo con buena conexión. Las preguntas son sobre trabajo real en este oficio.',
  startTest: 'Empezar la prueba',
  continue: 'Continuar',
  preparing: 'Preparando tus preguntas…',
  closeBtn: 'Cerrar',
  questionOf: (n, total) => `Pregunta ${n} de ${total}`,
  secondsLeft: (n) => `Quedan ${n} segundos`,
  next: 'Siguiente',
  finish: 'Terminar',
  sendAgain: 'Enviar de nuevo',
  leftApp: 'Saliste de la app, así que esa pregunta contó como incorrecta.',
  timedOut: 'Se acabó el tiempo de esa pregunta.',
  sendFailed: 'Tu respuesta no se envió. Revisa tu conexión y envíala de nuevo — el reloj sigue corriendo.',
  ended: 'Esta prueba terminó — estuvo abierta demasiado tiempo. Cuenta como un intento.',
  leaveTitle: '¿Salir de la prueba?',
  leaveBody: 'Cuenta como un intento, y la espera para el siguiente empieza ahora. Tus respuestas hasta ahora se guardan.',
  keepGoing: 'Seguir',
  leave: 'Salir de la prueba',
  reviewing: 'Aprobada — en revisión',
  verified: (skill) => `${skill} está verificado`,
  notThisTime: 'Esta vez no',
  result: (passed, review, camera) => review
    ? (camera
      ? 'Sacaste lo suficiente para pasar. Una persona de Dodorez revisa cada prueba con cámara antes de mostrar la insignia — te avisamos en cuanto se decida, normalmente en dos días.'
      : 'Sacaste lo suficiente para pasar. Dodorez revisa algunas pruebas antes de mostrar la insignia — te avisamos en cuanto se decida, normalmente en dos días.')
    : passed ? 'Pasaste — esta habilidad ahora aparece como verificada.' : 'Esta vez no. Cada prueba tiene preguntas nuevas.',
  waitGrows: 'La espera para tu próximo intento crece con cada uno seguido: una hora, luego un día, luego una semana.',
  done: 'Listo',
  cameraNote: 'Esta es una prueba con cámara: tu cámara queda encendida y al final respondes 2 preguntas más en voz alta (90 segundos cada una). Una persona revisa cada prueba aprobada.',
  consentTitle: 'Esta prueba usa tu cámara y tu micrófono',
  consentWhy: 'En los oficios donde la seguridad importa, Dodorez revisa que la persona que pasa la prueba seas tú.',
  consentPoints: [
    'Tu cámara frontal está encendida durante toda la prueba: primero una foto de tu cara, y luego una cada pocos segundos. La ves en la esquina.',
    'Después de las 5 preguntas de opción múltiple, respondes 2 preguntas en voz alta. Tus respuestas se graban y se escriben.',
    'Una persona de Dodorez compara las fotos con tu identificación para confirmar que eras tú. Ningún programa escanea tu cara.',
    'Solo el equipo de revisión de Dodorez puede verlas u oírlas. Nunca se muestran a los clientes.',
    'Se borran 30 días después de que se decida tu prueba (180 días si se rechaza, por si apelas), o cuando borres tu cuenta.',
  ],
  consentAgree: 'Acepto que me tomen fotos y grabaciones durante esta prueba, para que Dodorez confirme que fui yo.',
  faceTitle: 'Una foto de tu cara',
  faceHow: 'Mira a la cámara con buena luz, sin nada que te tape la cara. Se compara con tu identificación.',
  cameraNeeded: 'Esta prueba necesita tu cámara. Activa el acceso a la cámara para Dodorez Pro y vuelve.',
  allowCamera: 'Permitir la cámara',
  openSettings: 'Abrir Ajustes',
  takePhoto: 'Tomar foto',
  retake: 'Repetir',
  cameraOn: 'Cámara encendida',
  answerOutLoud: 'Responde en voz alta',
  spokenHow: (max) => `Di qué harías y por qué, como se lo dirías a un cliente o a un ayudante nuevo. Hasta ${max} segundos.`,
  sending: 'Enviando tu respuesta…',
  recorded: 'Tu respuesta quedó grabada.',
  tapToStop: 'Toca para parar y enviar',
  tapToStart: 'Toca para empezar a responder',
  stopAndSend: 'Parar y enviar',
  startRecording: 'Empezar a grabar',
  micNeeded: 'Se necesita el micrófono para responder en voz alta. Actívalo en Ajustes.',
  micFailed: 'El micrófono no pudo iniciar. Intenta de nuevo.',
};

export const STRINGS = { en, es };
export type TestStrings = typeof en;

export const TestLanguageContext = createContext<TestLanguage>('en');
export const useTestStrings = (): TestStrings => STRINGS[useContext(TestLanguageContext)];
