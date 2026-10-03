/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prueba de EXTREMO A EXTREMO de la importación por CSV (FASE 4).
 *
 * Encadena el flujo real completo:
 *   CSV → importVehicleCatalogCSV → useVehicleCatalog.importVehicles
 *        → resolveAuthorization → useAppState.handleVehicleEntry
 *
 * Usa los hooks REALES (no mocks de dominio), así que verifica que la
 * importación alimenta la misma fuente de verdad que usa Control de Acceso,
 * sin tocar sesiones ni historial.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVehicleCatalog } from '../hooks/useVehicleCatalog';
import { useAppState } from '../hooks/useAppState';
import { importVehicleCatalogCSV } from './vehicleCatalogCsv';
import { resolveAuthorization } from './vehicleCatalog';
import { VehicleEntryResult, LogItem } from '../types';

const CATALOG_KEY = 'securguard_vehicle_catalog_v1';

function seedEmpty(): void {
  localStorage.setItem(CATALOG_KEY, '[]');
  localStorage.setItem('securguard_logs', '[]');
  localStorage.setItem('securguard_active_inside', '[]');
  localStorage.setItem('securguard_incidents', '[]');
}

const CSV = ['patente,empresa', 'ABCD-12,Sacyr', 'EFGH-34,Domatica', 'IJKL-56,Syc Soluciones'].join('\n');

function entryLogOf(r: VehicleEntryResult): LogItem {
  expect(r.ok).toBe(true);
  return r.ok === true ? r.log : (null as unknown as LogItem);
}

describe('FASE 4 — extremo a extremo: CSV → Control de Acceso', () => {
  beforeEach(seedEmpty);

  it('importa el CSV y deja el catálogo con 3 vehículos AUTORIZADO', () => {
    const { result: cat } = renderHook(() => useVehicleCatalog());
    expect(cat.current.catalog).toEqual([]);

    const plan = importVehicleCatalogCSV(cat.current.catalog, CSV);
    expect(plan.newEntries).toHaveLength(3);

    act(() => {
      cat.current.importVehicles(plan.newEntries);
    });

    expect(cat.current.catalog).toHaveLength(3);
    for (const [plate, company] of [
      ['ABCD-12', 'Sacyr'],
      ['EFGH-34', 'Domatica'],
      ['IJKL-56', 'Syc Soluciones'],
    ]) {
      const r = resolveAuthorization(cat.current.catalog, plate);
      expect(r.status).toBe('AUTORIZADO');
      expect(r.company).toBe(company);
    }
  });

  it('una patente importada registra ENTRADA exactamente igual que antes', () => {
    const { result: cat } = renderHook(() => useVehicleCatalog());
    const plan = importVehicleCatalogCSV(cat.current.catalog, CSV);
    act(() => {
      cat.current.importVehicles(plan.newEntries);
    });

    const { result: app } = renderHook(() => useAppState());

    // (3) La empresa aparece automáticamente desde el catálogo.
    const auth = resolveAuthorization(cat.current.catalog, 'ABCD-12');
    expect(auth.company).toBe('Sacyr');

    // (4) AUTORIZADO.
    expect(auth.status).toBe('AUTORIZADO');

    // (5) La entrada se registra igual que siempre.
    let r!: VehicleEntryResult;
    act(() => {
      r = app.current.handleVehicleEntry('ABCD-12', auth.company ?? undefined);
    });
    const log = entryLogOf(r);

    expect(log.plate).toBe('ABCD12');
    expect(log.action).toBe('Entrada');
    expect(log.name).toBe('Sacyr');
    expect(app.current.isVehicleInside('ABCD-12')).toBe(true);
  });

  it('una patente ausente del CSV: NO REGISTRADO y la entrada NO se bloquea', () => {
    const { result: cat } = renderHook(() => useVehicleCatalog());
    const plan = importVehicleCatalogCSV(cat.current.catalog, CSV);
    act(() => {
      cat.current.importVehicles(plan.newEntries);
    });

    // (6) NO REGISTRADO.
    const ausente = resolveAuthorization(cat.current.catalog, 'ZZZZ-99');
    expect(ausente.status).toBe('NO REGISTRADO');

    // ...y aun así registra la entrada.
    const { result: app } = renderHook(() => useAppState());
    let r!: VehicleEntryResult;
    act(() => {
      r = app.current.handleVehicleEntry('ZZZZ-99', 'Empresa Operativa');
    });
    const log = entryLogOf(r);
    expect(log.plate).toBe('ZZZZ99');
    expect(app.current.isVehicleInside('ZZZZ-99')).toBe(true);
  });

  it('la importación NO crea movimientos por sí sola', () => {
    const { result: cat } = renderHook(() => useVehicleCatalog());
    const plan = importVehicleCatalogCSV(cat.current.catalog, CSV);
    act(() => {
      cat.current.importVehicles(plan.newEntries);
    });

    const { result: app } = renderHook(() => useAppState());
    expect(app.current.logs).toHaveLength(0);
    expect(app.current.activeInside).toHaveLength(0);
  });

  it('tras importar, el historial previo de movimientos sigue intacto', () => {
    // Historial precargado como si el guardia ya hubiera registrado movimientos.
    localStorage.setItem(
      'securguard_logs',
      JSON.stringify([
        {
          id: 'log-previo',
          name: 'Sacyr',
          rut: '',
          plate: 'WWCC80',
          type: 'VEHICULO',
          action: 'Entrada',
          time: '08:00',
          date: '2026-08-04',
          unit: 'Empresa: Sacyr',
          status: 'active',
        },
      ])
    );

    const { result: cat } = renderHook(() => useVehicleCatalog());
    const plan = importVehicleCatalogCSV(cat.current.catalog, CSV);
    act(() => {
      cat.current.importVehicles(plan.newEntries);
    });

    const { result: app } = renderHook(() => useAppState());
    // El log previo sigue ahí, con su empresa y su patente.
    expect(app.current.logs).toHaveLength(1);
    expect(app.current.logs[0].id).toBe('log-previo');
    expect(app.current.logs[0].plate).toBe('WWCC80');
    expect(app.current.logs[0].name).toBe('Sacyr');
    // Y la importación no lo tocó: WWCC80 no estaba en el CSV, así que
    // sigue fuera del catálogo (NO REGISTRADO).
    expect(resolveAuthorization(cat.current.catalog, 'WWCC80').status).toBe('NO REGISTRADO');
  });

  it('el catálogo importado sobrevive a una recarga (persistencia)', () => {
    const first = renderHook(() => useVehicleCatalog());
    const plan = importVehicleCatalogCSV(first.result.current.catalog, CSV);
    act(() => {
      first.result.current.importVehicles(plan.newEntries);
    });
    first.unmount();

    // Simula recarga: nuevo hook rehidrata desde localStorage.
    const reloaded = renderHook(() => useVehicleCatalog());
    expect(reloaded.result.current.catalog).toHaveLength(3);
    expect(resolveAuthorization(reloaded.result.current.catalog, 'IJKL-56').company).toBe(
      'Syc Soluciones'
    );
  });
});
