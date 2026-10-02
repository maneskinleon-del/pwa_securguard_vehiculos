/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, Dispatch, SetStateAction } from 'react';
import {
  LogItem,
  IncidentReport,
  GuardProfile,
  AccessType,
  Persona,
  ActiveCheckIn,
  VehicleExitType,
  VehicleEntryResult,
  VehicleDirectExitResult,
  VehicleExitOptions,
  VEHICLE_EXIT_TYPES,
} from '../types';
import { INITIAL_LOGS, INITIAL_INCIDENTS, DEFAULT_GUARD } from '../data/mockData';
import { getLocalDateISO } from '../utils/datetime';
import { resolveMovementDeletion } from '../domain/access';
import { normalizePlate, isValidPlate } from '../domain/plate';

// --- Defensive rehydration helpers (Incidencia A) ---
// Normalize a RUT for safe comparison without throwing on null/undefined.
const normRut = (v?: string | null): string => (v ?? '').trim().toUpperCase();

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object';
const safeStr = (v: unknown, d = ''): string => (typeof v === 'string' ? v : d);
const safeOptStr = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const safeNum = (v: unknown): number | undefined => (typeof v === 'number' && isFinite(v) ? v : undefined);

// Validate a persisted exit type against the closed list (defensive rehydration).
const safeExitType = (v: unknown): VehicleExitType | undefined =>
  typeof v === 'string' && (VEHICLE_EXIT_TYPES as readonly string[]).includes(v)
    ? (v as VehicleExitType)
    : undefined;

// Read an array from localStorage, returning null on missing/invalid/non-array JSON.
const readArray = (key: string): any[] | null => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // [] (JSON guardado como vacío) es un borrado legítimo y debe persistir;
    // solo null/ausencia de clave dispara los datos demo de primer arranque.
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) {
    console.error(`[rehydrate] No se pudo parsear ${key}; usando valores por defecto.`, e);
    return null;
  }
};

const sanitizeLogs = (arr: any[]): LogItem[] =>
  arr.filter(isObj).map((l, i) => ({
    id: safeStr(l.id) || `rehydrated-log-${i}`,
    name: safeStr(l.name),
    rut: safeStr(l.rut),
    plate: safeOptStr(l.plate),
    type: safeStr(l.type, 'VISITANTE') as AccessType,
    action: l.action === 'Salida' ? 'Salida' : 'Entrada',
    time: safeStr(l.time),
    date: safeStr(l.date),
    unit: safeStr(l.unit),
    avatar: safeOptStr(l.avatar),
    status: l.status === 'exited' ? 'exited' : 'active',
    duration: safeOptStr(l.duration),
    entryId: safeOptStr(l.entryId),
    entryTimestamp: safeNum(l.entryTimestamp),
    // Trazabilidad de salida directa + metadatos de salida (opcionales).
    directExit: l.directExit === true ? true : undefined,
    exitType: safeExitType(l.exitType),
    observation: safeOptStr(l.observation),
  }));

const sanitizeActive = (arr: any[]): ActiveCheckIn[] =>
  arr.filter(isObj).map((s, i) => ({
    id: safeStr(s.id) || `rehydrated-active-${i}`,
    name: safeStr(s.name),
    rut: safeStr(s.rut),
    plate: safeOptStr(s.plate),
    type: safeStr(s.type, 'VISITANTE') as AccessType,
    unit: safeStr(s.unit),
    entryTime: safeStr(s.entryTime),
    entryDate: safeStr(s.entryDate),
    entryTimestamp: safeNum(s.entryTimestamp) ?? 0,
    avatar: safeOptStr(s.avatar),
  }));

const sanitizePersonas = (arr: any[]): Persona[] =>
  arr
    .filter(isObj)
    .filter(p => safeStr(p.name).trim() !== '' || safeStr(p.rut).trim() !== '')
    .map((p, i) => ({
      id: safeStr(p.id) || `rehydrated-persona-${i}`,
      name: safeStr(p.name),
      rut: safeStr(p.rut),
      plate: safeOptStr(p.plate),
      type: safeStr(p.type, 'VISITANTE') as AccessType,
      unit: safeStr(p.unit),
      avatar: safeOptStr(p.avatar),
    }));

const sanitizeIncidents = (arr: any[]): IncidentReport[] =>
  arr.filter(isObj).map((i, idx) => ({
    id: safeStr(i.id) || `rehydrated-inc-${idx}`,
    title: safeStr(i.title),
    description: safeStr(i.description),
    category: (i.category === 'URGENTE' || i.category === 'MODERADO' || i.category === 'PREVENTIVO')
      ? i.category
      : 'MODERADO',
    time: safeStr(i.time),
    // Backfill: incidencias viejas (pre-campo `date`) quedan con la fecha de hoy
    date: safeStr(i.date) || getLocalDateISO(),
    reporter: safeStr(i.reporter),
    gate: safeStr(i.gate),
  }));

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 9);

// Default personas shipped with the app — used on first load and for restore
const DEFAULT_PERSONAS: Persona[] = [
  { id: 'per-1', name: 'Sarah Jenkins', rut: '19.453.120-K', type: 'VISITANTE', unit: 'Unit 115', avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=120' },
  { id: 'per-2', name: 'James Wilson', rut: '15.823.149-6', type: 'CONTRATISTA', unit: 'Service/Cleaning', plate: 'ABC-123', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=120' },
  { id: 'per-3', name: 'Jonathan Wick', rut: '12.443.512-4', type: 'CONTRATISTA', unit: 'Security Contractor', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=120' },
  { id: 'per-4', name: 'Elena Vance', rut: '20.198.543-2', type: 'VISITANTE', unit: 'Unit 204' },
  { id: 'per-5', name: 'Clara Ocampo', rut: '16.892.110-3', type: 'CONTRATISTA', unit: 'Mantenimiento Ascensores', plate: 'GH-89-12' },
  { id: 'per-6', name: 'Mario Rossi', rut: '21.332.901-K', type: 'VISITANTE', unit: 'Depto 1102' },
];

export interface AppState {
  // Data
  logs: LogItem[];
  activeInside: ActiveCheckIn[];
  incidents: IncidentReport[];
  profile: GuardProfile;
  personas: Persona[];
  setProfile: Dispatch<SetStateAction<GuardProfile>>;
  // Actions
  handleMarkExit: (idOrRut: string, customExitTime?: string, meta?: VehicleExitOptions) => void;
  handleSaveRegister: (newEntry: Omit<LogItem, 'id' | 'time' | 'date' | 'status'>, addToPersonas?: boolean) => void;
  handleSaveIncident: (newIncident: Omit<IncidentReport, 'id' | 'time' | 'date' | 'reporter' | 'gate'>) => void;
  handleImportedPersonas: (incoming: Persona[]) => void;
  handleUpdatePersona: (updated: Persona) => void;
  handleRemovePersona: (id: string) => void;
  handleRestoreDefaults: () => void;
  handleRemoveMovement: (logId: string) => void;
  handleQuickCheckIn: (persona: Persona) => void;
  handleResetDay: () => void;
  handleExportBackup: () => void;
  handleFactoryReset: () => void;
  handleResolveIncident: (id: string) => void;
  handleCompleteHandover: (nextGuardName: string) => void;
  // --- Vehicle quick-register actions (Phase 4) ---
  isVehicleInside: (plate: string) => boolean;
  findVehicleSession: (plate: string) => ActiveCheckIn | undefined;
  normPlate: (input?: string | null) => string;
  /** ENTRADA: devuelve MATCH (`already_inside`) si la patente ya está dentro; no crea otra entrada. */
  handleVehicleEntry: (plate: string, company?: string) => VehicleEntryResult;
  /** SALIDA normal: cierra la sesión abierta. `false` si el vehículo no está dentro. */
  handleVehicleExit: (plate: string, options?: VehicleExitOptions) => boolean;
  /** SALIDA DIRECTA: registra la salida sin entrada local; no inventa hora de entrada. */
  handleVehicleDirectExit: (plate: string, options?: VehicleExitOptions) => VehicleDirectExitResult;
}

/**
 * Centraliza el estado global de SecurGuard y su lógica de negocio.
 *
 * Extraído de App.tsx para reducir el "god component": App ahora solo se
 * encarga de navegación, modales y presentación. La interfaz de props de los
 * tabs no cambia, así que este refactor es transparente para ellos.
 */
export const useAppState = (): AppState => {
  // Persistence State
  const [logs, setLogs] = useState<LogItem[]>(() => {
    const arr = readArray('securguard_logs');
    return arr ? sanitizeLogs(arr) : INITIAL_LOGS;
  });

  const [activeInside, setActiveInside] = useState<ActiveCheckIn[]>(() => {
    const arr = readArray('securguard_active_inside');
    if (arr) return sanitizeActive(arr);
    // Fallback: build initial active states from INITIAL_LOGS to keep demo complete
    return INITIAL_LOGS.filter(l => l.status === 'active').map(l => ({
      id: l.id,
      name: l.name,
      rut: l.rut,
      plate: l.plate,
      type: l.type,
      unit: l.unit,
      entryTime: l.time,
      entryDate: l.date,
      entryTimestamp: Date.now() - 3600000 * 1.5, // simulate 1.5 hours ago entry
      avatar: l.avatar,
    }));
  });

  const [incidents, setIncidents] = useState<IncidentReport[]>(() => {
    const arr = readArray('securguard_incidents');
    return arr ? sanitizeIncidents(arr) : INITIAL_INCIDENTS;
  });

  const [profile, setProfile] = useState<GuardProfile>(() => {
    const saved = localStorage.getItem('securguard_profile');
    return saved ? JSON.parse(saved) : DEFAULT_GUARD;
  });

  const [personas, setPersonas] = useState<Persona[]>(() => {
    const arr = readArray('securguard_personas');
    return arr ? sanitizePersonas(arr) : DEFAULT_PERSONAS;
  });

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('securguard_logs', JSON.stringify(logs));
  }, [logs]);

  useEffect(() => {
    localStorage.setItem('securguard_active_inside', JSON.stringify(activeInside));
  }, [activeInside]);

  useEffect(() => {
    localStorage.setItem('securguard_incidents', JSON.stringify(incidents));
  }, [incidents]);

  useEffect(() => {
    localStorage.setItem('securguard_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('securguard_personas', JSON.stringify(personas));
  }, [personas]);

  // System Core actions
  const handleMarkExit = (idOrRut: string, customExitTime?: string, meta?: VehicleExitOptions) => {
    const timestamp = customExitTime || new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });

    // Find in activeInside (RUT comparison is null-safe via normRut)
    const target = normRut(idOrRut);
    const session = activeInside.find(s => s.id === idOrRut || (target !== '' && normRut(s.rut) === target));
    if (!session) {
      console.error('[handleMarkExit] No se encontró sesión activa para el identificador:', idOrRut, '· activeInside actual:', activeInside);
      return;
    }

    // When an exit time is supplied manually, the date of the exit should follow
    // the entry's own date (the guard is correcting the same-day shift), not today.
    const datestamp = customExitTime ? (session.entryDate || getLocalDateISO()) : getLocalDateISO();

    // Resolve the real exit timestamp so duration is accurate even when a custom
    // exit time is provided (otherwise it would wrongly use Date.now()).
    let exitTs = Date.now();
    if (customExitTime && session.entryDate) {
      const parsed = new Date(`${session.entryDate}T${customExitTime}`);
      if (!Number.isNaN(parsed.getTime())) exitTs = parsed.getTime();
    }

    // Calculate stay duration safely
    const diffMs = session.entryTimestamp ? (exitTs - session.entryTimestamp) : 0;
    let durationStr = 'N/A';
    if (diffMs > 0) {
      const diffMinutes = Math.floor(diffMs / 60000);
      if (diffMinutes < 1) {
        durationStr = `${Math.floor(diffMs / 1000)}s`;
      } else {
        const hours = Math.floor(diffMinutes / 60);
        const mins = diffMinutes % 60;
        durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      }
    } else {
      durationStr = '45m'; // sensible default
    }

    // Defensive construction of independent permanent Salida log event
    // Link to original entry via entryId for session reconstruction
    const sessionName = session.name || 'Desconocido';
    const exitLog: LogItem = {
      id: `log-exit-${generateId()}`,
      name: sessionName,
      rut: session.rut || '',
      plate: session.plate,
      type: session.type || 'VISITANTE',
      unit: session.unit || 'N/A',
      action: 'Salida',
      time: timestamp,
      date: datestamp,
      status: 'exited',
      duration: durationStr,
      avatar: session.avatar || '',
      entryId: session.id, // Link to original entry for session pairing
      entryTimestamp: session.entryTimestamp, // Original entry time for reference
      // Metadatos de salida vehicular (opcionales, no afectan sesiones de personas)
      exitType: meta?.exitType,
      observation: meta?.observation,
    };

    setLogs(prev => [exitLog, ...prev]);

    // 2. Remove from activeInside
    setActiveInside(prev => prev.filter(s => s.id !== session.id));
  };

  const handleSaveRegister = (newEntry: Omit<LogItem, 'id' | 'time' | 'date' | 'status'>, addToPersonas = false) => {
    const timestamp = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const datestamp = getLocalDateISO();

    // Check if they are already inside
    const alreadyInside = activeInside.find(s => normRut(s.rut) !== '' && normRut(s.rut) === normRut(newEntry.rut));
    if (alreadyInside) {
      handleMarkExit(alreadyInside.id);
    }

    const entryId = `log-${generateId()}`;

    // 1. Create immutable Entrada log record
    const entryTimestamp = Date.now();
    const entryLog: LogItem = {
      ...newEntry,
      id: entryId,
      time: timestamp,
      date: datestamp,
      action: 'Entrada',
      status: 'active',
      entryTimestamp,
    };

    setLogs(prev => [entryLog, ...prev]);

    // 2. Add to activeInside
    const newActive: ActiveCheckIn = {
      id: entryId,
      name: newEntry.name,
      rut: newEntry.rut,
      plate: newEntry.plate,
      type: newEntry.type,
      unit: newEntry.unit,
      entryTime: timestamp,
      entryDate: datestamp,
      entryTimestamp,
      avatar: newEntry.avatar,
    };

    setActiveInside(prev => [newActive, ...prev]);

    // 3. Optionally add to personas directory (for RegisterModal, not for QuickCheckIn)
    if (addToPersonas) {
      const newPersona: Persona = {
        id: `persona-${generateId()}`,
        name: newEntry.name,
        rut: newEntry.rut,
        plate: newEntry.plate,
        type: newEntry.type,
        unit: newEntry.unit,
        avatar: newEntry.avatar,
      };
      setPersonas(prev => {
        // Avoid duplicates by RUT
        const existingIndex = prev.findIndex(p => normRut(p.rut) === normRut(newPersona.rut));
        if (existingIndex >= 0) {
          // Update existing
          const updated = [...prev];
          updated[existingIndex] = { ...updated[existingIndex], ...newPersona };
          return updated;
        }
        return [newPersona, ...prev];
      });
    }
  };

  const handleSaveIncident = (newIncident: Omit<IncidentReport, 'id' | 'time' | 'date' | 'reporter' | 'gate'>) => {
    const timestamp = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const datestamp = getLocalDateISO();
    const report: IncidentReport = {
      ...newIncident,
      id: `inc-${generateId()}`,
      time: timestamp,
      date: datestamp,
      reporter: profile.name,
      gate: profile.gate,
    };
    setIncidents(prev => [report, ...prev]);

    // Notificación del sistema si el operador habilitó radiodifusión de alertas
    if (profile.notifications && 'Notification' in window) {
      try {
        if (Notification.permission === 'granted') {
          new Notification(`SecurGuard · ${newIncident.category}`, {
            body: `${newIncident.title}\n${newIncident.description}`,
          });
        }
      } catch (_) { /* notificaciones no disponibles en este contexto */ }
    }
  };

  const handleUpdatePersona = (updated: Persona) => {
    // Only update the master persona record — do NOT touch activeInside.
    // Active sessions preserve the data as it was at entry time (immutable
    // snapshots) so entry/exit logs stay consistent.
    setPersonas(prev => prev.map(p => (p.id === updated.id ? { ...p, ...updated } : p)));
  };

  const handleRemovePersona = (id: string) => {
    setPersonas(prev => prev.filter(p => p.id !== id));
  };

  const handleImportedPersonas = (incoming: Persona[]) => {
    setPersonas(prev => {
      const map = new Map<string, Persona>();
      prev.forEach(p => {
        if (p.rut) map.set(p.rut.trim().toUpperCase(), p);
      });
      incoming.forEach(p => {
        if (p.rut) map.set(p.rut.trim().toUpperCase(), p);
      });
      return Array.from(map.values());
    });
  };

  const handleQuickCheckIn = (persona: Persona) => {
    const timestamp = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const datestamp = getLocalDateISO();

    // Check if they are already inside
    const alreadyInside = activeInside.find(s => normRut(s.rut) !== '' && normRut(s.rut) === normRut(persona.rut));
    if (alreadyInside) {
      handleMarkExit(alreadyInside.id);
    }

    const entryId = `log-${generateId()}`;
    const entryTimestamp = Date.now();

    // 1. Create immutable Entrada log record
    const entryLog: LogItem = {
      id: entryId,
      name: persona.name,
      rut: persona.rut,
      plate: persona.plate,
      type: persona.type,
      action: 'Entrada',
      time: timestamp,
      date: datestamp,
      unit: persona.unit,
      avatar: persona.avatar || '',
      status: 'active',
      entryTimestamp,
    };

    setLogs(prev => [entryLog, ...prev]);

    // 2. Add to activeInside
    const newActive: ActiveCheckIn = {
      id: entryId,
      name: persona.name,
      rut: persona.rut,
      plate: persona.plate,
      type: persona.type,
      unit: persona.unit,
      entryTime: timestamp,
      entryDate: datestamp,
      entryTimestamp,
      avatar: persona.avatar || '',
    };

    setActiveInside(prev => [newActive, ...prev]);

    // Give visual haptic confirmation: play audio synthesize in console if sound alerts enabled
    if (profile.soundAlerts && 'speechSynthesis' in window) {
      try {
        const sentence = `Entrada registrada para ${persona.name}`;
        const utterance = new SpeechSynthesisUtterance(sentence);
        utterance.lang = 'es-ES';
        utterance.rate = 1.1;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        // ignore speech synth sandbox roadblocks
      }
    }
  };

  const handleResetDay = () => {
    setLogs([]);
    setIncidents([]);
    setActiveInside([]);
    // Do NOT clear setPersonas()! This preserves master base
    localStorage.removeItem('securguard_logs');
    localStorage.removeItem('securguard_incidents');
    localStorage.removeItem('securguard_active_inside');
  };

  /**
   * Elimina un movimiento individual (UI: Tab 1, "Actividad & Historial").
   * La regla de qué borrar vive en el dominio (`resolveMovementDeletion`):
   * - Salida → solo esa Salida (la Entrada queda como historial).
   * - Entrada → sesión completa (Entrada + Salidas asociadas por entryId) y,
   *   si sigue activa, también se quita de activeInside.
   * NO modifica personas[].
   */
  const handleRemoveMovement = (id: string) => {
    const plan = resolveMovementDeletion(logs, activeInside, id);
    if (plan.removeLogIds.length === 0) return;

    const removeLogSet = new Set(plan.removeLogIds);
    const removeActiveSet = new Set(plan.removeActiveIds);

    setLogs(prev => prev.filter(l => !removeLogSet.has(l.id)));
    if (removeActiveSet.size > 0) {
      setActiveInside(prev => prev.filter(a => !removeActiveSet.has(a.id)));
    }
  };

  const handleExportBackup = () => {
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      profile,
      logs,
      activeInside,
      incidents,
      personas,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SecurGuard-Respaldo-${getLocalDateISO()}.json`;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  // Factory reset: wipe EVERYTHING, incl. the persona master base
  const handleFactoryReset = () => {
    setLogs([]);
    setIncidents([]);
    setPersonas([]);
    setActiveInside([]);
    localStorage.removeItem('securguard_logs');
    localStorage.removeItem('securguard_incidents');
    localStorage.removeItem('securguard_personas');
    localStorage.removeItem('securguard_active_inside');
  };

  const handleRestoreDefaults = () => {
    setPersonas(DEFAULT_PERSONAS);
  };

  const handleResolveIncident = (id: string) => {
    setIncidents(prev => prev.filter(inc => inc.id !== id));
  };

  const handleCompleteHandover = (nextGuardName: string) => {
    setProfile(prev => ({
      ...prev,
      name: nextGuardName,
    }));

    // Register shift change log
    const timestamp = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const handoverLog: LogItem = {
      id: `handover-${generateId()}`,
      name: `🔄 Cambio Guardia: ${nextGuardName}`,
      rut: 'CONSOLA',
      type: 'CONTRATISTA',
      action: 'Entrada',
      time: timestamp,
      date: getLocalDateISO(),
      unit: 'Entrega Turno Bitácora',
      status: 'exited',
    };
    setLogs(prev => [handoverLog, ...prev]);
  };

  // --- Vehicle quick-register actions (Phase 4) ---
  //
  // Los vehículos se identifican por patente canónica, no por RUT. Reutilizan
  // la misma infraestructura de persistencia (logs + activeInside + localStorage
  // sincronizado) pero con lógica de emparejamiento por patente.
  //
  // Reglas de sesión vehicular (única fuente de verdad = `activeInside`):
  //   - ENTRADA con sesión abierta  → BLOQUEADA (MATCH con la sesión existente).
  //   - ENTRADA sin sesión abierta  → nueva sesión abierta.
  //   - ENTRADA tras SALIDA         → permitida (sesiones históricas distintas).
  //   - SALIDA con sesión abierta   → cierra esa sesión (salida normal).
  //   - SALIDA sin sesión abierta   → SALIDA DIRECTA (no inventa entrada local).
  //   - SALIDA DIRECTA tras ENTRADA → bloqueada (corresponde SALIDA normal).

  /** Normaliza RUT y patente para comparaciones seguras. */
  const normPlate = (v?: string | null): string => normalizePlate(v);

  /**
   * Busca una sesión activa de vehículo por patente (comparación canónica).
   * Un vehículo rápido NO tiene RUT asociado (rut === ''), por lo que el
   * emparejamiento se hace exclusivamente por la patente canónica.
   */
  const findVehicleSession = (plateInput: string): ActiveCheckIn | undefined => {
    const target = normPlate(plateInput);
    if (target === '') return undefined;
    return activeInside.find(
      s => s.rut === '' && normPlate(s.plate) === target
    );
  };

  /** ¿Está actualmente dentro un vehículo con esta patente? */
  const isVehicleInside = (plateInput: string): boolean => {
    return !!findVehicleSession(plateInput);
  };

    /**
   * Registro rápido de ENTRADA de vehículo por patente.
   *
   * Semántica de duplicados (corregida): si la patente YA tiene una sesión
   * abierta, la entrada se BLOQUEA y se devuelve un MATCH con esa sesión
   * (`{ ok: false, reason: 'already_inside', session }`). No se escribe nada en
   * `logs` ni en `activeInside`: nunca puede quedar más de una sesión abierta
   * por patente y no se genera un cierre de sesión fantasma.
   *
   * Una misma patente SÍ puede volver a entrar después de haber salido:
   * Entrada → Salida → Entrada produce dos sesiones históricas distintas.
   *
   * El `company` (empresa) es opcional. Se almacena en el campo `name` del
   * LogItem/ActiveCheckIn, de modo que la misma infraestructura de display
   * (que ya muestra `name`) funcione sin cambios en componentes existentes.
   * Si no se provee empresa, se usa 'Vehículo' como nombre genérico.
   *
   * Reutiliza los efectos de localStorage de useAppState: al modificar
   * `logs` y `activeInside` se persiste automáticamente.
   */
  const handleVehicleEntry = (plateInput: string, company?: string): VehicleEntryResult => {
    const plate = normPlate(plateInput);
    if (!isValidPlate(plate)) {
      console.error('[handleVehicleEntry] Patente inválida:', plateInput);
      return { ok: false, reason: 'invalid_plate' };
    }

    // MATCH: la patente ya tiene una sesión ABIERTA → bloquear la nueva entrada.
    // La detección se hace contra la sesión abierta (activeInside), no contra
    // el histórico de logs, para no confundir sesiones ya cerradas.
    const existing = findVehicleSession(plate);
    if (existing) {
      console.warn('[handleVehicleEntry] Vehículo ya está dentro (entrada bloqueada):', plate);
      return { ok: false, reason: 'already_inside', session: existing };
    }

    const timestamp = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const datestamp = getLocalDateISO();
    const entryId = `log-${generateId()}`;
    const entryTimestamp = Date.now();
    const companyName = company && company.trim() ? company.trim() : 'Vehículo';

    const entryLog: LogItem = {
      id: entryId,
      name: companyName,
      rut: '',
      plate,
      type: 'VEHICULO',
      action: 'Entrada',
      time: timestamp,
      date: datestamp,
      unit: company ? `Empresa: ${companyName}` : 'Ingreso por patente',
      avatar: '',
      status: 'active',
      entryTimestamp,
    };

    setLogs(prev => [entryLog, ...prev]);

    const newActive: ActiveCheckIn = {
      id: entryId,
      name: companyName,
      rut: '',
      plate,
      type: 'VEHICULO',
      unit: entryLog.unit,
      entryTime: timestamp,
      entryDate: datestamp,
      entryTimestamp,
      avatar: '',
    };
    setActiveInside(prev => [newActive, ...prev]);

    // Confirmación auditiva si el guardia habilitó alertas de sonido
    if (profile.soundAlerts && 'speechSynthesis' in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(`Entrada ${plate}`);
        utterance.lang = 'es-CL';
        utterance.rate = 1.2;
        window.speechSynthesis.speak(utterance);
      } catch (_) { /* sandbox: ignorado */ }
    }

    return { ok: true, log: entryLog };
  };

  /**
   * Registro rápido de SALIDA NORMAL de vehículo por patente.
   * Busca la sesión abierta por patente canónica y la cierra.
   * Devuelve `true` si se procesó la salida, `false` si el vehículo
   * no estaba dentro (caso: SALIDA sin ENTRADA previa → usar SALIDA DIRECTA).
   *
   * `options.observation` / `options.exitType` se adjuntan a la Salida
   * (observación operacional opcional; nunca bloquea la salida).
   */
  const handleVehicleExit = (plateInput: string, options?: VehicleExitOptions): boolean => {
    const plate = normPlate(plateInput);
    if (!isValidPlate(plate)) {
      console.error('[handleVehicleExit] Patente inválida:', plateInput);
      return false;
    }
    const session = findVehicleSession(plate);
    if (!session) {
      console.warn('[handleVehicleExit] Vehículo no está dentro (usar SALIDA DIRECTA):', plate);
      return false;
    }
    handleMarkExit(session.id, undefined, {
      exitType: options?.exitType,
      observation: options?.observation,
    });
    return true;
  };

  /**
   * SALIDA DIRECTA: registra una salida SIN entrada correspondiente en esta
   * portería (vehículo estacionado desde el turno anterior, entró por otra
   * portería, o la entrada nunca se registró).
   *
   * Garantías:
   *   - NO crea ninguna Entrada (ni log ni sesión activa).
   *   - NO inventa hora de entrada: la Salida queda sin `entryId` y sin
   *     `entryTimestamp`, marcada con `directExit: true` (trazabilidad).
   *   - NO toca `activeInside`.
   *   - Si la patente SÍ tiene sesión abierta devuelve `already_inside` sin
   *     escribir nada: en ese caso corresponde una SALIDA normal.
   */
  const handleVehicleDirectExit = (
    plateInput: string,
    options?: VehicleExitOptions
  ): VehicleDirectExitResult => {
    const plate = normPlate(plateInput);
    if (!isValidPlate(plate)) {
      console.error('[handleVehicleDirectExit] Patente inválida:', plateInput);
      return { ok: false, reason: 'invalid_plate' };
    }

    if (findVehicleSession(plate)) {
      console.warn('[handleVehicleDirectExit] Vehículo está dentro: corresponde SALIDA normal:', plate);
      return { ok: false, reason: 'already_inside' };
    }

    const timestamp = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    const datestamp = getLocalDateISO();
    const company = options?.company?.trim();
    const companyName = company ? company : 'Vehículo';

    const exitLog: LogItem = {
      id: `log-exit-${generateId()}`,
      name: companyName,
      rut: '',
      plate,
      type: 'VEHICULO',
      unit: company ? `Empresa: ${companyName}` : 'Salida sin entrada local',
      action: 'Salida',
      time: timestamp,
      date: datestamp,
      status: 'exited',
      avatar: '',
      // Sin entryId / entryTimestamp a propósito: no existe entrada local.
      directExit: true,
      exitType: options?.exitType,
      observation: options?.observation,
    };

    setLogs(prev => [exitLog, ...prev]);
    // activeInside NO se toca: el vehículo nunca estuvo dentro en esta portería.

    return { ok: true, log: exitLog };
  };

  return {
    logs,
    activeInside,
    incidents,
    profile,
    personas,
    setProfile,
    handleMarkExit,
    handleSaveRegister,
    handleSaveIncident,
    handleImportedPersonas,
    handleUpdatePersona,
    handleRemovePersona,
    handleRemoveMovement,
    handleRestoreDefaults,
    handleQuickCheckIn,
    handleResetDay,
    handleExportBackup,
    handleFactoryReset,
    handleResolveIncident,
    handleCompleteHandover,
    normPlate,
    isVehicleInside,
    findVehicleSession,
    handleVehicleEntry,
    handleVehicleExit,
    handleVehicleDirectExit,
  };
};
