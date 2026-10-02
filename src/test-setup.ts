/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Vitest setup: garantiza un `localStorage` funcional en los tests.
 *
 * Motivo (entorno, no código de producto): con Node >= 22 existe un
 * `localStorage` global experimental que, si no se pasa
 * `--localstorage-file`, queda `undefined`. Vitest 4 construye el entorno
 * jsdom sobre los globals de Node (`window === globalThis` es un objeto plano,
 * no la window real de jsdom), por lo que `window.localStorage` también queda
 * `undefined`. `useAppState` depende de localStorage para persistir y
 * rehidratar, así que sin este polyfill los tests de estado no pueden
 * ejecutarse.
 *
 * Sólo actúa si el almacenamiento NO está disponible: en navegador o en
 * entornos donde jsdom sí lo provee, no cambia nada.
 */

class MemoryStorage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    const k = String(key);
    return this.store.has(k) ? (this.store.get(k) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.store.set(String(key), String(value));
  }
}

/** ¿El objeto global expone un Storage utilizable? */
const hasWorkingStorage = (): boolean => {
  try {
    const ls = (globalThis as any).localStorage;
    return !!ls && typeof ls.getItem === 'function' && typeof ls.setItem === 'function';
  } catch {
    return false;
  }
};

if (!hasWorkingStorage()) {
  const storage = new MemoryStorage();
  // `window` === `globalThis` en el entorno de vitest, así que basta con
  // definir el global; se hace como defineProperty para pisar el getter
  // experimental de Node que devuelve `undefined`.
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true,
  });
}