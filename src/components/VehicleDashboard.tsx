/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * VehicleDashboard — pantalla ÚNICA de CONTROL DE ACCESO vehicular.
 *
 * Esta variante es exclusivamente vehicular: no hay personas, ni choferes,
 * ni RUT de persona, ni fotografía, ni navegación dedicada a Personas.
 *
 * Estructura (las tres secciones viven dentro de Control de Acceso):
 *   1. QuickVehicleRegister — PATENTE → EMPRESA → estado de autorización →
 *      ENTRADA / SALIDA / SALIDA DIRECTA + tipo de salida + observación.
 *   2. Vehículos Dentro — sólo los vehículos actualmente dentro.
 *   3. Últimos Movimientos — lista CORTA y acotada (no una bitácora infinita).
 *
 * El historial COMPLETO sigue disponible para la lógica de reportes/exportación
 * (utils/vehicleReport.ts, botón CSV), pero no domina la UI.
 *
 * El catálogo de vehículos autorizados (`catalog`) sólo INFORMA
 * AUTORIZADO / NO REGISTRADO: nunca bloquea un movimiento.
 *
 * Reutiliza:
 *   - useAppState (logs, activeInside, persistencia, exportación)
 *   - domain/plate.ts (normalización y validación)
 *   - domain/vehicleCatalog.ts (consulta del catálogo)
 *   - utils/vehicleReport.ts (exportación CSV)
 */

import React, { useMemo } from 'react';
import { ActiveCheckIn, LogItem, VehicleEntryResult, VehicleDirectExitResult, VehicleExitOptions } from '../types';
import { QuickVehicleRegister, VehicleToastType } from './QuickVehicleRegister';
import { Car, Download, History, Settings, LogOut, Clock, ShieldCheck, ShieldAlert } from 'lucide-react';
import { formatPlateForDisplay } from '../domain/plate';
import { AuthorizedVehicle, resolveAuthorization } from '../domain/vehicleCatalog';
import { buildVehicleReportCSV, downloadVehicleReportCSV } from '../utils/vehicleReport';
import { getLocalDateISO } from '../utils/datetime';
import { GuardProfile, IncidentReport } from '../types';

export interface VehicleDashboardProps {
  // State
  logs: LogItem[];
  activeInside: ActiveCheckIn[];
  /** Catálogo de vehículos autorizados (PATENTE → EMPRESA → AUTORIZADO). */
  catalog: AuthorizedVehicle[];
  profile: GuardProfile;
  incidents: IncidentReport[];
  // Vehicle handlers
  isVehicleInside: (plate: string) => boolean;
  onVehicleEntry: (plate: string, company?: string) => VehicleEntryResult;
  onVehicleExit: (plate: string, options?: VehicleExitOptions) => boolean;
  onVehicleDirectExit: (plate: string, options?: VehicleExitOptions) => VehicleDirectExitResult;
  // Movements
  onRemoveMovement: (id: string) => void;
  onResetDay?: () => void;
  onDeleteAll?: () => void;
  onExportBackup?: () => void;
  clock: string;
  onShowToast: (toast: { message: string; type: VehicleToastType }) => void;
  onOpenSettings?: () => void;
}

export function VehicleDashboard({
  logs,
  activeInside,
  catalog,
  profile,
  incidents,
  isVehicleInside,
  onVehicleEntry,
  onVehicleExit,
  onVehicleDirectExit,
  onRemoveMovement,
  onResetDay,
  onDeleteAll,
  onExportBackup,
  clock,
  onShowToast,
  onOpenSettings,
}: VehicleDashboardProps) {
  // Últimos movimientos: lista CORTA y acotada. No es una bitácora infinita;
  // el historial completo sigue disponible para el CSV de reportes.
  const RECENT_MOVEMENTS_LIMIT = 8;

  // Filtrar vehículos activos (rut === '', type VEHICULO)
  const vehiclesInside = useMemo(() => {
    return activeInside.filter(s => s.rut === '' && s.type === 'VEHICULO');
  }, [activeInside]);

  // Últimos movimientos vehiculares (nuevo → viejo)
  const recentVehicleMovements = useMemo(() => {
    return logs
      .filter(l => l.plate && l.plate !== '' && l.type === 'VEHICULO')
      .slice(0, RECENT_MOVEMENTS_LIMIT);
  }, [logs]);

  const handleExportCSV = () => {
    try {
      const csvContent = buildVehicleReportCSV({ logs, activeInside, profile });
      downloadVehicleReportCSV(csvContent, 'SecurGuard-Vehiculos-' + getLocalDateISO() + '.csv');
    } catch (e) {
      onShowToast({ message: 'Error exportando CSV.', type: 'alert' });
    }
  };

  const formatDuration = (entryTimestamp?: number): string => {
    if (!entryTimestamp) return '';
    const diffMs = Date.now() - entryTimestamp;
    if (diffMs <= 0) return 'Reciente';
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return '< 1m';
    const h = Math.floor(diffMinutes / 60);
    const m = diffMinutes % 60;
    return h > 0 ? h + 'h ' + m + 'm' : m + 'm';
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Quick Register — el foco principal de la pantalla */ }
      <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl">
        <QuickVehicleRegister
          activeInside={activeInside}
          logs={logs}
          catalog={catalog}
          isVehicleInside={isVehicleInside}
          onVehicleEntry={onVehicleEntry}
          onVehicleExit={onVehicleExit}
          onVehicleDirectExit={onVehicleDirectExit}
          onShowToast={onShowToast}
        />
      </div>

      {/* Vehículos actualmente DENTRO */ }
      <section className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <Car className="w-4 h-4 text-indigo-400" />
            Vehículos Dentro
          </h3>
          <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
            {vehiclesInside.length}
          </span>
        </div>

        {vehiclesInside.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-medium py-3 text-center">
            Ningún vehículo dentro en este momento.
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {vehiclesInside.map(v => (
              <div
                key={v.id}
                className="flex items-center justify-between p-3 bg-[#020617] rounded-2xl border border-slate-800/40"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                    <Car className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-white">
                        {formatPlateForDisplay(v.plate || '')}
                      </span>
                      {resolveAuthorization(catalog, v.plate).registered ? (
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" aria-label="AUTORIZADO" />
                      ) : (
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" aria-label="NO REGISTRADO" />
                      )}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[160px]">
                      {v.name !== 'Vehículo' ? v.name : '—'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-mono text-slate-400">
                      {v.entryTime}
                    </span>
                    <span className="text-[9px] text-emerald-400 font-bold">
                      {formatDuration(v.entryTimestamp)}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const ok = onVehicleExit(v.plate || '');
                      if (ok) {
                        const timeStr = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
                        onShowToast({
                          message: 'Salida ' + formatPlateForDisplay(v.plate || '') + ' · ' + timeStr,
                          type: 'success',
                        });
                      } else {
                        onShowToast({ message: 'No se pudo registrar la salida.', type: 'alert' });
                      }
                    }}
                    className="ml-2 p-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 active:scale-95 transition-all flex-shrink-0"
                    title="Dar salida a este vehículo"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Últimos movimientos */ }
      <section className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            Últimos Movimientos
          </h3>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1 bg-[#020617] hover:bg-slate-900 border border-slate-800 hover:border-slate-700 px-2.5 py-0.5 rounded-full text-[9px] font-extrabold text-[#818cf8] hover:text-white transition-colors"
            title="Exportar bitácora en CSV"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
        </div>

        {recentVehicleMovements.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-medium py-3 text-center">
            No hay movimientos registrados aún.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {recentVehicleMovements.map(log => (
              <div
                key={log.id}
                className="flex items-center justify-between p-2.5 bg-[#020617] rounded-xl border border-slate-800/30"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-1.5 h-4 rounded-full ${log.action === 'Entrada' ? 'bg-emerald-400' : 'bg-rose-400'}`}></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs font-bold text-white">
                        {formatPlateForDisplay(log.plate || '')}
                      </span>
                      {resolveAuthorization(catalog, log.plate).registered ? (
                        <ShieldCheck className="w-3 h-3 text-emerald-400 flex-shrink-0" aria-label="AUTORIZADO" />
                      ) : (
                        <ShieldAlert className="w-3 h-3 text-amber-400 flex-shrink-0" aria-label="NO REGISTRADO" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[8px] text-slate-500">
                      {log.directExit ? (
                        <span className="text-rose-300 font-bold uppercase">Salida directa</span>
                      ) : (
                        <span className={log.action === 'Entrada' ? 'text-emerald-400' : 'text-rose-400'}>
                          {log.action}
                        </span>
                      )}
                      <span>{log.time}</span>
                      {log.name !== 'Vehículo' && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[100px]">{log.name}</span>
                        </>
                      )}
                      {log.action === 'Salida' && log.exitType && (
                        <>
                          <span>·</span>
                          <span className="truncate max-w-[110px] text-slate-400">{log.exitType}</span>
                        </>
                      )}
                    </div>
                    {log.observation && (
                      <p className="text-[8px] text-amber-300/80 truncate max-w-[200px] mt-0.5" title={log.observation}>
                        Obs: {log.observation}
                      </p>
                    )}
                  </div>
                </div>
                {/* Eliminar movimiento oculto: solo en menú secundario (evita confusión con SALIDA) */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('¿Eliminar el movimiento ' + formatPlateForDisplay(log.plate || '') + '?')) {
                      onRemoveMovement(log.id);
                    }
                  }}
                  className="p-1 rounded hover:bg-slate-800/30 text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0 opacity-30 hover:opacity-100"
                  title="Eliminar movimiento (acción secundaria)"
                >
                  <span className="text-[9px] font-bold">…</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Footer: acceso a configuración (sin conceptos de Personas) */}
      <div className="flex items-center justify-center gap-4 pt-2 pb-safe">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold transition-all"
          title="Configuración"
        >
          <Settings className="w-4 h-4" />
          Config
        </button>
      </div>

      {/* Reloj y estado del guardia en footer */ }
      <div className="flex items-center justify-center gap-2 pt-1">
        <Clock className="w-3 h-3 text-slate-500" />
        <span className="text-[10px] font-mono text-slate-500">{clock || '--:--'}</span>
        <span className="text-[10px] text-slate-500">•</span>
        <span className="text-[10px] text-slate-500">{profile.name || 'Guardia'} · {profile.gate || 'Obra Norte'}</span>
      </div>
    </div>
  );
}
