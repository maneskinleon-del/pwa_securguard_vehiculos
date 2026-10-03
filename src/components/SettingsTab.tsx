/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShieldCheck, UserCheck, Volume2, VolumeX, Bell, AlertTriangle, Cpu, CheckCircle, Flame, Server, Trash2, CalendarDays, Settings2, Download } from 'lucide-react';
import { GuardProfile, IncidentReport } from '../types';

interface SettingsTabProps {
  profile: GuardProfile;
  onChangeProfile: (profile: GuardProfile) => void;
  incidents: IncidentReport[];
  onResolveIncident: (id: string) => void;
  onResetDay: () => void;
  onDeleteAll: () => void;
  onExportBackup: () => void;
}

export function SettingsTab({ profile, onChangeProfile, incidents, onResolveIncident, onResetDay, onDeleteAll, onExportBackup }: SettingsTabProps) {
  const [editingName, setEditingName] = useState(profile.name);
  const [editingGate, setEditingGate] = useState(profile.gate);
  const [isSaved, setIsSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onChangeProfile({
      ...profile,
      name: editingName,
      gate: editingGate
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const toggleNotification = () => {
    const next = !profile.notifications;
    onChangeProfile({ ...profile, notifications: next });
    if (next && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  };

  const toggleSound = () => {
    onChangeProfile({ ...profile, soundAlerts: !profile.soundAlerts });
  };

  const toggleBiometrics = () => {
    onChangeProfile({ ...profile, biometricValidation: !profile.biometricValidation });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Title */}
      <h1 className="text-xl font-bold font-headline-md text-white tracking-tight uppercase flex items-center gap-2">
        <Settings2 className="w-5 h-5 text-[#818cf8]" />
        Gobernanza y Preferencias
      </h1>

      {/* Grid container Bento style */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Form Operator Info Bento Box */}
        <form onSubmit={handleSave} className="bg-[#0f172a] border border-slate-800 rounded-[2rem] p-6 shadow-lg flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 mb-3">
              <UserCheck className="w-4 h-4 text-[#818cf8]" />
              Guardia de Turno
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wide">Nombre Completo Operador</label>
                <input
                  type="text"
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  className="w-full bg-[#020617] border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-medium focus:outline-none focus:border-indigo-500 transition-all"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 tracking-wide">Punto de Control / Portería</label>
                <input
                  type="text"
                  value={editingGate}
                  onChange={e => setEditingGate(e.target.value)}
                  placeholder="Ej: Acceso Norte, Recepción..."
                  className="w-full bg-[#020617] border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-medium focus:outline-none focus:border-indigo-500 transition-all"
                  required
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              type="submit"
              className="px-4 py-2 bg-gradient-to-r from-indigo-500 via-purple-600 to-indigo-600 text-white font-black text-[11px] uppercase rounded-xl hover:opacity-90 active:scale-95 transition-all text-center cursor-pointer shadow-lg shadow-indigo-500/20"
            >
              {isSaved ? '✓ Guardado' : 'Guardar Datos'}
            </button>
            
            <span className="text-[9px] text-slate-500 font-mono font-bold tracking-wider">
              ID: #57C-AISTUDIO
            </span>
          </div>
        </form>

        {/* Device Parameters Bento Box */}
        <section className="bg-[#0f172a] border border-slate-800 rounded-[2rem] p-6 shadow-lg flex flex-col justify-between space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 mb-4">
              <Cpu className="w-4 h-4 text-indigo-400" />
              Consola y Periféricos
            </h3>
            
            <div className="space-y-4">
              {/* Sound Alerts */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-2xl bg-slate-900 border border-slate-800">
                    {profile.soundAlerts ? <Volume2 className="w-4 h-4 text-indigo-400 animate-pulse" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-200">Sintetizador de Voz</h4>
                    <p className="text-[9px] text-slate-500 font-medium">Asistente audible por IA en pórticos.</p>
                  </div>
                </div>
                <button
                  onClick={toggleSound}
                  className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${profile.soundAlerts ? 'bg-indigo-500' : 'bg-slate-800'}`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${profile.soundAlerts ? 'translate-x-5' : ''}`}></div>
                </button>
              </div>

              {/* Push Broadcast */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-2xl bg-slate-900 border border-slate-800">
                    <Bell className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-200">Radiodifusión de Alertas</h4>
                    <p className="text-[9px] text-slate-500 font-medium font-sans">Multicast instantáneo a patrullas.</p>
                  </div>
                </div>
                <button
                  onClick={toggleNotification}
                  className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${profile.notifications ? 'bg-indigo-500' : 'bg-slate-800'}`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${profile.notifications ? 'translate-x-5' : ''}`}></div>
                </button>
              </div>

              {/* Secure Biometric Validation */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-2xl bg-slate-900 border border-slate-800">
                    <ShieldCheck className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-200">Validación FRS (demo)</h4>
                    <p className="text-[9px] text-slate-500 font-medium font-sans">Marca de preferencia; sin verificación real activa.</p>
                  </div>
                </div>
                <button
                  onClick={toggleBiometrics}
                  className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${profile.biometricValidation ? 'bg-indigo-500' : 'bg-slate-800'}`}
                >
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${profile.biometricValidation ? 'translate-x-5' : ''}`}></div>
                </button>
              </div>
            </div>
          </div>
          <div className="text-[8px] text-slate-600 font-mono tracking-widest text-right mt-1">
            GATEWAY BROADCAST: PORT 3000
          </div>
        </section>

        {/* Reset Daily Log Bento Box */}
        <section className="bg-[#0f172a] border border-slate-800 rounded-[2rem] p-6 shadow-lg flex flex-col justify-between space-y-4 md:col-span-2">
          <div>
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2 mb-2">
              <CalendarDays className="w-4 h-4 text-emerald-500" />
              1. Cierre de Jornada / Reiniciar Día
            </h3>
            <p className="text-[11px] text-slate-400 leading-normal">
              Borra únicamente los eventos del día operacionales (Entradas, Salidas, Eventos de Hoy, y Estado de Presencia Temporal). <strong className="text-emerald-400">NO eliminará</strong> el catálogo de vehículos autorizados.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {confirmReset ? (
              <div className="flex items-center gap-2.5 bg-emerald-950/20 border border-emerald-500/20 p-2.5 rounded-xl w-full justify-between animate-fade-in text-xs">
                <span className="text-[10px] font-bold text-slate-200">¿Confirmas iniciar un nuevo día operando de cero? Tus archivos de pre-registros no se borrarán.</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      onResetDay();
                      setConfirmReset(false);
                    }}
                    className="px-3 py-1 bg-emerald-650 hover:bg-emerald-700 text-white text-[10px] font-extrabold rounded-lg cursor-pointer"
                  >
                    Sí, reiniciar día
                  </button>
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="px-3 py-1 bg-slate-800 text-slate-300 text-[10px] font-extrabold rounded-lg cursor-pointer"
                  >
                    No
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="px-4 py-2 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white font-extrabold text-[11px] uppercase rounded-xl border border-emerald-500/20 hover:border-transparent transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Reiniciar Día (Conserva Catálogo)
                </button>
                <span className="text-[9px] text-[#818cf8] font-bold uppercase tracking-widest bg-indigo-950/20 border border-indigo-500/10 px-2.5 py-0.5 rounded-full font-sans">
                  Offline-Safe Local Storage
                </span>
              </>
            )}
          </div>
        </section>

        {/* Delete All Full DB Bento Box */}
        <section className="bg-[#0f172a] border border-slate-800 rounded-[2rem] p-6 shadow-lg flex flex-col justify-between space-y-4 md:col-span-2">
          <div>
            <h3 className="text-xs font-bold text-rose-450 uppercase tracking-wider flex items-center gap-2 mb-2">
              <Trash2 className="w-4 h-4 text-rose-500" />
              2. Eliminar Toda la Bitácora y el Catálogo de Vehículos (Reinicio de Fábrica)
            </h3>
            <p className="text-[11px] text-slate-400 leading-normal">
              Borra <strong className="text-rose-400">toda la información</strong> local de manera permanente, incluyendo todo el historial de movimientos vehiculares y el <strong className="text-rose-400">catálogo de vehículos autorizados</strong>.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {confirmDeleteAll ? (
              <div className="flex items-center gap-2.5 bg-rose-950/20 border border-rose-500/20 p-2.5 rounded-xl w-full justify-between animate-fade-in text-xs">
                <span className="text-[10px] font-bold text-slate-200">¿Confirmas BORRAR ABSOLUTAMENTE TODO de la memoria local? Esto es irreversible.</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      onDeleteAll();
                      setConfirmDeleteAll(false);
                    }}
                    className="px-3 py-1 bg-red-650 hover:bg-red-700 text-white text-[10px] font-extrabold rounded-lg cursor-pointer"
                  >
                    Sí, borrar TODO
                  </button>
                  <button
                    onClick={() => setConfirmDeleteAll(false)}
                    className="px-3 py-1 bg-slate-800 text-slate-300 text-[10px] font-extrabold rounded-lg cursor-pointer"
                  >
                    No
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAll(true)}
                  className="px-4 py-2 bg-red-650/10 hover:bg-rose-600 text-rose-400 hover:text-white font-extrabold text-[11px] uppercase rounded-xl border border-red-500/20 hover:border-transparent transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar Todo el Historial y Catálogo
                </button>
                <span className="text-[9px] text-rose-400 font-bold uppercase tracking-widest bg-rose-950/15 border border-rose-500/10 px-2.5 py-0.5 rounded-full font-sans">
                  Borrado Completo
                </span>
              </>
            )}
          </div>
        </section>

      </div>

      {/* Backup / Respaldo section */}
      <section className="bg-[#0f172a] border border-slate-800 rounded-[2rem] p-6 shadow-lg space-y-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
          <Download className="w-4 h-4 text-indigo-400" />
          Respaldo y Portabilidad
        </h3>
        <p className="text-[11px] text-slate-400 leading-normal">
          Exporta todos los datos (registros vehiculares, incidencias, perfil) a un archivo <strong className="text-indigo-300">.json</strong>. Guárdalo como respaldo o para moverlo a otro dispositivo. El almacenamiento local se pierde al cambiar de teléfono o borrar caché.
        </p>
        <button
          type="button"
          onClick={onExportBackup}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-indigo-600/10 hover:bg-indigo-600 text-indigo-400 hover:text-white font-extrabold text-[11px] uppercase rounded-xl border border-indigo-500/20 hover:border-transparent transition-all cursor-pointer"
        >
          <Download className="w-4 h-4" />
          Exportar Respaldo Completo (.json)
        </button>
      </section>

      {/* Incident Tickets section */}
      <section className="bg-[#0f172a] border border-slate-800 rounded-[2rem] p-6 shadow-lg space-y-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500" />
          Incidencias Activas y Reportes
        </h3>
        {incidents.length === 0 ? (
          <div className="text-center py-8 bg-[#020617] border border-slate-800/60 text-slate-500 text-xs rounded-[1.5rem] font-bold">
            No hay alertas de incidencias pendientes en el recinto.
          </div>
        ) : (
          <div className="space-y-3">
            {incidents.map(inc => (
              <div
                key={inc.id}
                className="p-4 rounded-2xl bg-[#020617] border border-slate-800/80 flex items-start justify-between gap-3 shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="p-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 mt-0.5">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h4 className="text-xs font-bold text-white leading-tight">{inc.title}</h4>
                      <span className={`text-[8px] font-black px-2 py-0.5 rounded-full border tracking-wider ${
                        inc.category === 'URGENTE'
                          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          : inc.category === 'MODERADO'
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30'
                      }`}>
                        {inc.category}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-normal">{inc.description}</p>
                    <p className="text-[9px] font-mono text-slate-500 mt-2 font-bold uppercase tracking-wider">
                      REPORTE: {inc.reporter} • FECHA: {inc.date} • HORA: {inc.time}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => onResolveIncident(inc.id)}
                  className="p-2 bg-slate-900 border border-slate-800 hover:bg-emerald-500/10 hover:border-emerald-500/20 text-slate-400 hover:text-emerald-400 rounded-xl transition-all cursor-pointer flex-shrink-0"
                  title="Resolver Ticket"
                >
                  <CheckCircle className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Compliance / info system card */}
      <section className="p-4 bg-slate-950/40 rounded-2xl border border-slate-800 text-center space-y-1">
        <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-bold tracking-widest uppercase">
          <Server className="w-4 h-4 text-indigo-400" />
          SecurGuard Engine AI • Version 3.45-STABLE
        </div>
      </section>
    </div>
  );
}
