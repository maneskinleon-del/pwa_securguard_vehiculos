/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  calculateEntriesToday,
  calculateLongStayAlerts,
  calculateHourlyTraffic,
  findPeakHour,
  formatHour,
  parseHourFromTimeString,
  formatDuration,
  isLongStay,
  getStayDurationMs,
  reconstructSessions,
  normalizeRutForComparison,
  pairExitWithEntry,
  hasValidEntryPair,
  resolveMovementDeletion,
  LONG_STAY_THRESHOLD_MS,
} from './access';
import { LogItem, ActiveCheckIn } from '../types';
import { getLocalDateISO } from '../utils/datetime';

// --- Helper fixtures ---

const TODAY = getLocalDateISO();
// OJO: no usar toISOString() aquí. Es UTC, y en horario de verano de Chile
// (UTC-3) a partir de las 21:00 locales "ayer" calculado por UTC cae en el
// mismo día local → el fixture dejaría de ser "ayer" y los tests contarían
// un log de más. getLocalDateISO() es exactamente el helper creado para
// evitar esa trampa (ver utils/datetime.ts).
const YESTERDAY = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return getLocalDateISO(d);
})();

const makeEntry = (overrides: Partial<LogItem> = {}): LogItem => ({
  id: 'log-1',
  name: 'Test Person',
  rut: '12.345.678-9',
  plate: undefined,
  type: 'VISITANTE',
  action: 'Entrada',
  time: '10:00',
  date: TODAY,
  unit: 'Unit 101',
  avatar: undefined,
  status: 'active',
  entryTimestamp: Date.now() - 30 * 60 * 1000, // 30 mins ago
  ...overrides,
});

const makeActive = (overrides: Partial<ActiveCheckIn> = {}): ActiveCheckIn => ({
  id: 'log-1',
  name: 'Test Person',
  rut: '12.345.678-9',
  plate: undefined,
  type: 'VISITANTE',
  unit: 'Unit 101',
  entryTime: '10:00',
  entryDate: TODAY,
  entryTimestamp: Date.now() - 30 * 60 * 1000, // 30 mins ago
  avatar: undefined,
  ...overrides,
});

describe('access domain', () => {
  describe('calculateEntriesToday', () => {
    it('counts only Entrada actions for today', () => {
      const logs: LogItem[] = [
        makeEntry({ id: '1', action: 'Entrada', date: TODAY }),
        makeEntry({ id: '2', action: 'Salida', date: TODAY }),
        makeEntry({ id: '3', action: 'Entrada', date: TODAY }),
        makeEntry({ id: '4', action: 'Entrada', date: YESTERDAY }),
      ];
      expect(calculateEntriesToday(logs)).toBe(2);
    });

    it('returns 0 when no entries today', () => {
      const logs: LogItem[] = [
        makeEntry({ id: '1', action: 'Salida', date: TODAY }),
      ];
      expect(calculateEntriesToday(logs)).toBe(0);
    });
  });

  describe('calculateLongStayAlerts', () => {
    it('returns 0 when no active sessions', () => {
      expect(calculateLongStayAlerts([])).toBe(0);
    });

    it('returns 0 when no one exceeds threshold', () => {
      const active = [
        makeActive({ id: '1', entryTimestamp: Date.now() - 30 * 60 * 1000 }), // 30 mins
        makeActive({ id: '2', entryTimestamp: Date.now() - 45 * 60 * 1000 }), // 45 mins
      ];
      expect(calculateLongStayAlerts(active, 'VISITANTE')).toBe(0);
    });

    it('counts visitors exceeding 60 minute threshold', () => {
      const active = [
        makeActive({ id: '1', entryTimestamp: Date.now() - 30 * 60 * 1000 }), // 30 mins
        makeActive({ id: '2', entryTimestamp: Date.now() - 90 * 60 * 1000 }), // 90 mins
        makeActive({ id: '3', type: 'CONTRATISTA', entryTimestamp: Date.now() - 120 * 60 * 1000 }), // contractor, 120 mins
      ];
      // Only visitors (VISITANTE) who exceed 60 mins
      expect(calculateLongStayAlerts(active, 'VISITANTE')).toBe(1);
    });

    it('counts all types when no filter specified', () => {
      const active = [
        makeActive({ id: '1', type: 'VISITANTE', entryTimestamp: Date.now() - 90 * 60 * 1000 }),
        makeActive({ id: '2', type: 'CONTRATISTA', entryTimestamp: Date.now() - 90 * 60 * 1000 }),
      ];
      expect(calculateLongStayAlerts(active)).toBe(2);
    });
  });

  describe('parseHourFromTimeString', () => {
    it('parses 24-hour format', () => {
      expect(parseHourFromTimeString('10:30')).toBe(10);
      expect(parseHourFromTimeString('00:00')).toBe(0);
      expect(parseHourFromTimeString('23:59')).toBe(23);
    });

    it('parses 12-hour format with AM/PM', () => {
      expect(parseHourFromTimeString('10:30 AM')).toBe(10);
      expect(parseHourFromTimeString('10:30 PM')).toBe(22);
      expect(parseHourFromTimeString('12:00 PM')).toBe(12);
      expect(parseHourFromTimeString('12:00 AM')).toBe(0);
    });

    it('returns -1 for invalid input', () => {
      expect(parseHourFromTimeString('')).toBe(-1);
      expect(parseHourFromTimeString('invalid')).toBe(-1);
    });
  });

  describe('calculateHourlyTraffic', () => {
    it('returns array of 24 zeros when no logs', () => {
      const result = calculateHourlyTraffic([]);
      expect(result).toHaveLength(24);
      expect(result.every(n => n === 0)).toBe(true);
    });

    it('distributes entries by hour', () => {
      const logs: LogItem[] = [
        makeEntry({ id: '1', time: '08:15', date: TODAY }),
        makeEntry({ id: '2', time: '08:47', date: TODAY }),
        makeEntry({ id: '3', time: '09:03', date: TODAY }),
        makeEntry({ id: '4', time: '14:21', date: TODAY }),
        makeEntry({ id: '5', time: '14:45', date: TODAY }),
        makeEntry({ id: '6', time: '14:45', date: YESTERDAY }), // should not count
      ];
      const result = calculateHourlyTraffic(logs);
      expect(result[8]).toBe(2);  // 2 entries at 08:xx
      expect(result[9]).toBe(1);  // 1 entry at 09:xx
      expect(result[14]).toBe(2); // 2 entries at 14:xx
      expect(result[0]).toBe(0);  // no entries at midnight
    });
  });

  describe('findPeakHour', () => {
    it('returns null when no entries', () => {
      expect(findPeakHour([])).toBeNull();
    });

    it('finds the hour with most entries', () => {
      const logs: LogItem[] = [
        makeEntry({ id: '1', time: '08:00' }),
        makeEntry({ id: '2', time: '08:30' }),
        makeEntry({ id: '3', time: '09:00' }),
        makeEntry({ id: '4', time: '14:00' }),
        makeEntry({ id: '5', time: '14:00' }),
        makeEntry({ id: '6', time: '14:00' }),
      ];
      const result = findPeakHour(logs);
      expect(result).toEqual({ hour: 14, count: 3 });
    });
  });

  describe('formatHour', () => {
    it('formats hour numbers correctly', () => {
      expect(formatHour(0)).toBe('00:00');
      expect(formatHour(8)).toBe('08:00');
      expect(formatHour(14)).toBe('14:00');
      expect(formatHour(23)).toBe('23:00');
    });
  });

  describe('formatDuration', () => {
    it('formats seconds correctly', () => {
      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(30000)).toBe('30s');
      expect(formatDuration(59000)).toBe('59s');
    });

    it('formats minutes correctly', () => {
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(45 * 60 * 1000)).toBe('45m');
      expect(formatDuration(59 * 60 * 1000)).toBe('59m');
    });

    it('formats hours and minutes correctly', () => {
      expect(formatDuration(60 * 60 * 1000)).toBe('1h 0m');
      expect(formatDuration(90 * 60 * 1000)).toBe('1h 30m');
      expect(formatDuration(125 * 60 * 1000)).toBe('2h 5m');
    });
  });

  describe('isLongStay', () => {
    it('returns false when entryTimestamp is missing', () => {
      const active = makeActive({ entryTimestamp: undefined });
      expect(isLongStay(active)).toBe(false);
    });

    it('returns false when stay is under threshold', () => {
      const active = makeActive({ entryTimestamp: Date.now() - 30 * 60 * 1000 });
      expect(isLongStay(active)).toBe(false);
    });

    it('returns true when stay exceeds threshold', () => {
      const active = makeActive({ entryTimestamp: Date.now() - 90 * 60 * 1000 });
      expect(isLongStay(active)).toBe(true);
    });
  });

  describe('getStayDurationMs', () => {
    it('returns 0 when entryTimestamp is missing', () => {
      const active = makeActive({ entryTimestamp: undefined });
      expect(getStayDurationMs(active)).toBe(0);
    });

    it('returns positive duration for active session', () => {
      const active = makeActive({ entryTimestamp: Date.now() - 30 * 60 * 1000 });
      const duration = getStayDurationMs(active);
      expect(duration).toBeGreaterThan(0);
      expect(duration).toBeLessThanOrEqual(30 * 60 * 1000);
    });
  });

  describe('normalizeRutForComparison', () => {
    it('trims and uppercases RUT', () => {
      expect(normalizeRutForComparison('  12.345.678-9  ')).toBe('12.345.678-9');
      expect(normalizeRutForComparison('lowercase')).toBe('LOWERCASE');
    });

    it('handles null/undefined', () => {
      expect(normalizeRutForComparison(null)).toBe('');
      expect(normalizeRutForComparison(undefined)).toBe('');
    });
  });

  describe('hasValidEntryPair', () => {
    it('returns true when entryId is set', () => {
      const exitLog = makeEntry({ id: 'exit-1', action: 'Salida', entryId: 'entry-1' });
      expect(hasValidEntryPair(exitLog)).toBe(true);
    });

    it('returns false when entryId is missing', () => {
      const exitLog = makeEntry({ id: 'exit-1', action: 'Salida' });
      expect(hasValidEntryPair(exitLog)).toBe(false);
    });
  });

  describe('pairExitWithEntry', () => {
    it('returns null when exit has no entryId', () => {
      const exitLog = makeEntry({ id: 'exit-1', action: 'Salida' });
      const logs: LogItem[] = [makeEntry({ id: 'entry-1' })];
      expect(pairExitWithEntry(exitLog, logs)).toBeNull();
    });

    it('returns matching entry when found', () => {
      const exitLog = makeEntry({ id: 'exit-1', action: 'Salida', entryId: 'entry-1' });
      const entryLog = makeEntry({ id: 'entry-1', action: 'Entrada' });
      const logs: LogItem[] = [entryLog, exitLog];
      expect(pairExitWithEntry(exitLog, logs)).toEqual(entryLog);
    });

    it('returns null when matching entry not found', () => {
      const exitLog = makeEntry({ id: 'exit-1', action: 'Salida', entryId: 'non-existent' });
      const logs: LogItem[] = [makeEntry({ id: 'entry-1' })];
      expect(pairExitWithEntry(exitLog, logs)).toBeNull();
    });
  });

  describe('reconstructSessions', () => {
    it('pairs entries with their exits via entryId', () => {
      const entryLog = makeEntry({ id: 'entry-1', action: 'Entrada', entryTimestamp: 1000 });
      const exitLog = makeEntry({ id: 'exit-1', action: 'Salida', entryId: 'entry-1', entryTimestamp: 2000 });
      const logs: LogItem[] = [entryLog, exitLog];

      const sessions = reconstructSessions(logs);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].entryLog).toEqual(entryLog);
      expect(sessions[0].exitLog).toEqual(exitLog);
      expect(sessions[0].durationMs).toBe(1000);
    });

    it('handles entries without exits', () => {
      const entryLog = makeEntry({ id: 'entry-1', action: 'Entrada' });
      const logs: LogItem[] = [entryLog];

      const sessions = reconstructSessions(logs);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].entryLog).toEqual(entryLog);
      expect(sessions[0].exitLog).toBeNull();
      expect(sessions[0].durationMs).toBeNull();
    });
  });

  describe('resolveMovementDeletion', () => {
    it('eliminar una Salida borra solo esa Salida y conserva la Entrada', () => {
      const entry = makeEntry({ id: 'entry-1', action: 'Entrada', status: 'active' });
      const exit = makeEntry({ id: 'exit-1', action: 'Salida', entryId: 'entry-1', status: 'exited' });
      const active = [makeActive({ id: 'entry-1' })];
      const logs = [entry, exit];

      const plan = resolveMovementDeletion(logs, active, 'exit-1');
      expect(plan.removeLogIds).toEqual(['exit-1']);
      expect(plan.removeActiveIds).toEqual([]);
    });

    it('eliminar una Entrada con Salida asociada por entryId borra la sesión completa', () => {
      const entry = makeEntry({ id: 'entry-1', action: 'Entrada', status: 'exited' });
      const exit = makeEntry({ id: 'exit-1', action: 'Salida', entryId: 'entry-1', status: 'exited' });
      const logs = [entry, exit];

      const plan = resolveMovementDeletion(logs, [], 'entry-1');
      expect(plan.removeLogIds).toEqual(['entry-1', 'exit-1']);
      expect(plan.removeActiveIds).toEqual([]);
    });

    it('eliminar una Entrada activa sin Salida la saca también de activeInside', () => {
      const entry = makeEntry({ id: 'entry-1', action: 'Entrada', status: 'active' });
      const logs = [entry];
      const active = [makeActive({ id: 'entry-1' }), makeActive({ id: 'other-1' })];

      const plan = resolveMovementDeletion(logs, active, 'entry-1');
      expect(plan.removeLogIds).toEqual(['entry-1']);
      expect(plan.removeActiveIds).toEqual(['entry-1']);
    });

    it('eliminar una Entrada con Salida asociada y activa en activeInside mantiene consistencia en ambos arrays', () => {
      const entry = makeEntry({ id: 'entry-1', action: 'Entrada', status: 'active' });
      const exit = makeEntry({ id: 'exit-1', action: 'Salida', entryId: 'entry-1', status: 'exited' });
      const logs = [entry, exit];
      const active = [makeActive({ id: 'entry-1' })];

      const plan = resolveMovementDeletion(logs, active, 'entry-1');
      expect(plan.removeLogIds).toEqual(['entry-1', 'exit-1']);
      expect(plan.removeActiveIds).toEqual(['entry-1']);
    });

    it('eliminar una Entrada con múltiples Salidas asociadas borra todas (sin huérfanas)', () => {
      const entry = makeEntry({ id: 'entry-1', action: 'Entrada', status: 'exited' });
      const exit1 = makeEntry({ id: 'exit-1', action: 'Salida', entryId: 'entry-1', status: 'exited' });
      const exit2 = makeEntry({ id: 'exit-2', action: 'Salida', entryId: 'entry-1', status: 'exited' });
      const logs = [entry, exit1, exit2];

      const plan = resolveMovementDeletion(logs, [], 'entry-1');
      expect(plan.removeLogIds).toEqual(['entry-1', 'exit-1', 'exit-2']);
    });

    it('eliminar una Entrada cerrada sin Salida toca solo logs (no activeInside)', () => {
      const entry = makeEntry({ id: 'entry-1', action: 'Entrada', status: 'exited' });
      const logs = [entry];
      const active = [];

      const plan = resolveMovementDeletion(logs, active, 'entry-1');
      expect(plan.removeLogIds).toEqual(['entry-1']);
      expect(plan.removeActiveIds).toEqual([]);
    });

    it('devuelve sets vacíos para un id inexistente (idempotente)', () => {
      const entry = makeEntry({ id: 'entry-1', action: 'Entrada', status: 'active' });
      const active = [makeActive({ id: 'entry-1' })];

      const plan = resolveMovementDeletion([entry], active, 'no-existe');
      expect(plan.removeLogIds).toEqual([]);
      expect(plan.removeActiveIds).toEqual([]);
    });

    it('no toca activeInside cuando se elimina una Salida aunque haya sesiones activas', () => {
      const entry = makeEntry({ id: 'entry-1', action: 'Entrada', status: 'active' });
      const exit = makeEntry({ id: 'exit-1', action: 'Salida', entryId: 'entry-1', status: 'exited' });
      const logs = [entry, exit];
      const active = [makeActive({ id: 'entry-1' })];

      const plan = resolveMovementDeletion(logs, active, 'exit-1');
      expect(plan.removeLogIds).toEqual(['exit-1']);
      expect(plan.removeActiveIds).toEqual([]);
    });
  });

  describe('LONG_STAY_THRESHOLD_MS', () => {
    it('is 60 minutes in milliseconds', () => {
      expect(LONG_STAY_THRESHOLD_MS).toBe(60 * 60 * 1000);
    });
  });
});
