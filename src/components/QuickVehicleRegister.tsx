/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * QuickVehicleRegister
 *
 * UI de alta velocidad para registrar entradas/salidas de vehículos en una
 * obra. Identificado por patente (canónica) y empresa opcional. Diseñado para
 * uso móvil por un guardia que necesita registrar muchas patentes
 * consecutivamente.
 *
 * Flujo ideal:
 *   1. Escribe PATENTE (auto-uppercase, auto-normalización)
 *   2. Opcionalmente escribe EMPRESA
 *   3. Toca ENTRADA o SALIDA
 *   4. El formulario se limpia y vuelve a enfocarse en PATENTE
 *
 * Reutiliza la infraestructura de useAppState (logs, activeInside, persistencia)
 * y el dominio de patentes (src/domain/plate.ts).
 */

import React, { useState, useRef, useEffect } from 'react';
import { Car, LogIn, LogOut, CheckCircle2, AlertCircle, Trash2, Building, AlertTriangle } from 'lucide-react';
import {
  ActiveCheckIn,
  LogItem,
  VehicleEntryResult,
  VehicleDirectExitResult,
  VehicleExitOptions,
  VehicleExitType,
  VEHICLE_EXIT_TYPES,
} from '../types';
import { normalizePlate, isValidPlate, formatPlateForDisplay } from '../domain/plate';
import {
  AuthorizedVehicle,
  resolveAuthorization,
  suggestCompanyFromCatalog,
} from '../domain/vehicleCatalog';

export type VehicleToastType = 'success' | 'alert' | 'info';

export interface QuickVehicleRegisterProps {
  activeInside: ActiveCheckIn[];
  logs: LogItem[];
  /** Catálogo de vehículos autorizados (PATENTE → EMPRESA). */
  catalog: AuthorizedVehicle[];
  isVehicleInside: (plate: string) => boolean;
  onVehicleEntry: (plate: string, company?: string) => VehicleEntryResult;
  onVehicleExit: (plate: string, options?: VehicleExitOptions) => boolean;
  onVehicleDirectExit: (plate: string, options?: VehicleExitOptions) => VehicleDirectExitResult;
  onShowToast: (toast: { message: string; type: VehicleToastType }) => void;
}

export function QuickVehicleRegister({
  activeInside,
  logs,
  catalog,
  isVehicleInside,
  onVehicleEntry,
  onVehicleExit,
  onVehicleDirectExit,
  onShowToast,
}: QuickVehicleRegisterProps) {
  const [plateInput, setPlateInput] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [exitType, setExitType] = useState<VehicleExitType | ''>('');
  const [observation, setObservation] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const plateRef = useRef<HTMLInputElement>(null);
  const companyRef = useRef<HTMLInputElement>(null);

  // Auto-focus en PATENTE al montar
  useEffect(() => {
    plateRef.current?.focus();
  }, []);

  // Normaliza la patente en tiempo real
  const handlePlateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlateInput(e.target.value.toUpperCase());
  };

  // Sugerir empresa si ya existe historial para esta patente
  const suggestCompany = (plate: string): string => {
    const canonical = normalizePlate(plate);
    if (canonical === '') return '';
    const match = logs.find(l => normalizePlate(l.plate) === canonical && l.name && l.name !== 'Vehículo');
    return match ? match.name : '';
  };

  // Cuando la patente cambia, autocompletar la empresa.
  //
  // Prioridad: CATÁLOGO (fuente de verdad) → historial de movimientos.
  // Si la patente está registrada, la empresa aparece automáticamente para
  // que el guardia no tenga que escribirla. Si NO está registrada, se mantiene
  // el valor operativo que ya permite escribir el usuario (no se rompe nada).
  const handlePlateBlur = () => {
    const normalized = normalizePlate(plateInput);
    if (normalized && !companyInput) {
      const fromCatalog = suggestCompanyFromCatalog(catalog, normalized);
      if (fromCatalog) {
        setCompanyInput(fromCatalog);
        return;
      }
      const suggestion = suggestCompany(normalized);
      if (suggestion) setCompanyInput(suggestion);
    }
  };

  // Enfocar y limpiar para el registro consecutivo
  const resetField = () => {
    setPlateInput('');
    setCompanyInput('');
    setExitType('');
    setObservation('');
    setTimeout(() => plateRef.current?.focus(), 50);
  };

  const canonicalInput = normalizePlate(plateInput);
  const inputValid = isValidPlate(canonicalInput);
  const currentPlate = inputValid ? canonicalInput : '';
  const inside = currentPlate ? isVehicleInside(currentPlate) : false;

  // Estado de autorización de la patente tipeada frente al catálogo.
  // Sólo es INFORMATIVO: NO REGISTRADO nunca bloquea el movimiento.
  const authorization = resolveAuthorization(catalog, canonicalInput);

  // Último movimiento de una patente en el historial (logs: nuevo→viejo)
  const getLastMovement = (plate: string): LogItem | null => {
    const canonical = normalizePlate(plate);
    if (canonical === '') return null;
    return logs.find(l => normalizePlate(l.plate) === canonical) || null;
  };

  const lastMovement = currentPlate ? getLastMovement(currentPlate) : null;
  const activeSession = currentPlate && inside
    ? activeInside.find(s => s.rut === '' && normalizePlate(s.plate) === currentPlate)
    : undefined;

  const handleEntry = () => {
    const canonical = normalizePlate(plateInput);
    if (!isValidPlate(canonical)) {
      onShowToast({ message: 'Patente inválida. Usa formato chileno (ej. ABCD12, ABC123, AB1234).', type: 'alert' });
      return;
    }
    const company = companyInput.trim() || undefined;

    setIsValidating(true);
    const result = onVehicleEntry(canonical, company);
    setIsValidating(false);

    if (result.ok === true) {
      const companyStr = company ? ' · ' + company : '';
      onShowToast({
        message: 'Entrada ' + formatPlateForDisplay(canonical) + companyStr + ' · ' + result.log.time,
        type: 'success',
      });
      resetField();
      return;
    }

    // MATCH: ya hay una sesión abierta → NO se creó otra entrada.
    // Se conserva el campo para que el guardia vea la sesión y pueda dar SALIDA.
    if (result.ok === false && result.reason === 'already_inside') {
      onShowToast({
        message: '⚠️ VEHÍCULO YA ESTÁ DENTRO · ' + formatPlateForDisplay(canonical) + ' · entrada ' + result.session.entryTime,
        type: 'alert',
      });
      return;
    }

    onShowToast({ message: 'No se pudo registrar la entrada.', type: 'alert' });
  };

  /** Opciones de salida comunes a SALIDA normal y SALIDA DIRECTA. */
  const buildExitOptions = (): VehicleExitOptions => ({
    company: companyInput.trim() || undefined,
    exitType: exitType || undefined,
    observation: observation.trim() || undefined,
  });

  const handleExit = () => {
    const canonical = normalizePlate(plateInput);
    if (!isValidPlate(canonical)) {
      onShowToast({ message: 'Patente inválida. Usa formato chileno (ej. ABCD12).', type: 'alert' });
      return;
    }
    if (!isVehicleInside(canonical)) {
      onShowToast({ message: formatPlateForDisplay(canonical) + ' no está dentro. Usa SALIDA DIRECTA.', type: 'alert' });
      return;
    }

    setIsValidating(true);
    const ok = onVehicleExit(canonical, buildExitOptions());
    setIsValidating(false);

    if (ok) {
      const timeStr = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
      onShowToast({ message: 'Salida ' + formatPlateForDisplay(canonical) + ' · ' + timeStr, type: 'success' });
      resetField();
    } else {
      onShowToast({ message: 'No se pudo registrar la salida.', type: 'alert' });
    }
  };

  /**
   * SALIDA DIRECTA: salida sin entrada local en esta portería.
   * No inventa hora de entrada; queda marcada como directa.
   */
  const handleDirectExit = () => {
    const canonical = normalizePlate(plateInput);
    if (!isValidPlate(canonical)) {
      onShowToast({ message: 'Patente inválida. Usa formato chileno (ej. ABCD12).', type: 'alert' });
      return;
    }
    if (isVehicleInside(canonical)) {
      onShowToast({ message: formatPlateForDisplay(canonical) + ' está dentro. Usa SALIDA.', type: 'alert' });
      return;
    }

    setIsValidating(true);
    const result = onVehicleDirectExit(canonical, buildExitOptions());
    setIsValidating(false);

    if (result.ok === true) {
      onShowToast({
        message: 'Salida directa ' + formatPlateForDisplay(canonical) + ' · ' + result.log.time,
        type: 'success',
      });
      resetField();
      return;
    }
    if (result.ok === false && result.reason === 'already_inside') {
      onShowToast({ message: formatPlateForDisplay(canonical) + ' está dentro. Usa SALIDA.', type: 'alert' });
      return;
    }
    onShowToast({ message: 'No se pudo registrar la salida directa.', type: 'alert' });
  };

  const clearPlate = () => {
    setPlateInput('');
    setCompanyInput('');
    plateRef.current?.focus();
  };

  return (
    <section className="space-y-4">
      {/* Header */ }
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex-shrink-0">
          <Car className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Control de Acceso Vehicular</h2>
          <p className="text-[10px] text-slate-500 font-medium">Patente → Empresa → Entrada / Salida</p>
        </div>
      </div>

      {/* PATENTE input (primary) */ }
      <div className="relative">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">
          PATENTE
        </label>
        <input
          ref={plateRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={8}
          value={plateInput}
          onChange={handlePlateChange}
          onBlur={handlePlateBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (plateInput.trim()) {
                if (companyInput) companyRef.current?.focus();
                else handleEntry();
              }
            }
          }}
          placeholder="ABCD12"
          className={`w-full bg-[#020617] border rounded-2xl px-4 py-3.5 text-lg font-mono font-bold text-white text-center placeholder:text-slate-600/40 transition-all focus:outline-none focus:ring-2 ${
            plateInput.trim() === ''
              ? 'border-slate-700 focus:border-slate-600 focus:ring-slate-600/30'
              : inputValid
              ? 'border-emerald-500/40 focus:border-emerald-400 focus:ring-emerald-400/30'
              : 'border-rose-500/40 focus:border-rose-400 focus:ring-rose-400/30'
          }`}
        />
        {plateInput.trim() !== '' && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center gap-1 top-[26px]">
            {inputValid ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400" />
            )}
            <button
              type="button"
              onClick={clearPlate}
              className="p-0.5 rounded hover:bg-slate-700/40 text-slate-500 hover:text-slate-300 transition-colors"
              title="Limpiar"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* ESTADO DE AUTORIZACIÓN (informativo; NO REGISTRADO no bloquea) */}
      {inputValid && (
        <div
          data-testid="vehicle-auth-status"
          className={`flex items-center justify-between gap-3 p-3 rounded-2xl border font-mono transition-all ${
            authorization.registered
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-slate-900/40 border-amber-500/30'
          }`}
        >
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-black">
              Patente
            </div>
            <div className="text-xs font-bold text-white truncate">
              {authorization.displayPlate}
            </div>
          </div>

          <div className="min-w-0 text-right">
            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-black">
              Empresa
            </div>
            <div className="text-xs font-bold text-slate-200 truncate">
              {authorization.company || '—'}
            </div>
          </div>

          <span
            data-testid="vehicle-auth-badge"
            className={`flex-shrink-0 px-2 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase ${
              authorization.registered
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
            }`}
          >
            {authorization.status}
          </span>
        </div>
      )}

      {/* EMPRESA input (opcional) */ }
      <div className="relative">
        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block flex items-center gap-1">
          <Building className="w-3 h-3" />
          EMPRESA <span className="text-slate-600 font-normal">(opcional)</span>
        </label>
        <input
          ref={companyRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          value={companyInput}
          onChange={(e) => setCompanyInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (plateInput.trim()) handleEntry();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setCompanyInput('');
              plateRef.current?.focus();
            }
          }}
          placeholder="Constructora XYZ"
          className="w-full bg-[#020617] border border-slate-700 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600/40 transition-all focus:outline-none focus:ring-2 focus:border-indigo-400 focus:ring-indigo-400/30"
        />
        {companyInput && (
          <button
            onClick={() => { setCompanyInput(''); plateRef.current?.focus(); }}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300"
            title="Limpiar empresa"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* TIPO DE SALIDA (sólo salida directa: no hay sesión abierta) */ }
      {inputValid && !inside && (
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">
            TIPO DE SALIDA <span className="text-slate-600 font-normal">(opcional)</span>
          </label>
          <select
            value={exitType}
            onChange={(e) => setExitType(e.target.value as VehicleExitType | '')}
            className="w-full bg-[#020617] border border-slate-700 rounded-2xl px-4 py-3 text-sm text-white transition-all focus:outline-none focus:ring-2 focus:border-indigo-400 focus:ring-indigo-400/30"
          >
            <option value="">— Sin declarar —</option>
            {VEHICLE_EXIT_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      )}

      {/* OBSERVACIÓN (opcional, nunca bloquea el movimiento) */ }
      {inputValid && (
        <div>
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">
            OBSERVACIÓN <span className="text-slate-600 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            value={observation}
            onChange={(e) => setObservation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setObservation('');
              }
            }}
            placeholder="Ej. no entrega nombre del conductor"
            className="w-full bg-[#020617] border border-slate-700 rounded-2xl px-4 py-3 text-sm text-white placeholder:text-slate-600/40 transition-all focus:outline-none focus:ring-2 focus:border-indigo-400 focus:ring-indigo-400/30"
          />
        </div>
      )}

      {/* ENTRADA / SALIDA (o SALIDA DIRECTA si no está dentro) */ }
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={handleEntry}
          disabled={isValidating || !inputValid}
          className={`flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-extrabold uppercase tracking-wider transition-all disabled:opacity-40 ${
            inputValid && !inside
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20 active:scale-95'
              : inputValid
              ? 'bg-amber-600/80 hover:bg-amber-500/80 text-white shadow-lg shadow-amber-600/20 active:scale-95'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
          }`}
        >
          <LogIn className="w-5 h-5" />
          ENTRADA
        </button>
        {inside ? (
          <button
            onClick={handleExit}
            disabled={isValidating || !inputValid}
            className={`flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-extrabold uppercase tracking-wider transition-all disabled:opacity-40 ${
              inputValid
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20 active:scale-95'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <LogOut className="w-5 h-5" />
            SALIDA
          </button>
        ) : (
          <button
            onClick={handleDirectExit}
            disabled={isValidating || !inputValid}
            className={`flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-extrabold uppercase tracking-wider transition-all disabled:opacity-40 ${
              inputValid
                ? 'bg-rose-800 hover:bg-rose-700 text-white shadow-lg shadow-rose-800/20 active:scale-95 border border-rose-600/40'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
            title="Salida sin entrada registrada en esta portería"
          >
            <LogOut className="w-5 h-5" />
            SALIDA DIRECTA
          </button>
        )}
      </div>

      {/* MATCH: la patente ya tiene sesión abierta → NO se crea otra entrada */ }
      {currentPlate && inside && activeSession && (
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
          <div className="flex items-center gap-2 text-amber-300">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="text-[11px] font-black uppercase tracking-widest">Vehículo ya está dentro</span>
          </div>
          <div className="text-[10px] font-mono text-slate-300 space-y-0.5">
            <p>Patente: <span className="text-white font-bold">{formatPlateForDisplay(activeSession.plate || currentPlate)}</span></p>
            <p>Empresa: <span className="text-slate-200">{activeSession.name !== 'Vehículo' ? activeSession.name : '— Sin empresa'}</span></p>
            <p>Entrada registrada: <span className="text-emerald-300">{activeSession.entryTime}</span></p>
          </div>
          <p className="text-[9px] text-amber-200/80">
            No se creó otra entrada. Registra SALIDA para cerrar esta sesión.
          </p>
        </div>
      )}

      {/* Estado actual de la patente (sólo cuando NO hay match) */ }
      {currentPlate && !inside && (
        <div className="flex items-center justify-between p-3 rounded-2xl text-xs font-mono transition-all bg-slate-900/40 border border-slate-800 text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-slate-500"></span>
            <span>{formatPlateForDisplay(currentPlate)} · FUERA</span>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            {lastMovement && (
              <span className="text-[9px] text-slate-500">
                Último: {lastMovement.action} {lastMovement.time}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
