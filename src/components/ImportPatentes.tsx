/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ImportPatentes — sección administrativa "IMPORTAR PATENTES".
 *
 * Permite cargar masivamente vehículos al catálogo EXISTENTE desde un CSV
 * del dispositivo: `patente,empresa`.
 *
 * Flujo: seleccionar archivo → resumen (encontrados/nuevos/duplicados/
 * inválidos) → confirmar → se persiste en el catálogo de siempre
 * (`securguard_vehicle_catalog_v1`). Nada se escribe antes de confirmar.
 *
 * Muestra además el catálogo actual para verificar que la carga ocurrió.
 */

import React, { useRef, useState } from 'react';
import { Upload, CheckCircle2, AlertCircle, FileText, Loader2, Table2 } from 'lucide-react';
import { AuthorizedVehicle } from '../domain/vehicleCatalog';
import {
  CatalogImportPlan,
  parseVehicleCatalogCSV,
  planCatalogImport,
} from '../domain/vehicleCatalogCsv';
import { formatPlateForDisplay } from '../domain/plate';

export interface ImportPatentesProps {
  catalog: AuthorizedVehicle[];
  onImport: (entries: AuthorizedVehicle[]) => number;
  onBack: () => void;
}

export function ImportPatentes({ catalog, onImport, onBack }: ImportPatentesProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');
  const [plan, setPlan] = useState<CatalogImportPlan | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string>('');
  const [done, setDone] = useState<string>('');

  const reset = () => {
    setPlan(null);
    setFileName('');
    setError('');
    setDone('');
    if (fileRef.current) fileRef.current.value = '';
  };

  /** Lee el archivo y arma el plan (sin escribir nada todavía). */
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setError('');
    setDone('');
    setPlan(null);
    if (!file) return;

    setFileName(file.name);
    setReading(true);
    try {
      const text = await file.text();
      setPlan(planCatalogImport(catalog, parseVehicleCatalogCSV(text)));
    } catch {
      setError('No se pudo leer el archivo.');
    } finally {
      setReading(false);
    }
  };

  /** Confirmación: recién aquí se escribe en el catálogo. */
  const handleConfirm = () => {
    if (!plan) return;
    const added = onImport(plan.newEntries);
    setDone(
      added === 1
        ? 'Importación completada: 1 patente agregada al catálogo.'
        : `Importación completada: ${added} patentes agregadas al catálogo.`
    );
    setPlan(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex-shrink-0">
          <Upload className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">
            Importar Patentes
          </h2>
          <p className="text-[10px] text-slate-500 font-medium">
            Carga masiva de vehículos al catálogo · formato: patente,empresa
          </p>
        </div>
      </div>

      {/* Selector de archivo */}
      <section className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl">
        <label className="block">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1 block">
            Archivo CSV
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleFile}
            data-testid="csv-input"
            className="block w-full text-xs text-slate-300 bg-[#020617] border border-slate-700 rounded-2xl px-4 py-3 focus:outline-none focus:ring-2 focus:border-indigo-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-500/20 file:text-indigo-300 file:text-xs file:font-bold"
          />
        </label>

        <p className="text-[10px] text-slate-500 leading-relaxed">
          Formato: <span className="font-mono text-slate-400">patente,empresa</span> · el
          encabezado es opcional · se aceptan <span className="font-mono">,</span> o{' '}
          <span className="font-mono">;</span> como separador.
        </p>

        {fileName && (
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-300">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            Archivo: <span className="text-white font-bold">{fileName}</span>
          </div>
        )}

        {reading && (
          <p className="flex items-center gap-2 text-[11px] text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Leyendo archivo…
          </p>
        )}

        {error && (
          <p className="flex items-center gap-2 text-[11px] text-rose-400">
            <AlertCircle className="w-3.5 h-3.5" /> {error}
          </p>
        )}
      </section>

      {/* Resumen previo (FASE 3): sólo después de elegir archivo */}
      {plan && (
        <section
          data-testid="import-summary"
          className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl"
        >
          <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest">
            Resumen de la importación
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Registros encontrados" value={plan.found} testid="stat-found" />
            <Stat label="Nuevos" value={plan.newEntries.length} tone="emerald" testid="stat-new" />
            <Stat
              label="Duplicados"
              value={plan.duplicates.length}
              tone="amber"
              testid="stat-dup"
            />
            <Stat label="Inválidos" value={plan.invalid.length} tone="rose" testid="stat-invalid" />
          </div>

          {plan.invalid.length > 0 && (
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {plan.invalid.map((p, i) => (
                <p key={i} className="text-[10px] text-rose-300/90 font-mono truncate">
                  Línea {p.line}: {p.reason}
                </p>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={reset}
              className="flex-1 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-extrabold uppercase tracking-wider transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={plan.newEntries.length === 0}
              className={`flex-1 py-3 rounded-2xl text-xs font-extrabold uppercase tracking-wider transition-colors ${
                plan.newEntries.length === 0
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              Importar
            </button>
          </div>
        </section>
      )}

      {/* Confirmación post-importación */}
      {done && (
        <p
          data-testid="import-done"
          className="flex items-center gap-2 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold"
        >
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {done}
        </p>
      )}

      {/* Catálogo actual: comprobación visual de la carga */}
      <section className="bg-[#0f172a] border border-slate-800 rounded-3xl p-4 sm:p-5 space-y-3 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
            <Table2 className="w-4 h-4 text-indigo-400" /> Catálogo actual
          </h3>
          <span
            data-testid="catalog-count"
            className="text-[10px] font-black text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full"
          >
            {catalog.length}
          </span>
        </div>

        {catalog.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-medium py-3 text-center">
            El catálogo está vacío. Importa un CSV para comenzar.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {catalog.map(v => (
              <div
                key={v.plate}
                className="flex items-center justify-between p-2.5 bg-[#020617] rounded-xl border border-slate-800/30"
              >
                <span className="font-mono text-xs font-bold text-white">
                  {formatPlateForDisplay(v.plate)}
                </span>
                <span className="text-[11px] text-slate-400 truncate ml-3">{v.company}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex justify-center pt-1">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-bold transition-all"
        >
          Volver a Control de Acceso
        </button>
      </div>
    </div>
  );
}

/** Cuadro de estadística del resumen. */
function Stat({
  label,
  value,
  tone,
  testid,
}: {
  label: string;
  value: number;
  tone?: 'emerald' | 'amber' | 'rose';
  testid: string;
}) {
  const tones: Record<string, string> = {
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    rose: 'text-rose-300',
  };
  return (
    <div className="p-2.5 bg-[#020617] rounded-xl border border-slate-800/40">
      <div className={`font-mono text-lg font-black ${tones[tone ?? ''] ?? 'text-white'}`} data-testid={testid}>
        {value}
      </div>
      <div className="text-[9px] uppercase tracking-widest text-slate-500 font-black">{label}</div>
    </div>
  );
}
