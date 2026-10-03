/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Hook del catálogo de vehículos autorizados, con persistencia en
 * localStorage (mismo patrón que `useChoferesState`, sin base de datos
 * externa). La semilla se aplica sólo en el primer arranque: si la clave
 * existe — incluso como `[]` — el valor persistido manda.
 */

import { useEffect, useState } from 'react';
import { AuthorizedVehicle } from '../domain/vehicleCatalog';
import { INITIAL_AUTHORIZED_VEHICLES } from '../data/mockVehicleCatalog';
import { normalizePlate } from '../domain/plate';

const STORAGE_KEY = 'securguard_vehicle_catalog_v1';

const readArray = (key: string): any[] | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Rehidratación defensiva: descarta entradas corruptas y normaliza la
 * patente a forma canónica para que la comparación del dominio sea estable.
 */
const sanitizeCatalog = (arr: any[]): AuthorizedVehicle[] => {
  const seen = new Set<string>();
  const out: AuthorizedVehicle[] = [];

  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const plate = normalizePlate((raw as any).plate);
    const company = typeof (raw as any).company === 'string' ? (raw as any).company.trim() : '';
    if (plate === '' || seen.has(plate)) continue;
    seen.add(plate);
    out.push({ plate, company });
  }

  return out;
};

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 9);

export function useVehicleCatalog() {
  const [catalog, setCatalog] = useState<AuthorizedVehicle[]>(() => {
    const arr = readArray(STORAGE_KEY);
    return arr ? sanitizeCatalog(arr) : INITIAL_AUTHORIZED_VEHICLES;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(catalog));
    } catch {
      /* localStorage no disponible: el catálogo sigue vivo en memoria */
    }
  }, [catalog]);

  /**
   * Registra un vehículo autorizado (PATENTE → EMPRESA).
   * La patente se normaliza; no se admiten duplicados.
   */
  const addVehicle = (plateInput: string, company: string) => {
    const plate = normalizePlate(plateInput);
    const name = company.trim();
    if (plate === '' || name === '') return false;

    let added = false;
    setCatalog(prev => {
      if (prev.some(v => normalizePlate(v.plate) === plate)) return prev;
      added = true;
      return [...prev, { plate, company: name }];
    });
    return added;
  };

  /** Elimina una patente del catálogo. */
  const removeVehicle = (plateInput: string) => {
    const plate = normalizePlate(plateInput);
    if (plate === '') return;
    setCatalog(prev => prev.filter(v => normalizePlate(v.plate) !== plate));
  };

  /** Restaura la semilla inicial del catálogo. */
  const restoreDefaults = () => {
    setCatalog(INITIAL_AUTHORIZED_VEHICLES.map(v => ({ ...v })));
  };

  /**
   * Aplica un PLAN de importación masiva (ver `domain/vehicleCatalogCsv.ts`)
   * sobre el catálogo existente.
   *
   * IMPORTANTE: usa el MISMO `setCatalog`/persistencia que el resto del hook,
   * así que la fuente de verdad NO cambia (sigue siendo `catalog` bajo
   * `securguard_vehicle_catalog_v1`). No crea una base paralela.
   *
   * Devuelve el número de entradas realmente agregadas.
   */
  const importVehicles = (entries: AuthorizedVehicle[]): number => {
    let addedCount = 0;

    setCatalog(prev => {
      const seen = new Set(prev.map(v => normalizePlate(v.plate)));
      const fresh: AuthorizedVehicle[] = [];

      for (const e of entries) {
        const plate = normalizePlate(e.plate);
        const company = typeof e.company === 'string' ? e.company.trim() : '';
        if (plate === '' || company === '') continue;
        // Duplicados por patente (canónicos) se descartan.
        if (seen.has(plate)) continue;
        seen.add(plate);
        fresh.push({ plate, company });
      }

      addedCount = fresh.length;
      return fresh.length === 0 ? prev : [...prev, ...fresh];
    });

    return addedCount;
  };

  return { catalog, addVehicle, removeVehicle, restoreDefaults, importVehicles, generateId };
}