/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Shield, Bell, Siren, MonitorSmartphone, Upload } from 'lucide-react';
import { VehicleDashboard } from './components/VehicleDashboard';
import { ImportPatentes } from './components/ImportPatentes';
import { SettingsTab } from './components/SettingsTab';
import { useAppState } from './hooks/useAppState';
import { useVehicleCatalog } from './hooks/useVehicleCatalog';

export default function App() {
  // Navegación: UNA SOLA vista principal de trabajo (Control de Acceso).
  // 'settings' e 'import' no son tabs operativas: son secciones
  // administrativas que se abren desde el header.
  const [currentTab, setCurrentTab] = useState<'control' | 'settings' | 'import'>('control');

  // Estado central + lógica de negocio vehicular (useAppState).
  // Se consumen sólo los handlers vehiculares y de configuración: los de
  // Personas/registro de personas ya no tienen superficie en esta variante.
  const {
    logs,
    activeInside,
    incidents,
    profile,
    setProfile,
    handleRemoveMovement,
    handleResetDay,
    handleExportBackup,
    handleFactoryReset,
    handleResolveIncident,
    isVehicleInside,
    handleVehicleEntry,
    handleVehicleExit,
    handleVehicleDirectExit,
  } = useAppState();

  // Catálogo mínimo de vehículos autorizados (PATENTE → EMPRESA → AUTORIZADO).
  // Persistencia local; NO REGISTRADO es sólo informativo y nunca bloquea.
  const { catalog, importVehicles } = useVehicleCatalog();

  // Emergency lockdown toggle (estado de UI, no persiste en profile)
  const [emergencyLock, setEmergencyLock] = useState<boolean>(() => {
    const saved = localStorage.getItem('securguard_emergencylock');
    return saved ? JSON.parse(saved) === 'true' : false;
  });

  useEffect(() => {
    localStorage.setItem('securguard_emergencylock', String(emergencyLock));
  }, [emergencyLock]);

  // System alerts & clock counter
  const [clock, setClock] = useState('');
  const [bellShake, setBellShake] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'alert' | 'info' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Shake the bell when a new incident arrives
  useEffect(() => {
    if (incidents.length > 0) {
      setBellShake(true);
      const timer = setTimeout(() => setBellShake(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [incidents]);

  // Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('es-CL', { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 pb-28 selection:bg-indigo-500/30 select-none font-sans overflow-x-hidden w-full">

      {/* Emergency Lockdown high visibility flash banner */}
      {emergencyLock && (
        <div className="bg-red-650 text-white py-2.5 px-4 text-center text-xs font-black tracking-widest flex items-center justify-center gap-2 animate-pulse sticky top-0 z-50 w-full overflow-hidden">
          <Siren className="w-5 h-5 flex-shrink-0 animate-spin text-white" />
          <span className="truncate">⚠️ ALERTA: SISTEMA SECUREGUARD EN ESTADO BLOQUEO DE EMERGENCIA ⚠️</span>
        </div>
      )}

      {/* Top Header Bar precisely styled like the mockups */}
      <header className="sticky top-0 w-full z-40 bg-[#020617]/90 backdrop-blur-md shadow-md flex justify-between items-center px-4 sm:px-6 h-16 sm:h-20 border-b border-slate-900">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-[#818cf8] flex-shrink-0" />
          <div className="flex flex-col">
            <h1 className="font-bold text-sm sm:text-base text-white tracking-tight leading-none uppercase">SecurGuard AI</h1>
            <span className="text-[8px] sm:text-[9px] text-[#818cf8] uppercase tracking-widest font-black">Gate Patrol</span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
          {/* Dynamic clock output inside header display */}
          <div className="font-mono text-[10px] sm:text-xs text-[#818cf8] tracking-widest bg-indigo-950/20 py-1 sm:py-1.5 px-2 sm:px-3 rounded-lg sm:rounded-xl border border-slate-800 font-bold whitespace-nowrap">
            {clock || '19:08:43'}
          </div>

          {/* Acceso a la sección administrativa IMPORTAR PATENTES */}
          <button
            onClick={() => setCurrentTab('import')}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-all flex-shrink-0 active:scale-95"
            title="Importar patentes (CSV)"
            aria-label="Importar patentes"
          >
            <Upload className="w-4 h-4 text-slate-300" />
          </button>

          <button
            onClick={() => setCurrentTab('settings')}
            className={`p-1.5 sm:p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 transition-all relative flex-shrink-0 ${
              bellShake ? 'animate-bounce' : 'active:scale-95'
            }`}
          >
            <Bell className="w-4 h-4 text-slate-300" />
            {incidents.length > 0 && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
            )}
          </button>
        </div>
      </header>

      {/* Main Container screen wrapper */}
      <main className="max-w-xl mx-auto px-4 pt-5">
        {currentTab === 'control' && (
          <VehicleDashboard
            logs={logs}
            activeInside={activeInside}
            catalog={catalog}
            profile={profile}
            incidents={incidents}
            isVehicleInside={isVehicleInside}
            onVehicleEntry={handleVehicleEntry}
            onVehicleExit={handleVehicleExit}
            onVehicleDirectExit={handleVehicleDirectExit}
            onRemoveMovement={handleRemoveMovement}
            onResetDay={handleResetDay}
            onExportBackup={handleExportBackup}
            clock={clock}
            onShowToast={(t) => setToast(t)}
            onOpenSettings={() => setCurrentTab('settings')}
          />
        )}

        {currentTab === 'import' && (
          <ImportPatentes
            catalog={catalog}
            onImport={importVehicles}
            onBack={() => setCurrentTab('control')}
          />
        )}

        {currentTab === 'settings' && (
          <SettingsTab
            profile={profile}
            onChangeProfile={setProfile}
            incidents={incidents}
            onResolveIncident={handleResolveIncident}
            onResetDay={handleResetDay}
            onDeleteAll={handleFactoryReset}
            onExportBackup={handleExportBackup}
          />
        )}
      </main>

      {/* ÚNICA TAB PRINCIPAL: Control de Acceso vehicular.
          No hay tab de Personas, ni de Logs, ni de registro de choferes. */}
      <nav className="fixed bottom-0 left-0 w-full z-40 bg-[#020617]/95 backdrop-blur-md shadow-[0px_-4px_30px_rgba(0,0,0,0.8)] rounded-t-[2rem] border-t border-slate-900 overflow-hidden pb-safe">
        <div className="max-w-md mx-auto flex justify-center items-center px-4 sm:px-8 py-2.5 sm:py-3">
          <button
            onClick={() => setCurrentTab('control')}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl bg-slate-900 text-indigo-400 font-extrabold border border-indigo-950 shadow-lg shadow-indigo-600/10 active:scale-95 transition-all"
            title="Control de Acceso Vehicular"
          >
            <MonitorSmartphone className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-[10px] sm:text-xs uppercase tracking-widest">Control de Acceso</span>
          </button>
        </div>
      </nav>

      {/* Floating System-wide Overlay Toast Notification */}
      {toast && (
        <div
          id="system-toast"
          className={`fixed top-8 left-1/2 -translate-x-1/2 z-50 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 border text-xs font-bold font-sans transition-all duration-300 ${
            toast.type === 'success'
              ? 'bg-[#0f172a]/95 text-emerald-400 border-emerald-500/30'
              : toast.type === 'alert'
              ? 'bg-[#0f172a]/95 text-rose-400 border-rose-500/30'
              : 'bg-[#0f172a]/95 text-[#818cf8] border-indigo-500/30'
          }`}
        >
          {toast.type === 'success' ? (
            <span className="text-emerald-400 text-sm">✓</span>
          ) : toast.type === 'alert' ? (
            <span className="text-rose-400 text-sm">⚠️</span>
          ) : (
            <span className="text-indigo-400 text-sm">ℹ</span>
          )}
          <span>{toast.message}</span>
        </div>
      )}

    </div>
  );
}
