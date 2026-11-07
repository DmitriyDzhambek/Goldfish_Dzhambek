/**
 * Живой предпросмотр проекта (аналог Live Server из VS Code).
 *
 * Собирает самодостаточный HTML-документ из файлов рабочей области:
 * находит index.html, инлайнит подключённые стили и скрипты и
 * возвращает готовую строку для iframe (srcDoc).
 *
 * Работает полностью в браузере: ни файл проекта, ни превью
 * не отправляются на сервер.
 */

import type { Workspace, WorkspaceFile } from './workspace'

function normalizePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\/+/, '')
}

/** Ищет файл workspace по относительной ссылке из HTML. */
function resolveFile(files: readonly WorkspaceFile[], href: string): WorkspaceFile | null {
  const target = normalizePath(href).split('?')[0]?.split('#')[0] ?? ''
  if (!target) return null

  const direct = files.find((file) => file.path === target || file.path.endsWith(`/${target}`))
  if (direct) return direct

  const name = target.split('/').pop() ?? target
  return files.find((file) => (file.path.split('/').pop() ?? '') === name) ?? null
}

export interface PreviewResult {
  document: string | null
  reason: string | null
}

export function buildPreviewDocument(workspace: Workspace | null): PreviewResult {
  if (!workspace || workspace.files.length === 0) {
    return {
      document: null,
      reason: 'Добавь проект — и его превью появится здесь.',
    }
  }

  const htmlFile =
    resolveFile(workspace.files, 'index.html') ??
    workspace.files.find((file) => file.path.toLowerCase().endsWith('.html'))

  if (!htmlFile) {
    return {
      document: null,
      reason:
        'Для живого предпросмотра в проекте нужен index.html (или любой .html). TS/React-проекты сначала требуют сборки.',
    }
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlFile.content, 'text/html')

  // CSS: <link rel="stylesheet" href="..."> → <style>
  for (const link of [...doc.querySelectorAll('link[rel="stylesheet"][href]')]) {
    const href = link.getAttribute('href')
    if (!href) continue

    const cssFile = resolveFile(workspace.files, href)
    const style = doc.createElement('style')
    style.textContent = cssFile ? cssFile.content : `/* ${href} не найден в проекте */`
    link.replaceWith(style)
  }

  // JS: <script src="..."> → инлайн
  for (const script of [...doc.querySelectorAll('script[src]')]) {
    const src = script.getAttribute('src')
    if (!src) continue

    const jsFile = resolveFile(workspace.files, src)
    const inline = doc.createElement('script')
    if (script.getAttribute('type')) inline.setAttribute('type', script.getAttribute('type') ?? '')
    inline.textContent = jsFile
      ? jsFile.content
      : `console.error('${src} не найден в проекте')`
    script.replaceWith(inline)
  }

  // Картинки и прочие относительные ресурсы помечаем, чтобы не было битых запросов.
  for (const el of [...doc.querySelectorAll('[src], [href]')]) {
    for (const attr of ['src', 'href']) {
      const value = el.getAttribute(attr)
      if (!value || /^(https?:|data:|#|mailto:)/i.test(value)) continue
      if (!resolveFile(workspace.files, value) && /\.(png|jpe?g|gif|svg|webp|ico|woff2?|ttf)$/i.test(value)) {
        el.setAttribute(attr, 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==')
        el.setAttribute('data-missing-resource', value)
      }
    }
  }

  return { document: `<!doctype html>\n${doc.documentElement.outerHTML}`, reason: null }
}

/** Blob-ссылка, чтобы открыть превью в отдельной вкладке. */
export function previewBlobUrl(html: string): string | null {
  try {
    return URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  } catch {
    return null
  }
}
