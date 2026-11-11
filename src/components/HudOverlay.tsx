import React, { useState } from 'react';
import {
  AstronautEVAState,
  CameraViewMode,
  ComputedCraftSpecs,
  DifficultyLevel,
  MissionChallenge,
  MissionChallengeOption,
  MissionModeConfig,
  SimulationControlMode,
  SpacecraftConfiguration,
  TelemetryState,
} from '../game/types';
import {
  ENGINE_CATALOG,
  HABITAT_BASE_POS,
  LAUNCH_WINDOWS,
  PAYLOAD_CATALOG,
  PLANETARY_GRAVITY_MS2,
  POWER_SYSTEM_CATALOG,
  ROCKET_CHASSIS_CATALOG,
  TRAJECTORY_OPTIONS,
  validateMissionReadiness,
} from '../game/rules';

interface HudOverlayProps {
  mode: MissionModeConfig;
  difficulty: DifficultyLevel;
  telemetry: TelemetryState;
  simMode: SimulationControlMode;
  astronautState: AstronautEVAState;
  config: SpacecraftConfiguration;
  specs: ComputedCraftSpecs;
  cameraView: CameraViewMode;
  dockCollapsed: boolean;
  muted: boolean;
  activeChallenge: MissionChallenge | null;
  statusBanner: string | null;
  activeBurn: boolean;
  shieldActive: boolean;
  scanning: boolean;
  onToggleSimMode: (target?: SimulationControlMode) => void;
  onVirtualMove: (dx: number, dz: number) => void;
  onVirtualJetpack: (active: boolean) => void;
  onTriggerEvaInteract: () => void;
  onTriggerRoverToggle: () => void;
  onUpdateConfig: (partial: Partial<SpacecraftConfiguration>) => void;
  onInitiateLaunch: () => void;
  onToggleBurn: () => void;
  onToggleShield: () => void;
  onToggleScan: () => void;
  onTriggerChallenge: () => void;
  onResolveChallenge: (opt: MissionChallengeOption) => void;
  onAdvancePhaseOrComplete: () => void;
  onCycleCamera: () => void;
  onToggleDock: () => void;
  onToggleMute: () => void;
  onOpenLearning: () => void;
  onOpenAchievements: () => void;
  onPause: () => void;
  onRestart: () => void;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  mode,
  telemetry,
  simMode,
  astronautState,
  config,
  specs,
  cameraView,
  dockCollapsed,
  muted,
  activeChallenge,
  statusBanner,
  activeBurn,
  shieldActive,
  scanning,
  onToggleSimMode,
  onVirtualMove,
  onVirtualJetpack,
  onTriggerEvaInteract,
  onTriggerRoverToggle,
  onUpdateConfig,
  onInitiateLaunch,
  onToggleBurn,
  onToggleShield,
  onToggleScan,
  onTriggerChallenge,
  onResolveChallenge,
  onAdvancePhaseOrComplete,
  onCycleCamera,
  onToggleDock,
  onToggleMute,
  onOpenLearning,
  onOpenAchievements,
  onPause,
  onRestart,
}) => {
  const [builderTab, setBuilderTab] = useState<'propulsion' | 'systems' | 'trajectory'>(
    'propulsion'
  );

  const readiness = validateMissionReadiness(specs);
  const isAssembly = telemetry.phase === 'assembly';
  const isEva = simMode === 'astronaut_eva';
  const gravity = PLANETARY_GRAVITY_MS2[mode.id] || 1.62;

  const renderVitalityPips = (pct: number, accentHex: string) => {
    const pips = [20, 40, 60, 80, 100];
    return (
      <div className="flex items-center gap-1" aria-hidden="true">
        {pips.map((threshold, idx) => {
          const isFull = pct >= threshold;
          const isCracked = !isFull && pct >= threshold - 12;
          return (
            <svg key={idx} viewBox="0 0 18 14" className="w-4 h-3">
              <polygon
                points="3,1 16,1 14,13 1,13"
                fill={isFull ? accentHex : isCracked ? '#F59E0B' : 'rgba(15,23,42,0.85)'}
                stroke={isFull || isCracked ? '#F8FAFC' : '#334155'}
                strokeWidth="1.4"
              />
            </svg>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 md:p-5">
      {/* TOP PERIMETER ROW */}
      <div className="w-full flex flex-wrap items-start justify-between gap-3">
        {/* Top-Left Cluster */}
        <div
          className="pointer-events-auto bg-[#0B0E17]/92 border border-slate-800 rounded px-3.5 py-2.5 flex flex-col gap-2 min-w-[270px] max-w-[340px]"
          style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.65)' }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-800/90 pb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
                <polygon
                  points="12,2 21,19 12,15 3,19"
                  fill="#22D3EE"
                  stroke="#083344"
                  strokeWidth="1.5"
                />
              </svg>
              <span className="text-xs font-display font-bold tracking-wider uppercase text-slate-100 truncate">
                {mode.name}
              </span>
            </div>
            <span className="text-[11px] font-mono text-cyan-300 tabular-nums shrink-0">
              {Math.round(telemetry.progressPct)}% COMPLETE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-mono tabular-nums">
            <div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>HULL INTEGRITY</span>
                <span className="text-slate-100 font-semibold">
                  {Math.round(telemetry.healthPct)}%
                </span>
              </div>
              <div className="mt-0.5">{renderVitalityPips(telemetry.healthPct, '#22D3EE')}</div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>CREW SAFETY</span>
                <span className="text-emerald-400 font-semibold">
                  {Math.round(telemetry.crewSafetyPct)}%
                </span>
              </div>
              <div className="mt-0.5">
                {renderVitalityPips(telemetry.crewSafetyPct, '#10B981')}
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>{isEva ? 'SUIT BATTERY' : 'PROPELLANT'}</span>
                <span className="text-cyan-300 font-semibold">
                  {Math.round(isEva ? astronautState.suitBatteryPct : telemetry.fuelPct)}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded overflow-hidden border border-slate-800 mt-0.5">
                <div
                  className="h-full bg-cyan-400 transition-all duration-150"
                  style={{
                    width: `${Math.round(
                      isEva ? astronautState.suitBatteryPct : telemetry.fuelPct
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-[10px] text-slate-400 whitespace-nowrap">
                <span>{isEva ? 'SUIT O₂ / SAMPLES' : 'O₂ / POWER'}</span>
                <span className="text-slate-200 font-semibold">
                  {isEva
                    ? `${Math.round(astronautState.suitOxygenPct)}% · ${astronautState.samplesCarried}x`
                    : `${Math.round(telemetry.oxygenPct)}% · ${Math.round(telemetry.powerPct)}%`}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded overflow-hidden border border-slate-800 mt-0.5 flex">
                <div
                  className="h-full bg-emerald-400 transition-all duration-150"
                  style={{
                    width: `${Math.round(
                      (isEva ? astronautState.suitOxygenPct : telemetry.oxygenPct) * 0.5
                    )}%`,
                  }}
                />
                <div
                  className="h-full bg-amber-400 transition-all duration-150"
                  style={{
                    width: `${Math.round(
                      (isEva ? astronautState.suitBatteryPct : telemetry.powerPct) * 0.5
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="text-[11px] font-mono text-slate-300 truncate pt-0.5 border-t border-slate-800/80">
            {isEva
              ? astronautState.inRover
                ? 'ROVER DRIVE MODE · WASD Steer · [G] Exit on Foot'
                : `ASTRONAUT EVA WALK (${gravity} m/s²) · WASD Walk · Space Jetpack`
              : telemetry.statusText}
          </div>
        </div>

        {/* Top-Center: Simulation Mode Switcher + Phase Stepper + Status Banner */}
        <div className="pointer-events-auto flex flex-col items-center gap-1.5">
          <div
            className="flex items-center gap-1.5 bg-[#0B0E17]/92 border border-slate-800 rounded p-1"
            style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.65)' }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleSimMode('astronaut_eva');
              }}
              className={`px-3 py-1.5 rounded text-xs font-display font-bold uppercase tracking-wider cursor-pointer transition-colors whitespace-nowrap ${
                isEva
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-[#111827] text-slate-300 hover:text-white'
              }`}
            >
              Astronaut Walk (EVA) [V]
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleSimMode('spacecraft_flight');
              }}
              className={`px-3 py-1.5 rounded text-xs font-display font-bold uppercase tracking-wider cursor-pointer transition-colors whitespace-nowrap ${
                !isEva
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-[#111827] text-slate-300 hover:text-white'
              }`}
            >
              Spacecraft &amp; Launch [V]
            </button>
          </div>

          <div
            className="hidden lg:flex flex-col items-center bg-[#0B0E17]/90 border border-slate-800 rounded px-4 py-1.5 gap-0.5"
            style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.65)' }}
          >
            <div className="flex items-center gap-2 text-[11px] font-mono">
              {(
                [
                  { id: 'assembly', label: '1. ASSEMBLY' },
                  { id: 'launch', label: '2. LAUNCH' },
                  { id: 'transit', label: '3. TRANSIT' },
                  { id: 'objective', label: '4. SURFACE / EVA' },
                ] as const
              ).map((step, i) => {
                const active =
                  telemetry.phase === step.id ||
                  (step.id === 'launch' && telemetry.phase === 'countdown');
                return (
                  <React.Fragment key={step.id}>
                    <span
                      className={
                        active
                          ? 'text-cyan-300 font-bold underline underline-offset-4'
                          : 'text-slate-500'
                      }
                    >
                      {step.label}
                    </span>
                    {i < 3 && <span className="text-slate-700">/</span>}
                  </React.Fragment>
                );
              })}
            </div>
            <div className="text-xs font-mono text-slate-200">
              OBJECTIVE ({telemetry.objectivesCompleted}/{telemetry.totalObjectives}):{' '}
              <span className="text-cyan-300">
                {
                  mode.objectives[
                    Math.min(mode.objectives.length - 1, telemetry.objectivesCompleted)
                  ]
                }
              </span>
            </div>
          </div>

          {(astronautState.nearInteractableLabel && isEva) ? (
            <div className="bg-emerald-950/95 border border-emerald-400 rounded px-4 py-1 text-xs font-mono text-emerald-200 shadow-lg">
              ● {astronautState.nearInteractableLabel}
            </div>
          ) : (
            statusBanner &&
            telemetry.phase !== 'countdown' &&
            !activeChallenge && (
              <div className="bg-[#0B0E17]/92 border border-cyan-500/50 rounded px-3.5 py-1 text-[11px] font-mono text-cyan-200 shadow-lg">
                {statusBanner}
              </div>
            )
          )}
        </div>

        {/* Top-Right Cluster */}
        <div className="pointer-events-auto flex items-start gap-2">
          <div
            className="bg-[#0B0E17]/92 border border-slate-800 rounded px-3.5 py-2 grid grid-cols-2 sm:grid-cols-4 gap-3 text-right font-mono tabular-nums"
            style={{ boxShadow: '0 6px 20px rgba(0,0,0,0.65)' }}
          >
            <div>
              <span className="text-[10px] text-slate-400 block">BUDGET RES.</span>
              <span
                className={`text-sm font-bold ${
                  specs.budgetRemainingM >= 0 ? 'text-amber-400' : 'text-rose-400'
                }`}
              >
                ${specs.budgetRemainingM}M
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">TARGET DIST</span>
              <span className="text-sm font-bold text-slate-100">
                {telemetry.distanceFromDestKm.toLocaleString()} km
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">MISSION TIME</span>
              <span className="text-sm font-bold text-cyan-300">
                T+{Math.round(telemetry.travelTimeHours)}h
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block">SCIENCE DATA</span>
              <span className="text-sm font-bold text-purple-300">
                {Math.round(telemetry.scienceDataPoints)} pts
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 bg-[#0B0E17]/92 border border-slate-800 rounded p-1">
            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
              title="Toggle Audio [M]"
              onClick={(e) => {
                e.currentTarget.blur();
                onToggleMute();
              }}
              className="w-8 h-8 flex items-center justify-center rounded bg-slate-900 hover:bg-slate-800 text-slate-200 cursor-pointer"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="#06B6D4" />
                {muted ? (
                  <line x1="22" y1="9" x2="16" y2="15" stroke="#EF4444" />
                ) : (
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" stroke="#22D3EE" />
                )}
              </svg>
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Cycle Camera View [C]"
              title={`Camera: ${cameraView.toUpperCase()} [C]`}
              onClick={(e) => {
                e.currentTarget.blur();
                onCycleCamera();
              }}
              className="w-8 h-8 flex items-center justify-center rounded bg-slate-900 hover:bg-slate-800 text-cyan-300 text-xs font-mono font-bold cursor-pointer"
            >
              C
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Open Space Science Learning Center [L]"
              title="Space Science Lab [L]"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenLearning();
              }}
              className="w-8 h-8 flex items-center justify-center rounded bg-slate-900 hover:bg-slate-800 text-amber-300 text-xs font-mono font-bold cursor-pointer"
            >
              L
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Open Badges and Leaderboard [B]"
              title="Badges & Records [B]"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenAchievements();
              }}
              className="w-8 h-8 flex items-center justify-center rounded bg-slate-900 hover:bg-slate-800 text-purple-300 text-xs font-mono font-bold cursor-pointer"
            >
              B
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause Mission [P]"
              title="Pause [P / Esc]"
              onClick={(e) => {
                e.currentTarget.blur();
                onPause();
              }}
              className="w-8 h-8 flex items-center justify-center rounded bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-mono font-bold cursor-pointer"
            >
              P
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Restart Mission [R]"
              title="Restart Mission [R]"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="w-8 h-8 flex items-center justify-center rounded bg-slate-900 hover:bg-slate-800 text-rose-400 text-xs font-mono font-bold cursor-pointer"
            >
              R
            </button>
          </div>
        </div>
      </div>

      {/* CENTER-VIEWPORT COUNTDOWN OR ACTIVE CHALLENGE DECISION CARD */}
      <div className="my-auto flex flex-col items-center justify-center pointer-events-none">
        {telemetry.phase === 'countdown' && !isEva && (
          <div className="bg-[#0B0E17]/95 border-2 border-cyan-400 rounded-lg px-8 py-5 text-center shadow-2xl">
            <div className="text-xs font-mono text-cyan-300 uppercase tracking-widest">
              LAUNCH SEQUENCE INITIATED · PAD 39B
            </div>
            <div className="text-5xl font-mono font-bold text-slate-100 mt-1 tabular-nums">
              T - 00:0{Math.ceil(telemetry.countdownSeconds)}
            </div>
            <div className="text-xs font-mono text-amber-400 mt-1">
              Turbopump Chilldown &amp; Gimbal Actuator Check Nominal
            </div>
          </div>
        )}

        {activeChallenge && (
          <div
            role="dialog"
            aria-label={`Mission Anomaly: ${activeChallenge.title}`}
            className="pointer-events-auto w-full max-w-xl bg-[#0B0E17] border-2 border-amber-500 rounded-lg p-5 shadow-2xl space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-mono uppercase text-amber-400 font-bold">
                ▲ FLIGHT DIRECTOR DECISION REQUIRED · {activeChallenge.category.toUpperCase()}
              </span>
              <span className="text-xs font-mono text-rose-400 uppercase">
                SEVERITY: {activeChallenge.severity}
              </span>
            </div>
            <h3 className="text-base font-display font-bold text-slate-100">
              {activeChallenge.title}
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              {activeChallenge.description}
            </p>
            <div className="text-[11px] font-mono text-cyan-300 bg-[#111827] border border-slate-800 rounded p-2.5">
              NASA ENGINEERING NOTE: {activeChallenge.nasaContext}
            </div>
            <div className="space-y-2 pt-1">
              {activeChallenge.options.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onResolveChallenge(opt)}
                  className="w-full text-left px-3.5 py-2.5 rounded bg-[#111827] hover:bg-slate-800 border border-slate-700 hover:border-cyan-400 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-1"
                >
                  <span className="text-xs font-display font-semibold text-slate-100">
                    {idx + 1}. {opt.label}
                  </span>
                  <span className="text-[11px] font-mono text-amber-300 shrink-0 tabular-nums">
                    {opt.actionSummary}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* UNIFIED COLLAPSIBLE BOTTOM MISSION CONTROL & ENGINEERING DOCK */}
      <div className="w-full flex flex-col items-center pointer-events-none">
        <div className="w-full max-w-[980px] flex flex-col items-center">
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleDock();
            }}
            className="pointer-events-auto px-4 py-1 rounded-t bg-[#111827] border border-b-0 border-slate-700 text-[11px] font-mono text-slate-300 hover:text-cyan-300 cursor-pointer"
          >
            {dockCollapsed
              ? '▴ Show Mission Control Dock [H]'
              : '▾ Hide Controls (Cinema View) [H]'}
          </button>

          {!dockCollapsed && (
            <div
              className="pointer-events-auto w-full bg-[#0B0E17]/95 border border-slate-700 rounded-lg p-3 shadow-2xl"
              style={{ boxShadow: '0 -8px 30px rgba(0,0,0,0.8)' }}
            >
              {isEva ? (
                /* =================================================================
                   ASTRONAUT EVA WALK & ROVER SURFACE EXPLORATION CONTROL DECK
                   ================================================================= */
                <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-3">
                  {/* Left: Interactive Walk D-Pad Controls (WASD + Mouse/Touch Support) */}
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-[#111827] border border-slate-800 rounded p-1 shrink-0">
                      <button
                        type="button"
                        aria-label="Walk Left [A]"
                        onMouseDown={() => onVirtualMove(-1, 0)}
                        onMouseUp={() => onVirtualMove(0, 0)}
                        onMouseLeave={() => onVirtualMove(0, 0)}
                        onClick={() => onVirtualMove(-1, 0)}
                        className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 active:bg-cyan-500 active:text-slate-950 text-xs font-mono font-bold text-slate-200 cursor-pointer whitespace-nowrap"
                      >
                        ◀ A
                      </button>
                      <button
                        type="button"
                        aria-label="Walk Forward [W]"
                        onMouseDown={() => onVirtualMove(0, -1)}
                        onMouseUp={() => onVirtualMove(0, 0)}
                        onMouseLeave={() => onVirtualMove(0, 0)}
                        onClick={() => onVirtualMove(0, -1)}
                        className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 active:bg-cyan-500 active:text-slate-950 text-xs font-mono font-bold text-slate-200 cursor-pointer whitespace-nowrap"
                      >
                        ▲ W
                      </button>
                      <button
                        type="button"
                        aria-label="Walk Backward [S]"
                        onMouseDown={() => onVirtualMove(0, 1)}
                        onMouseUp={() => onVirtualMove(0, 0)}
                        onMouseLeave={() => onVirtualMove(0, 0)}
                        onClick={() => onVirtualMove(0, 1)}
                        className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 active:bg-cyan-500 active:text-slate-950 text-xs font-mono font-bold text-slate-200 cursor-pointer whitespace-nowrap"
                      >
                        ▼ S
                      </button>
                      <button
                        type="button"
                        aria-label="Walk Right [D]"
                        onMouseDown={() => onVirtualMove(1, 0)}
                        onMouseUp={() => onVirtualMove(0, 0)}
                        onMouseLeave={() => onVirtualMove(0, 0)}
                        onClick={() => onVirtualMove(1, 0)}
                        className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 active:bg-cyan-500 active:text-slate-950 text-xs font-mono font-bold text-slate-200 cursor-pointer whitespace-nowrap"
                      >
                        D ▶
                      </button>
                    </div>

                    <button
                      type="button"
                      onMouseDown={() => onVirtualJetpack(true)}
                      onMouseUp={() => onVirtualJetpack(false)}
                      onMouseLeave={() => onVirtualJetpack(false)}
                      onClick={() => {
                        onVirtualJetpack(true);
                        setTimeout(() => onVirtualJetpack(false), 350);
                      }}
                      className={`px-3 py-2 rounded font-display font-semibold text-xs uppercase tracking-wider border cursor-pointer whitespace-nowrap ${
                        astronautState.jetpackActive
                          ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                          : 'bg-[#111827] text-cyan-300 border-slate-700 hover:border-cyan-400'
                      }`}
                    >
                      Jetpack Boost [Space]
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onTriggerEvaInteract();
                      }}
                      className="px-3 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap"
                    >
                      Collect / Plant Flag [E]
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onTriggerRoverToggle();
                      }}
                      className={`px-3 py-2 rounded font-display font-semibold text-xs uppercase tracking-wider border cursor-pointer whitespace-nowrap ${
                        astronautState.inRover
                          ? 'bg-amber-500 text-slate-950 border-amber-300'
                          : 'bg-[#111827] text-amber-300 border-slate-700 hover:border-amber-400'
                      }`}
                    >
                      {astronautState.inRover ? 'Exit Rover [G]' : 'Drive Rover [G]'}
                    </button>
                  </div>

                  {/* Center/Right: Live Surface Coordinates, Radar & Complete/Board CTA */}
                  <div className="flex items-center gap-3">
                    <div className="hidden xl:flex items-center gap-3 text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      <span>
                        POS:{' '}
                        <strong className="text-slate-100">
                          ({astronautState.x.toFixed(1)}m, {astronautState.z.toFixed(1)}m)
                        </strong>
                      </span>
                      <span>
                        HABITAT:{' '}
                        <strong className="text-emerald-400">
                          {Math.round(
                            Math.hypot(
                              astronautState.x - HABITAT_BASE_POS.x,
                              astronautState.z - HABITAT_BASE_POS.z
                            )
                          )}
                          m
                        </strong>
                      </span>
                    </div>

                    {telemetry.phase === 'objective' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onAdvancePhaseOrComplete();
                        }}
                        className="px-4 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap"
                      >
                        Complete Mission &amp; Return →
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onToggleSimMode('spacecraft_flight');
                        }}
                        className="px-4 py-2 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap"
                      >
                        Board Rocket &amp; Launch →
                      </button>
                    )}
                  </div>
                </div>
              ) : isAssembly ? (
                /* ASSEMBLY & PRE-LAUNCH SPACECRAFT ENGINEERING DOCK */
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-1.5">
                      {(
                        [
                          { id: 'propulsion', label: '1. Rocket & Engine' },
                          { id: 'systems', label: '2. Power, Payload & Shield' },
                          { id: 'trajectory', label: '3. Launch Window & Orbit' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setBuilderTab(tab.id)}
                          className={`px-3 py-1.5 rounded text-xs font-display font-semibold cursor-pointer whitespace-nowrap ${
                            builderTab === tab.id
                              ? 'bg-cyan-500 text-slate-950'
                              : 'bg-[#111827] text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums">
                      <span>
                        CRAFT Δv:{' '}
                        <strong
                          className={
                            specs.hasSufficientDeltaV ? 'text-emerald-400' : 'text-rose-400'
                          }
                        >
                          {specs.totalDeltaV.toLocaleString()} m/s
                        </strong>{' '}
                        <span className="text-slate-500">
                          (Req {specs.requiredDeltaV.toLocaleString()})
                        </span>
                      </span>
                      <span>
                        TWR:{' '}
                        <strong
                          className={
                            specs.thrustToWeightRatio >= 1.05
                              ? 'text-cyan-300'
                              : 'text-rose-400'
                          }
                        >
                          {specs.thrustToWeightRatio}
                        </strong>
                      </span>
                      <span>
                        MASS:{' '}
                        <strong className="text-slate-200">
                          {(specs.wetMassKg / 1000).toFixed(1)}t
                        </strong>
                      </span>
                      <span>
                        COST:{' '}
                        <strong
                          className={
                            specs.isWithinBudget ? 'text-amber-400' : 'text-rose-400'
                          }
                        >
                          ${specs.totalCostM}M
                        </strong>
                      </span>
                    </div>
                  </div>

                  {builderTab === 'propulsion' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label
                          htmlFor="select-rocket"
                          className="block font-mono text-[11px] text-slate-400 mb-1"
                        >
                          LAUNCH VEHICLE CHASSIS
                        </label>
                        <select
                          id="select-rocket"
                          value={config.rocketId}
                          onChange={(e) => onUpdateConfig({ rocketId: e.target.value })}
                          className="w-full bg-[#111827] border border-slate-700 rounded px-2.5 py-2 text-slate-100 font-mono text-xs cursor-pointer"
                        >
                          {ROCKET_CHASSIS_CATALOG.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name} (${r.costM}M · {(r.fuelCapacityKg / 1000).toFixed(0)}t)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="select-engine"
                          className="block font-mono text-[11px] text-slate-400 mb-1"
                        >
                          UPPER-STAGE PROPULSION ENGINE
                        </label>
                        <select
                          id="select-engine"
                          value={config.engineId}
                          onChange={(e) => onUpdateConfig({ engineId: e.target.value })}
                          className="w-full bg-[#111827] border border-slate-700 rounded px-2.5 py-2 text-slate-100 font-mono text-xs cursor-pointer"
                        >
                          {ENGINE_CATALOG.map((eng) => (
                            <option key={eng.id} value={eng.id}>
                              {eng.name} (${eng.costM}M · Isp {eng.ispSeconds}s)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="slider-fuel"
                          className="flex justify-between font-mono text-[11px] text-slate-400 mb-1"
                        >
                          <span>PROPELLANT LOAD</span>
                          <span className="text-cyan-300 tabular-nums">{config.fuelLoadPct}%</span>
                        </label>
                        <input
                          id="slider-fuel"
                          type="range"
                          min={55}
                          max={100}
                          step={5}
                          value={config.fuelLoadPct}
                          onChange={(e) =>
                            onUpdateConfig({ fuelLoadPct: Number(e.target.value) })
                          }
                          className="w-full accent-cyan-400 cursor-pointer mt-1"
                        />
                      </div>
                    </div>
                  )}

                  {builderTab === 'systems' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      <div>
                        <label
                          htmlFor="select-power"
                          className="block font-mono text-[11px] text-slate-400 mb-1"
                        >
                          POWER &amp; ECLSS LIFE SUPPORT
                        </label>
                        <select
                          id="select-power"
                          value={config.powerId}
                          onChange={(e) => onUpdateConfig({ powerId: e.target.value })}
                          className="w-full bg-[#111827] border border-slate-700 rounded px-2.5 py-2 text-slate-100 font-mono text-xs cursor-pointer"
                        >
                          {POWER_SYSTEM_CATALOG.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} (${p.costM}M · {p.powerOutputKw} kWe)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="select-payload"
                          className="block font-mono text-[11px] text-slate-400 mb-1"
                        >
                          MISSION PAYLOAD &amp; SCIENCE SUITE
                        </label>
                        <select
                          id="select-payload"
                          value={config.payloadId}
                          onChange={(e) => onUpdateConfig({ payloadId: e.target.value })}
                          className="w-full bg-[#111827] border border-slate-700 rounded px-2.5 py-2 text-slate-100 font-mono text-xs cursor-pointer"
                        >
                          {PAYLOAD_CATALOG.map((pl) => (
                            <option key={pl.id} value={pl.id}>
                              {pl.name} (${pl.costM}M · {pl.scienceMultiplier}x Sci)
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="slider-shield"
                          className="flex justify-between font-mono text-[11px] text-slate-400 mb-1"
                        >
                          <span>MMOD RADIATION SHIELDING</span>
                          <span className="text-cyan-300 tabular-nums">
                            Tier {config.shieldReinforcement}
                          </span>
                        </label>
                        <input
                          id="slider-shield"
                          type="range"
                          min={0}
                          max={3}
                          step={1}
                          value={config.shieldReinforcement}
                          onChange={(e) =>
                            onUpdateConfig({ shieldReinforcement: Number(e.target.value) })
                          }
                          className="w-full accent-cyan-400 cursor-pointer mt-1"
                        />
                      </div>
                    </div>
                  )}

                  {builderTab === 'trajectory' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div>
                        <label
                          htmlFor="select-window"
                          className="block font-mono text-[11px] text-slate-400 mb-1"
                        >
                          PLANETARY LAUNCH WINDOW
                        </label>
                        <select
                          id="select-window"
                          value={config.launchWindowId}
                          onChange={(e) => onUpdateConfig({ launchWindowId: e.target.value })}
                          className="w-full bg-[#111827] border border-slate-700 rounded px-2.5 py-2 text-slate-100 font-mono text-xs cursor-pointer"
                        >
                          {LAUNCH_WINDOWS.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name} (Δv ×{w.deltaVModifier} · Time ×{w.timeModifier})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="select-trajectory"
                          className="block font-mono text-[11px] text-slate-400 mb-1"
                        >
                          ORBITAL TRAJECTORY PROFILE
                        </label>
                        <select
                          id="select-trajectory"
                          value={config.trajectoryId}
                          onChange={(e) => onUpdateConfig({ trajectoryId: e.target.value })}
                          className="w-full bg-[#111827] border border-slate-700 rounded px-2.5 py-2 text-slate-100 font-mono text-xs cursor-pointer"
                        >
                          {TRAJECTORY_OPTIONS.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} (Δv ×{t.deltaVModifier} · Duration ×{t.durationMultiplier})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                    <div className="text-xs font-mono">
                      {readiness.blockers.length > 0 ? (
                        <span className="text-rose-400">✖ {readiness.blockers[0]}</span>
                      ) : readiness.warnings.length > 0 ? (
                        <span className="text-amber-400">▲ {readiness.warnings[0]}</span>
                      ) : (
                        <span className="text-emerald-400">
                          ● FLIGHT READINESS VERIFIED · EST. TRANSIT {specs.estimatedTransitHours}h
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onToggleSimMode('astronaut_eva');
                        }}
                        className="px-4 py-2.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400 text-emerald-300 font-display font-bold text-xs tracking-wider uppercase cursor-pointer whitespace-nowrap"
                      >
                        Walk Astronaut on Pad [V]
                      </button>

                      <button
                        type="button"
                        disabled={!readiness.canLaunch}
                        onClick={(e) => {
                          e.currentTarget.blur();
                          onInitiateLaunch();
                        }}
                        className={`px-6 py-2.5 rounded font-display font-bold text-xs tracking-wider uppercase transition-colors whitespace-nowrap ${
                          readiness.canLaunch
                            ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 cursor-pointer shadow-[0_0_20px_rgba(6,182,212,0.35)]'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        Launch Rocket (Countdown)
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* ACTIVE FLIGHT CONTROL DECK */
                <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2">
                  <div className="flex flex-wrap lg:flex-nowrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onToggleBurn();
                      }}
                      className={`px-3 py-2 rounded font-display font-semibold text-xs uppercase tracking-wider border cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                        activeBurn
                          ? 'bg-cyan-500 text-slate-950 border-cyan-300'
                          : 'bg-[#111827] text-slate-200 border-slate-700 hover:border-cyan-400'
                      }`}
                    >
                      {activeBurn ? '● Burn Active [Space]' : 'Thruster Burn [Space]'}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onToggleShield();
                      }}
                      className={`px-3 py-2 rounded font-display font-semibold text-xs uppercase tracking-wider border cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                        shieldActive
                          ? 'bg-amber-500 text-slate-950 border-amber-300'
                          : 'bg-[#111827] text-slate-200 border-slate-700 hover:border-amber-400'
                      }`}
                    >
                      {shieldActive ? '● Shield On [E]' : 'Shield [E]'}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onToggleScan();
                      }}
                      className={`px-3 py-2 rounded font-display font-semibold text-xs uppercase tracking-wider border cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                        scanning
                          ? 'bg-purple-500 text-slate-950 border-purple-300'
                          : 'bg-[#111827] text-slate-200 border-slate-700 hover:border-purple-400'
                      }`}
                    >
                      {scanning ? '● Radar Active [F]' : 'Scanner [F]'}
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onToggleSimMode('astronaut_eva');
                      }}
                      className="px-3 py-2 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400 text-emerald-300 font-display font-semibold text-xs uppercase cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Deploy Astronaut EVA [V]
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onTriggerChallenge();
                      }}
                      className="px-3 py-2 rounded bg-[#111827] hover:bg-slate-800 border border-slate-700 text-slate-300 font-mono text-xs cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Simulate Anomaly
                    </button>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="hidden xl:flex items-center gap-3 text-xs font-mono tabular-nums text-slate-400 whitespace-nowrap">
                      <span>
                        VEL:{' '}
                        <strong className="text-slate-100">{telemetry.velocityKms} km/s</strong>
                      </span>
                      <span>
                        NODES:{' '}
                        <strong className="text-cyan-300">{telemetry.waypointsCollected}</strong>
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onAdvancePhaseOrComplete();
                      }}
                      className="px-4 py-2 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer whitespace-nowrap shrink-0"
                    >
                      {telemetry.phase === 'objective'
                        ? 'Complete Mission & Return Data'
                        : 'Execute Next Burn Stage →'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
