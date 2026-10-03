/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVehicleCatalog } from './useVehicleCatalog';
import { resolveAuthorization } from '../domain/vehicleCatalog';
import { INITIAL_AUTHORIZED_VEHICLES } from '../data/mockVehicleCatalog';
import { importVehicleCatalogCSV } from '../domain/vehicleCatalogCsv';

const KEY = 'securguard_vehicle_catalog_v1';

/** Parte SIEMPRE de un catálogo vacío persistido. */
function seedEmptyCatalog(): void {
  localStorage.setItem(KEY, '[]');
}

describe('useVehicleCatalog — persistencia local', () => {
  beforeEach(seedEmptyCatalog);

  it('con la clave en [] el catálogo queda vacío (no siembra)', () => {
    const { result } = renderHook(() => useVehicleCatalog());
    expect(result.current.catalog).toEqual([]);
  });

  it('la semilla inicial está vacía a propósito', () => {
    expect(INITIAL_AUTHORIZED_VEHICLES).toEqual([]);
  });

  it('sin nada persistido también arranca vacío', () => {
    localStorage.removeItem(KEY);
    const { result } = renderHook(() => useVehicleCatalog());
    expect(result.current.catalog).toEqual([]);
  });

  it('toda patente es NO REGISTRADO mientras el catálogo esté vacío', () => {
    const { result } = renderHook(() => useVehicleCatalog());
    for (const p of ['WWCC-80', 'HHCC-29', 'ABCD-12']) {
      expect(resolveAuthorization(result.current.catalog, p).status).toBe('NO REGISTRADO');
    }
  });
});

describe('useVehicleCatalog — alta individual', () => {
  beforeEach(seedEmptyCatalog);

  it('agrega una patente nueva y la consulta como AUTORIZADO', () => {
    const { result } = renderHook(() => useVehicleCatalog());

    act(() => {
      result.current.addVehicle('ZZZZ-99', 'Empresa Nueva');
    });

    const r = resolveAuthorization(result.current.catalog, 'ZZZZ-99');
    expect(r.status).toBe('AUTORIZADO');
    expect(r.company).toBe('Empresa Nueva');
  });

  it('normaliza la patente al agregar (tsxd-99 → TSXD99)', () => {
    const { result } = renderHook(() => useVehicleCatalog());

    act(() => {
      result.current.addVehicle('tsxd-99', 'Sugerida');
    });

    expect(result.current.catalog.some(v => v.plate === 'TSXD99')).toBe(true);
    expect(resolveAuthorization(result.current.catalog, 'TSXD 99').company).toBe('Sugerida');
  });

  it('elimina una patente del catálogo', () => {
    const { result } = renderHook(() => useVehicleCatalog());

    act(() => {
      result.current.addVehicle('WWCC-80', 'Domatica');
    });
    expect(resolveAuthorization(result.current.catalog, 'WWCC-80').status).toBe('AUTORIZADO');

    act(() => {
      result.current.removeVehicle('WWCC-80');
    });
    expect(resolveAuthorization(result.current.catalog, 'WWCC-80').status).toBe('NO REGISTRADO');
  });
});

describe('useVehicleCatalog — importación masiva (H/I/J)', () => {
  beforeEach(seedEmptyCatalog);

  it('importa un CSV y deja las patentes como AUTORIZADO', () => {
    const { result } = renderHook(() => useVehicleCatalog());

    const plan = importVehicleCatalogCSV(
      result.current.catalog,
      'patente,empresa\nABCD-12,Sacyr\nEFGH-34,Domatica\nIJKL-56,Syc Soluciones'
    );
    expect(plan.newEntries).toHaveLength(3);

    act(() => {
      result.current.importVehicles(plan.newEntries);
    });

    expect(result.current.catalog).toHaveLength(3);
    expect(resolveAuthorization(result.current.catalog, 'ABCD-12').company).toBe('Sacyr');
    expect(resolveAuthorization(result.current.catalog, 'EFGH-34').status).toBe('AUTORIZADO');
    expect(resolveAuthorization(result.current.catalog, 'IJKL-56').company).toBe('Syc Soluciones');
  });

  it('una patente ausente del CSV queda NO REGISTRADO', () => {
    const { result } = renderHook(() => useVehicleCatalog());

    const plan = importVehicleCatalogCSV(result.current.catalog, 'ABCD-12,Sacyr');
    act(() => {
      result.current.importVehicles(plan.newEntries);
    });

    expect(resolveAuthorization(result.current.catalog, 'ZZZZ-99').status).toBe('NO REGISTRADO');
  });

  it('reimportar el mismo CSV no crea duplicados en el catálogo', () => {
    const { result } = renderHook(() => useVehicleCatalog());
    const csv = 'ABCD-12,Sacyr\nEFGH-34,Domatica';

    const first = importVehicleCatalogCSV(result.current.catalog, csv);
    act(() => {
      result.current.importVehicles(first.newEntries);
    });
    expect(result.current.catalog).toHaveLength(2);

    const second = importVehicleCatalogCSV(result.current.catalog, csv);
    expect(second.newEntries).toHaveLength(0);
    expect(second.duplicates).toHaveLength(2);

    act(() => {
      result.current.importVehicles(second.newEntries);
    });
    expect(result.current.catalog).toHaveLength(2);
  });

  it('descarta internamente los duplicados del CSV al importar', () => {
    const { result } = renderHook(() => useVehicleCatalog());

    const plan = importVehicleCatalogCSV(
      result.current.catalog,
      'ABCD-12,Sacyr\nabcd 12,Otra\nEFGH-34,Domatica'
    );
    expect(plan.newEntries).toHaveLength(2);

    act(() => {
      result.current.importVehicles(plan.newEntries);
    });
    expect(result.current.catalog).toHaveLength(2);
  });

  it('persiste el catálogo importado bajo la MISMA clave', () => {
    const { result } = renderHook(() => useVehicleCatalog());
    const plan = importVehicleCatalogCSV(result.current.catalog, 'ABCD-12,Sacyr');

    act(() => {
      result.current.importVehicles(plan.newEntries);
    });

    const stored = JSON.parse(localStorage.getItem(KEY) || '[]');
    expect(stored).toEqual([{ plate: 'ABCD12', company: 'Sacyr' }]);
  });

  it('NO escribe claves ajenas al catálogo', () => {
    localStorage.setItem('securguard_logs', '[{"id":"log-1"}]');
    const { result } = renderHook(() => useVehicleCatalog());
    const plan = importVehicleCatalogCSV(result.current.catalog, 'ABCD-12,Sacyr');

    act(() => {
      result.current.importVehicles(plan.newEntries);
    });

    // El historial de movimientos queda intacto.
    expect(localStorage.getItem('securguard_logs')).toBe('[{"id":"log-1"}]');
  });
});
