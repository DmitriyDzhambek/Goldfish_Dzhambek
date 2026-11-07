/**
 * localStorage может быть недоступен (приватный режим Safari, настройки
 * браузера). Приложение не должно падать из-за этого — только терять
 * сохранённые настройки.
 */
export function readStorage(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Молча игнорируем: настройки — не критичный путь.
  }
}
