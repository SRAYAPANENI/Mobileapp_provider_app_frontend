import { C, u } from '@/components/business/ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Fonts } from '@/constants/theme';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, FileWarning, RotateCcw } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StatusBar, StyleSheet, TouchableOpacity, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';

// A PDF — an insurance certificate, a licence, a support attachment — read
// inside the app, not handed to the browser (where it showed as a bare
// server link). iOS's web view shows PDFs itself; Android's can't, so there
// it's drawn page by page with pdf.js, the library browsers use. The file
// comes straight from our server: nothing is sent to any other service.
// Photos open in components/photo-viewer.tsx instead (openDocument).

const PDF_JS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174';

/** Every page, the width of the screen, sharp on this screen's pixels;
 * pinch to zoom. Tells the app when it's drawn, or that it couldn't be. */
function pdfPage(url: string): string {
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes">
<style>html,body{margin:0;background:#EEF0F3}canvas{display:block;width:100%;height:auto;margin:0 0 8px;background:#fff}</style>
<script src="${PDF_JS}/pdf.min.js"></script></head><body><div id="pages"></div><script>
(function () {
  var tell = function (m) { window.ReactNativeWebView.postMessage(m); };
  if (!window.pdfjsLib) { tell('error'); return; }
  pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDF_JS}/pdf.worker.min.js';
  pdfjsLib.getDocument(${JSON.stringify(url)}).promise.then(function (pdf) {
    var holder = document.getElementById('pages');
    // Sharp, but at most twice the screen's width in pixels: a long
    // certificate at a phone's full 3x drew so much it could run the page
    // out of memory.
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    var next = function (n) {
      if (n > pdf.numPages) { tell('done'); return; }
      pdf.getPage(n).then(function (page) {
        var base = page.getViewport({ scale: 1 });
        var view = page.getViewport({ scale: (document.body.clientWidth / base.width) * ratio });
        var canvas = document.createElement('canvas');
        canvas.width = view.width; canvas.height = view.height;
        holder.appendChild(canvas);
        if (n === 1) tell('first');
        page.render({ canvasContext: canvas.getContext('2d'), viewport: view }).promise.then(function () { next(n + 1); });
      }).catch(function () { tell('error'); });
    };
    next(1);
  }).catch(function () { tell('error'); });
})();
</script></body></html>`;
}

export default function DocumentViewerScreen() {
  const { url, title } = useLocalSearchParams<{ url?: string; title?: string }>();
  const [state, setState] = useState<'loading' | 'shown' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  const origin = useMemo(() => (url ? (url.match(/^https?:\/\/[^/]+/i)?.[0] ?? undefined) : undefined), [url]);

  const onMessage = (e: WebViewMessageEvent) => {
    if (e.nativeEvent.data === 'error') setState('failed');
    else setState('shown');
  };
  const retry = () => { setState('loading'); setAttempt((n) => n + 1); };
  // The document, and nothing else: a link inside a PDF would otherwise
  // carry this screen off to some website, inside the app.
  // Allowed: anything on the document's own server — the file (iOS opens it
  // directly, and a link to another page in it adds "#page=…"), and the page
  // pdf.js is drawn on (Android, loaded as that server's address). Any other
  // site is refused.
  const stayOnDocument = (req: ShouldStartLoadRequest) =>
    req.url === url || req.url.startsWith('about:') || req.url.startsWith('data:')
    || (!!origin && (req.url === origin || req.url.startsWith(`${origin}/`) || req.url.startsWith(`${origin}#`)));

  return (
    <ThemedView style={s.container}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <TouchableOpacity style={s.back} onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft size={22} color={C.ink} />
        </TouchableOpacity>
        <ThemedText style={s.title} numberOfLines={1}>{title || 'Document'}</ThemedText>
      </View>

      {!url ? (
        <Failed text="This document couldn't be opened." />
      ) : (
        <View style={{ flex: 1 }}>
          <WebView
            key={attempt}
            style={s.web}
            originWhitelist={['*']}
            // iOS reads the PDF itself; Android draws it with pdf.js, loaded
            // as if from our server so it may fetch the file.
            source={Platform.OS === 'ios' ? { uri: url } : { html: pdfPage(url), baseUrl: origin }}
            onMessage={onMessage}
            onShouldStartLoadWithRequest={stayOnDocument}
            onLoadEnd={() => { if (Platform.OS === 'ios') setState((st) => (st === 'failed' ? st : 'shown')); }}
            onError={() => setState('failed')}
            onHttpError={() => setState('failed')}
            javaScriptEnabled
            setBuiltInZoomControls
            setDisplayZoomControls={false}
            allowsLinkPreview={false}
          />
          {state === 'loading' && (
            <View style={s.cover} pointerEvents="none"><ActivityIndicator color={C.ink} /></View>
          )}
          {state === 'failed' && (
            <View style={s.cover}>
              <Failed text="Couldn't show this document. Check your connection and try again." onRetry={retry} />
            </View>
          )}
        </View>
      )}
    </ThemedView>
  );
}

function Failed({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View style={s.failed}>
      <FileWarning size={28} color={C.muted} />
      <ThemedText style={[u.body, { textAlign: 'center' }]}>{text}</ThemedText>
      {onRetry && (
        <TouchableOpacity style={s.retry} onPress={onRetry} accessibilityRole="button">
          <RotateCcw size={16} color={C.ink} />
          <ThemedText style={s.retryText}>Try again</ThemedText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 16, paddingBottom: 12 },
  back: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  title: { flex: 1, fontSize: 18, lineHeight: 25, fontFamily: Fonts.poppinsBold, color: C.ink },
  web: { flex: 1, backgroundColor: '#EEF0F3' },
  cover: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  failed: { alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, height: 40, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line },
  retryText: { fontSize: 14, lineHeight: 19, fontFamily: Fonts.poppinsSemiBold, color: C.ink },
});
