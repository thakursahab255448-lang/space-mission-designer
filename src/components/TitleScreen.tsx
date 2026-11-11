import React from 'react';
import {
  DifficultyLevel,
  MissionModeId,
} from '../game/types';
import {
  DIFFICULTY_SETTINGS,
  MISSION_MODES,
} from '../game/rules';

interface TitleScreenProps {
  selectedMode: MissionModeId;
  selectedDifficulty: DifficultyLevel;
  onSelectMode: (mode: MissionModeId) => void;
  onSelectDifficulty: (diff: DifficultyLevel) => void;
  onStartMission: () => void;
  onOpenLearningCenter: () => void;
  onOpenAchievements: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  selectedMode,
  selectedDifficulty,
  onSelectMode,
  onSelectDifficulty,
  onStartMission,
  onOpenLearningCenter,
  onOpenAchievements,
}) => {
  const activeMode =
    MISSION_MODES.find((m) => m.id === selectedMode) || MISSION_MODES[0];
  const activeDiff = DIFFICULTY_SETTINGS[selectedDifficulty];
  const adjustedBudget = Math.round(activeMode.baseBudgetM * activeDiff.budgetMultiplier);

  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-6 md:p-10"
      style={{
        background:
          'linear-gradient(90deg, rgba(7,9,14,0.92) 0%, rgba(7,9,14,0.72) 48%, rgba(7,9,14,0.15) 100%)',
      }}
    >
      {/* Main Asymmetric Left Split over Calm Negative Space */}
      <div className="w-full max-w-[740px] pointer-events-auto flex flex-col gap-5 my-auto">
        {/* Bespoke Inline SVG Title Emblem Lockup */}
        <div className="flex flex-col gap-1">
          <svg
            viewBox="0 0 620 112"
            className="w-full max-w-[580px] h-auto select-none"
            role="img"
            aria-label="Space Mission Designer: Beyond the Universe"
          >
            {/* Outer Orbital Arc & Vector Crosshairs */}
            <path
              d="M 14 82 Q 290 12 600 68"
              fill="none"
              stroke="#06B6D4"
              strokeWidth="1.5"
              strokeDasharray="6 4"
              opacity="0.55"
            />
            <circle cx="52" cy="54" r="36" fill="#0B0E17" stroke="#06B6D4" strokeWidth="2" />
            <circle cx="52" cy="54" r="26" fill="none" stroke="#A855F7" strokeWidth="1.2" strokeDasharray="4 3" />
            {/* Stylized Spacecraft / Delta Vector Emblem */}
            <polygon
              points="52,22 68,74 52,63 36,74"
              fill="#22D3EE"
              stroke="#F8FAFC"
              strokeWidth="1.5"
            />
            <circle cx="52" cy="50" r="4" fill="#F59E0B" />

            {/* Primary Display Typography Lockup */}
            <text
              x="104"
              y="48"
              fill="#F8FAFC"
              fontFamily="'Chakra Petch', sans-serif"
              fontWeight="700"
              fontSize="31"
              letterSpacing="1.5"
            >
              SPACE MISSION DESIGNER
            </text>
            <text
              x="106"
              y="76"
              fill="#22D3EE"
              fontFamily="'Chakra Petch', sans-serif"
              fontWeight="600"
              fontSize="16"
              letterSpacing="4.5"
            >
              BEYOND THE UNIVERSE · NASA SIMULATOR
            </text>
            <line x1="106" y1="88" x2="585" y2="88" stroke="#1E293B" strokeWidth="1.5" />
          </svg>
        </div>

        {/* 1. Mission Destination Mode Selector (5 Playable Modes) */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>01. SELECT MISSION ARCHITECTURE</span>
            <span>
              TARGET: <strong className="text-cyan-300">{activeMode.targetBody}</strong>
            </span>
          </div>

          <div
            role="radiogroup"
            aria-label="Mission Mode Selection"
            className="grid grid-cols-1 sm:grid-cols-5 gap-2"
          >
            {MISSION_MODES.map((m) => {
              const isSelected = m.id === selectedMode;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelectMode(m.id)}
                  className={`text-left px-2.5 py-2.5 rounded border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#111827] border-cyan-400 text-slate-100 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                      : 'bg-[#0B0E17]/90 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  <div className="text-[11px] font-display font-semibold tracking-wide text-slate-100 whitespace-nowrap truncate">
                    {m.name}
                  </div>
                  <div className="text-[11px] font-mono text-cyan-400 mt-0.5 tabular-nums">
                    Δv {m.requiredDeltaV.toLocaleString()} m/s
                  </div>
                </button>
              );
            })}
          </div>

          {/* Active Mission Briefing Strip */}
          <div className="bg-[#0B0E17]/95 border border-slate-800 rounded p-3.5 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-display font-semibold text-slate-100">
                {activeMode.subtitle}
              </span>
              <span className="text-xs font-mono text-slate-400">
                {activeMode.nasaInspiration}
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {activeMode.description}
            </p>
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-800/80 text-xs font-mono tabular-nums">
              <div>
                <span className="text-slate-400 block text-[10px]">DISTANCE</span>
                <span className="text-slate-100 font-semibold">
                  {activeMode.distanceKm.toLocaleString()} km
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">REQ. DELTA-V</span>
                <span className="text-cyan-300 font-semibold">
                  {activeMode.requiredDeltaV.toLocaleString()} m/s
                </span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px]">MISSION BUDGET</span>
                <span className="text-amber-400 font-semibold">${adjustedBudget}M USD</span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Difficulty Level Selector */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400">
            <span>02. FLIGHT DIRECTOR CLEARANCE LEVEL</span>
            <span className="text-cyan-300 tabular-nums">
              SCORE MULTIPLIER: {activeDiff.scoreMultiplier}x
            </span>
          </div>
          <div
            role="radiogroup"
            aria-label="Difficulty Selection"
            className="grid grid-cols-3 gap-2"
          >
            {(['beginner', 'intermediate', 'expert'] as DifficultyLevel[]).map((lvl) => {
              const cfg = DIFFICULTY_SETTINGS[lvl];
              const isSelected = selectedDifficulty === lvl;
              return (
                <button
                  key={lvl}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => onSelectDifficulty(lvl)}
                  className={`px-3 py-2 rounded border text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#111827] border-cyan-400 text-slate-100'
                      : 'bg-[#0B0E17]/90 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-display font-semibold whitespace-nowrap truncate">
                    {cfg.label}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                    Budget {Math.round(cfg.budgetMultiplier * 100)}%
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Primary Start CTA & <= 3 Menu Actions Total */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStartMission();
            }}
            className="flex-1 min-w-[220px] py-3.5 px-6 rounded bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-300 text-slate-950 font-display font-bold text-base tracking-wider uppercase transition-colors cursor-pointer shadow-[0_0_24px_rgba(6,182,212,0.35)] whitespace-nowrap"
          >
            Enter Mission Control [Enter]
          </button>

          <button
            type="button"
            onClick={onOpenLearningCenter}
            className="py-3.5 px-4 rounded bg-[#111827] hover:bg-slate-800 border border-slate-700 text-slate-200 font-display font-semibold text-xs tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap"
          >
            Space Science Lab
          </button>

          <button
            type="button"
            onClick={onOpenAchievements}
            className="py-3.5 px-4 rounded bg-[#111827] hover:bg-slate-800 border border-slate-700 text-slate-200 font-display font-semibold text-xs tracking-wider uppercase transition-colors cursor-pointer whitespace-nowrap"
          >
            Badges & Records
          </button>
        </div>
      </div>

      {/* Single Flat Borderless Control-Hint Line in Bottom Safe Margin */}
      <div className="w-full flex items-center justify-between text-xs font-mono text-slate-200 hud-stroke pointer-events-none pt-2">
        <span>
          WASD / Arrows Steer &amp; Attitude · Space Burn / Action · C Camera · H Dock · Esc Pause
        </span>
        <span className="hidden sm:inline text-cyan-200">
          NASA SPACE APPS 2026 EDITION · REAL TSIOLKOVSKY ORBITAL PHYSICS
        </span>
      </div>
    </div>
  );
};
