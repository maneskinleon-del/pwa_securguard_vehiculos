/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useAppState } from './useAppState';
import { normalizePlate } from '../domain/plate';
import { LogItem, VehicleEntryResult, VehicleDirectExitResult, VehicleExitOptions } from '../types';

// --- Helpers de resultado (la API devuelve uniones discriminadas) ---

/**
 * Extrae el LogItem de una ENTRADA exitosa; falla el test si el resultado
 * no fue exitoso. Es la forma segura de acceder al payload en el test.
 */
function entryLogOf(r: VehicleEntryResult): LogItem {
  expect(r.ok).toBe(true);
  return r.ok === true ? r.log : (null as unknown as LogItem);
}

/** Extrae el LogItem de una SALIDA DIRECTA exitosa; falla el test si no lo fue. */
function directExitLogOf(r: VehicleDirectExitResult): LogItem {
  expect(r.ok).toBe(true);
  return r.ok === true ? r.log : (null as unknown as LogItem);
}

/**
 * Deja el almacenamiento en arrays vacíos ANTES de montar el hook.
 *
 * Necesario porque useAppState, cuando no encuentra datos persistidos, cae a
 * los datos demo (INITIAL_LOGS con 7 logs). Los tests que verifican "no se
 * escribió nada" deben partir de un estado realmente vacío.
 */
function seedEmptyStorage(): void {
  localStorage.setItem('securguard_logs', '[]');
  localStorage.setItem('securguard_active_inside', '[]');
  localStorage.setItem('securguard_incidents', '[]');
  localStorage.setItem('securguard_personas', '[]');
}

/** Registra una ENTRADA dentro de act() y devuelve el resultado. */
function enterVehicle(
  result: { current: ReturnType<typeof useAppState> },
  plate: string,
  company?: string
): VehicleEntryResult {
  let r!: VehicleEntryResult;
  act(() => {
    r = result.current.handleVehicleEntry(plate, company);
  });
  return r;
}

/** Registra una SALIDA DIRECTA dentro de act() y devuelve el resultado. */
function directExit(
  result: { current: ReturnType<typeof useAppState> },
  plate: string,
  options?: VehicleExitOptions
): VehicleDirectExitResult {
  let r!: VehicleDirectExitResult;
  act(() => {
    r = result.current.handleVehicleDirectExit(plate, options);
  });
  return r;
}

describe('useAppState — Vehicle quick-register handlers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('isVehicleInside', () => {
    it('retorna false cuando no hay vehículos dentro', () => {
      const { result } = renderHook(() => useAppState());
      expect(result.current.isVehicleInside('ABCD12')).toBe(false);
    });

    it('retorna true después de registrar una entrada', () => {
      const { result } = renderHook(() => useAppState());
      enterVehicle(result, 'ABCD12');
      expect(result.current.isVehicleInside('ABCD12')).toBe(true);
    });

    it('matching es canónico (ignora formato y mayúsculas/minúsculas)', () => {
      const { result } = renderHook(() => useAppState());
      enterVehicle(result, 'ABCD12');
      expect(result.current.isVehicleInside('abcd-12')).toBe(true);
      expect(result.current.isVehicleInside('AB CD-12')).toBe(true);
    });
  });

  // =========================================================================
  // A) Primera entrada: PERMITIDA
  // =========================================================================
  describe('A) handleVehicleEntry — primera entrada', () => {
    it('registra una entrada válida y devuelve el LogItem', () => {
      const { result } = renderHook(() => useAppState());
      const log = entryLogOf(enterVehicle(result, 'ABCD12'));
      expect(log.type).toBe('VEHICULO');
      expect(log.action).toBe('Entrada');
      expect(log.plate).toBe('ABCD12');
      expect(log.rut).toBe('');
      expect(log.status).toBe('active');
      expect(log.entryTimestamp).toBeTypeOf('number');
      expect(log.id).toBeTruthy();
    });

    it('guarda la empresa cuando se proporciona', () => {
      const { result } = renderHook(() => useAppState());
      const log = entryLogOf(enterVehicle(result, 'ABCD12', 'Constructora XYZ'));
      expect(log.name).toBe('Constructora XYZ');
      const session = result.current.activeInside.find(
        s => s.rut === '' && normalizePlate(s.plate) === 'ABCD12'
      );
      expect(session).toBeDefined();
      expect(session!.name).toBe('Constructora XYZ');
    });

    it('usa "Vehículo" como nombre cuando no se proporciona empresa', () => {
      const { result } = renderHook(() => useAppState());
      expect(entryLogOf(enterVehicle(result, 'ABCD12')).name).toBe('Vehículo');
    });

    it('agrega la sesión a activeInside', () => {
      const { result } = renderHook(() => useAppState());
      enterVehicle(result, 'TR4590');
      const session = result.current.activeInside.find(
        s => s.rut === '' && s.plate === 'TR4590'
      );
      expect(session).toBeDefined();
      expect(session!.type).toBe('VEHICULO');
    });

    it('rechaza patentes inválidas', () => {
      const { result } = renderHook(() => useAppState());
      const r = enterVehicle(result, 'XYZ');
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.reason).toBe('invalid_plate');
      expect(result.current.isVehicleInside('XYZ')).toBe(false);
    });

    it('normaliza la patente antes de registrar', () => {
      const { result } = renderHook(() => useAppState());
      enterVehicle(result, 'abcd-12');
      expect(result.current.isVehicleInside('ABCD12')).toBe(true);
      const log = result.current.logs.find(l => l.plate === 'ABCD12');
      expect(log).toBeDefined();
      expect(log!.action).toBe('Entrada');
    });
  });

  // =========================================================================
  // B + C) Entrada duplicada: BLOQUEADA y MATCH contra la sesión abierta
  // =========================================================================
  describe('B/C) ENTRADA DUPLICADA — bloqueada + MATCH', () => {
    it('la segunda entrada mientras está dentro queda BLOQUEADA', () => {
      const { result } = renderHook(() => useAppState());
      const first = entryLogOf(enterVehicle(result, 'TSXD99', 'Sacyr'));

      const second = enterVehicle(result, 'TSXD99');
      expect(second.ok).toBe(false);
      expect(second.ok === false && second.reason).toBe('already_inside');

      // No se creó otra entrada
      const entries = result.current.logs.filter(
        l => l.plate === 'TSXD99' && l.action === 'Entrada'
      );
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe(first.id);

      // Solo una sesión abierta
      const openSessions = result.current.activeInside.filter(
        s => s.rut === '' && normalizePlate(s.plate) === 'TSXD99'
      );
      expect(openSessions).toHaveLength(1);
    });

    it('el MATCH devuelve la sesión abierta existente (patente, empresa, hora de entrada)', () => {
      const { result } = renderHook(() => useAppState());
      const first = entryLogOf(enterVehicle(result, 'TSXD99', 'Sacyr'));

      const second = enterVehicle(result, 'TSXD99');
      expect(second.ok).toBe(false);
      if (second.ok === false && second.reason === 'already_inside') {
        expect(normalizePlate(second.session.plate)).toBe('TSXD99');
        expect(second.session.name).toBe('Sacyr');            // empresa de la sesión existente
        expect(second.session.entryTime).toBe(first.time);    // hora de entrada original
        expect(second.session.id).toBe(first.id);
      } else {
        throw new Error('Se esperaba un MATCH (already_inside)');
      }
    });

    it('el MATCH es canónico: distinto formato de patente coincide', () => {
      const { result } = renderHook(() => useAppState());
      enterVehicle(result, 'ABCD12');
      const second = enterVehicle(result, 'ab-cd 12');
      expect(second.ok).toBe(false);
      expect(second.ok === false && second.reason).toBe('already_inside');
    });

    it('la entrada duplicada NO genera log de Salida fantasma', () => {
      const { result } = renderHook(() => useAppState());
      enterVehicle(result, 'TSXD99', 'Sacyr');
      const logsAfterFirst = result.current.logs.length;

      enterVehicle(result, 'TSXD99');
      enterVehicle(result, 'TSXD99');
      enterVehicle(result, 'TSXD99');

      // Ninguna escritura: ni Entradas nuevas ni Salidas de cierre
      expect(result.current.logs.length).toBe(logsAfterFirst);
      expect(
        result.current.logs.filter(l => l.plate === 'TSXD99' && l.action === 'Salida')
      ).toHaveLength(0);
    });
  });

  // =========================================================================
  // D) Entrada tras salida: PERMITIDA (dos sesiones históricas)
  // =========================================================================
  describe('D) CASO 3 — Entrada → Salida → Entrada', () => {
    it('permite volver a entrar después de salir y crea una segunda sesión histórica', () => {
      const { result } = renderHook(() => useAppState());
      const first = entryLogOf(enterVehicle(result, 'ABCD12', 'Sacyr'));

      act(() => {
        result.current.handleVehicleExit('ABCD12');
      });
      expect(result.current.isVehicleInside('ABCD12')).toBe(false);

      const second = entryLogOf(enterVehicle(result, 'ABCD12', 'Sacyr'));
      expect(result.current.isVehicleInside('ABCD12')).toBe(true);
      expect(second.id).not.toBe(first.id);

      // Dos entradas históricas y una única sesión abierta
      const entries = result.current.logs.filter(
        l => l.plate === 'ABCD12' && l.action === 'Entrada'
      );
      expect(entries).toHaveLength(2);
      const openSessions = result.current.activeInside.filter(s => s.plate === 'ABCD12');
      expect(openSessions).toHaveLength(1);
      expect(openSessions[0].id).toBe(second.id);
    });

    it('findVehicleSession encuentra la sesión abierta por patente canónica', () => {
      const { result } = renderHook(() => useAppState());
      enterVehicle(result, 'KH-82-91');
      const session = result.current.findVehicleSession('kh8291');
      expect(session).toBeDefined();
      expect(session!.rut).toBe(''); // vehículo rápido sin RUT
      expect(session!.plate).toBe('KH8291');
    });
  });

  // =========================================================================
  // E) Salida normal de vehículo dentro
  // =========================================================================
  describe('E) handleVehicleExit — salida normal', () => {
    it('cierra la sesión abierta y devuelve true', () => {
      const { result } = renderHook(() => useAppState());
      enterVehicle(result, 'ABCD12');
      expect(result.current.isVehicleInside('ABCD12')).toBe(true);

      let ok!: boolean;
      act(() => {
        ok = result.current.handleVehicleExit('ABCD12');
      });
      expect(ok).toBe(true);
      expect(result.current.isVehicleInside('ABCD12')).toBe(false);
    });

    it('crea un log de Salida enlazado a la entrada original (entryId)', () => {
      const { result } = renderHook(() => useAppState());
      const entry = entryLogOf(enterVehicle(result, 'ABCD12'));
      act(() => {
        result.current.handleVehicleExit('ABCD12');
      });

      const exitLog = result.current.logs.find(
        l => l.plate === 'ABCD12' && l.action === 'Salida'
      );
      expect(exitLog).toBeDefined();
      expect(exitLog!.status).toBe('exited');
      expect(exitLog!.entryId).toBe(entry.id);
      expect(exitLog!.directExit).toBeUndefined(); // salida normal, no directa
    });

    it('devuelve false cuando el vehículo no está dentro (usar salida directa)', () => {
      const { result } = renderHook(() => useAppState());
      let ok!: boolean;
      act(() => {
        ok = result.current.handleVehicleExit('ABCD12');
      });
      expect(ok).toBe(false);
    });

    it('registra observación y tipo de salida sin bloquear la salida', () => {
      const { result } = renderHook(() => useAppState());
      enterVehicle(result, 'ABCD12', 'Sacyr');

      let ok!: boolean;
      act(() => {
        ok = result.current.handleVehicleExit('ABCD12', {
          exitType: 'Con carga / materiales',
          observation: 'No entrega nombre del conductor',
        });
      });
      expect(ok).toBe(true);

      const exitLog = result.current.logs.find(
        l => l.plate === 'ABCD12' && l.action === 'Salida'
      );
      expect(exitLog!.exitType).toBe('Con carga / materiales');
      // "No entrega nombre del conductor" se registra SIN impedir la salida
      expect(exitLog!.observation).toBe('No entrega nombre del conductor');
      expect(result.current.isVehicleInside('ABCD12')).toBe(false);
    });
  });

  // =========================================================================
  // F/G/H/I/J) SALIDA DIRECTA (sin entrada local en esta portería)
  // =========================================================================
  describe('F-J) handleVehicleDirectExit — salida directa', () => {
    it('F) registra la salida de un vehículo no registrado (no está dentro)', () => {
      const { result } = renderHook(() => useAppState());
      expect(result.current.isVehicleInside('ABCD12')).toBe(false);

      const log = directExitLogOf(directExit(result, 'ABCD12'));
      expect(log.action).toBe('Salida');
      expect(log.status).toBe('exited');
      expect(log.plate).toBe('ABCD12');
      expect(log.directExit).toBe(true);
      expect(result.current.isVehicleInside('ABCD12')).toBe(false);
      expect(result.current.findVehicleSession('ABCD12')).toBeUndefined();
    });

    it('G) NO crea una entrada ficticia ni inventa hora de entrada', () => {
      seedEmptyStorage();
      const { result } = renderHook(() => useAppState());
      directExit(result, 'ABCD12');

      // Sin log de Entrada
      expect(result.current.logs.filter(l => l.action === 'Entrada')).toHaveLength(0);
      // Sin sesión activa
      expect(result.current.activeInside).toHaveLength(0);

      const log = result.current.logs[0];
      expect(log.directExit).toBe(true);
      expect(log.entryId).toBeUndefined();        // no hay entrada a la que apuntar
      expect(log.entryTimestamp).toBeUndefined(); // no se inventa timestamp de entrada
    });

    it('H) puede guardar empresa', () => {
      const { result } = renderHook(() => useAppState());
      const log = directExitLogOf(directExit(result, 'ABCD12', { company: 'Sacyr' }));
      expect(log.name).toBe('Sacyr');
    });

    it('I) puede guardar tipo de salida', () => {
      const { result } = renderHook(() => useAppState());
      const log = directExitLogOf(directExit(result, 'ABCD12', { exitType: 'Vacío' }));
      expect(log.exitType).toBe('Vacío');
    });

    it('J) puede guardar observación', () => {
      const { result } = renderHook(() => useAppState());
      const log = directExitLogOf(
        directExit(result, 'ABCD12', { observation: 'Entrada registrada en otra portería' })
      );
      expect(log.observation).toBe('Entrada registrada en otra portería');
    });

    it('está bloqueada si el vehículo SÍ está dentro (corresponde SALIDA normal)', () => {
      seedEmptyStorage();
      const { result } = renderHook(() => useAppState());
      enterVehicle(result, 'ABCD12');

      const r = directExit(result, 'ABCD12');
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.reason).toBe('already_inside');
      // No se escribió nada: sigue dentro y sin log de Salida
      expect(result.current.isVehicleInside('ABCD12')).toBe(true);
      expect(result.current.logs.filter(l => l.action === 'Salida')).toHaveLength(0);
    });

    it('rechaza patentes inválidas', () => {
      seedEmptyStorage();
      const { result } = renderHook(() => useAppState());
      const r = directExit(result, 'XYZ');
      expect(r.ok).toBe(false);
      expect(r.ok === false && r.reason).toBe('invalid_plate');
      expect(result.current.logs).toHaveLength(0);
    });

    it('CASO 5/6) la salida directa no bloquea una ENTRADA posterior', () => {
      const { result } = renderHook(() => useAppState());
      directExit(result, 'ABCD12', { company: 'Sacyr' });

      const entry = entryLogOf(enterVehicle(result, 'ABCD12', 'Sacyr'));
      expect(result.current.isVehicleInside('ABCD12')).toBe(true);
      expect(entry.action).toBe('Entrada');
      // La salida directa sigue sin entrada asociada
      const directLog = result.current.logs.find(l => l.directExit === true);
      expect(directLog!.entryId).toBeUndefined();
    });
  });

  // =========================================================================
  // K) Persistencia y reconstrucción tras recargar
  // =========================================================================
  describe('K) Persistencia y recarga', () => {
    it('persiste los logs y activeInside en localStorage', () => {
      const { result } = renderHook(() => useAppState());
      enterVehicle(result, 'ABCD12');

      const storedLogs = JSON.parse(localStorage.getItem('securguard_logs') || '[]');
      const storedActive = JSON.parse(localStorage.getItem('securguard_active_inside') || '[]');

      const vehicleLogs = storedLogs.filter((l: { plate?: string }) => l.plate === 'ABCD12');
      expect(vehicleLogs.length).toBeGreaterThan(0);
      expect(storedActive.length).toBeGreaterThan(0);
    });

    it('reconstruye la sesión abierta al recargar (rehydration desde localStorage)', () => {
      const first = renderHook(() => useAppState());
      enterVehicle(first.result, 'ABCD12', 'Sacyr');
      expect(first.result.current.isVehicleInside('ABCD12')).toBe(true);
      first.unmount();

      // Simula recarga: nuevo hook que rehidrata desde localStorage
      const reloaded = renderHook(() => useAppState());
      expect(reloaded.result.current.isVehicleInside('ABCD12')).toBe(true);
      const session = reloaded.result.current.findVehicleSession('ABCD12');
      expect(session).toBeDefined();
      expect(session!.name).toBe('Sacyr');
      // La entrada duplicada sigue bloqueada tras la recarga
      const dup = enterVehicle(reloaded.result, 'ABCD12');
      expect(dup.ok).toBe(false);
      expect(dup.ok === false && dup.reason).toBe('already_inside');
    });

    it('conserva las salidas directas y su trazabilidad al recargar', () => {
      const first = renderHook(() => useAppState());
      directExit(first.result, 'ABCD12', {
        company: 'Sacyr',
        exitType: 'Vacío',
        observation: 'Vino de otra portería',
      });
      first.unmount();

      const reloaded = renderHook(() => useAppState());
      const log = reloaded.result.current.logs.find(l => l.directExit === true);
      expect(log).toBeDefined();
      expect(log!.plate).toBe('ABCD12');
      expect(log!.exitType).toBe('Vacío');
      expect(log!.observation).toBe('Vino de otra portería');
      expect(reloaded.result.current.isVehicleInside('ABCD12')).toBe(false);
    });
  });
});