import { router } from 'expo-router';
import type { ViewerPhoto } from '@/components/photo-viewer';

/** A PDF (by its name — uploads keep their real extension). */
export const isPdfUrl = (url: string) => /\.pdf($|[?#])/i.test(url);

/** Opens a document inside the app: a PDF on its own screen
 * (app/document-viewer.tsx), a photo full screen (photo-viewer). Never the
 * browser, where it showed as a bare server link. */
export function openDocument(url: string, title: string, showPhoto: (photos: ViewerPhoto[]) => void): void {
  if (!url) return;
  if (isPdfUrl(url)) router.push({ pathname: '/document-viewer', params: { url, title } } as any);
  else showPhoto([{ uri: url, caption: title }]);
}
