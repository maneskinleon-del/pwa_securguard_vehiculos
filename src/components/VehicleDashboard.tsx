/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * VehicleDashboard
 *
 * Pantalla principal para el control de acceso vehicular en una obra.
 * Reemplaza al ControlTab de la PWA maestra como la vista principal cuando el
 * enfoque es 100% vehicular.
 *
 * Prioriza la experiencia de registro rápido:
 *   1. QuickVehicleRegister (patente + empresa → ENTRADA/SALIDA)
 *   2. Vehículos actualmente DENTRO (lista compacta con hora de entrada)
 *   3. Últimos movimientos (histórico compacto)
 *
 * Reutiliza:
 *   - useAppState (logs, activeInside, persistencia, exportación)
 *   - domain/plate.ts (normalización y validación)
 *   - utils/report.ts (exportación CSV)
 *
 * Las funciones de gestión de personas se mantienen accesibles pero dejan de
 * ser el foco de la pantalla.
 */

import React, { useMemo, useState } from 'react';
import { ActiveCheckIn, LogItem, AccessType, VehicleEntryResult, VehicleDirectExitResult, VehicleExitOptions } from '../types';
import { QuickVehicleRegister, VehicleToastType } from './QuickVehicleRegister';
import { Car, Download, History, Users, Settings, LogOut, Clock, Building2 } from 'lucide-react';
import { normalizePlate, formatPlateForDisplay } from '../domain/plate';
import { buildVehicleReportCSV, downloadVehicleReportCSV } from '../utils/vehicleReport';
import { getLocalDateISO } from '../utils/datetime';
import { GuardProfile, IncidentReport, Persona } from '../types';

export interface VehicleDashboardProps {
  // State
  logs: LogItem[];
  activeInside: ActiveCheckIn[];
  personas: Persona[];
  profile: GuardProfile;
  incidents: IncidentReport[];
  // Vehicle handlers
  isVehicleInside: (plate: string) => boolean;
  onVehicleEntry: (plate: string, company?: string) => VehicleEntryResult;
  onVehicleExit: (plate: string, options?: VehicleExitOptions) => boolean;
  onVehicleDirectExit: (plate: string, options?: VehicleExitOptions) => VehicleDirectExitResult;
  // Reused from master
  onMarkExit: (id: string) => void;
  onRemoveMovement: (id: string) => void;
  onOpenRegister: (preset?: AccessType) => void;
  onResetDay?: () => void;
  onDeleteAll?: () => void;
  onExportBackup?: () => void;
  clock: string;
  onShowToast: (toast: { message: string; type: VehicleToastType }) => void;
  onOpenPersonas?: () => void;
  onOpenSettings?: () => void;
}

export function VehicleDashboard({
  logs,
  activeInside,
  personas,
  profile,
  incidents,
  isVehicleInside,
  onVehicleEntry,
  onVehicleExit,
  onVehicleDirectExit,
  onMarkExit,
  onRemoveMovement,
  onOpenRegister,
  onResetDay,
  onDeleteAll,
  onExportBackup,
  clock,
  onShowToast,
  onOpenPersonas,
  onOpenSettings,
}: VehicleDashboardProps) {
  const [movementLimit] = useState(15);

  // Filtrar vehículos activos (rut === '', type VEHICULO)
  const vehiclesInside = useMemo(() => {
    return activeInside.filter(s => s.rut === '' && s.type === 'VEHICULO');
  }, [activeInside]);

  // Últimos movimientos vehiculares (nuevo → viejo)
  const recentVehicleMovements = useMemo(() => {
    return logs
      .filter(l => l.plate && l.plate !== '' && l.type === 'VEHICULO')
      .slice(0, movementLimit);
  }, [logs, movementLimit]);

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
                    <div className="font-mono text-sm font-bold text-white">
                      {formatPlateForDisplay(v.plate || '')}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[160px]">
                      {v.name !== 'Vehículo' ? v.name : '— Sin empresa'}
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
                    <span className="font-mono text-xs font-bold text-white">
                      {formatPlateForDisplay(log.plate || '')}
                    </span>
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

      {/* Footer: navegación secundaria a funciones maestras */ }
      <div className="flex items-center justify-center gap-4 pt-2 pb-safe">
        <button
          onClick={onOpenPersonas}
          className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold transition-all"
          title="Gestión de personas"
        >
          <Users className="w-4 h-4" />
          Personas
        </button>
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
