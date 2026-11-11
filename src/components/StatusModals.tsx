import React, { useState } from 'react';
import {
  AchievementBadge,
  DifficultyLevel,
  LeaderboardEntry,
  MissionModeConfig,
  MissionScoreBreakdown,
  TelemetryState,
} from '../game/types';

interface PauseModalProps {
  isOpen: boolean;
  mode: MissionModeConfig;
  telemetry: TelemetryState;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
  onOpenLearning: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  isOpen,
  mode,
  telemetry,
  onResume,
  onRestart,
  onReturnTitle,
  onOpenLearning,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mission Paused"
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/75 pointer-events-auto"
    >
      <div className="w-full max-w-md bg-[#0B0E17] border border-slate-700 rounded-lg p-6 space-y-5 shadow-2xl">
        <div className="border-b border-slate-800 pb-3">
          <div className="text-xs font-mono text-cyan-400 uppercase">
            SIMULATION STANDBY · TELEMETRY FROZEN
          </div>
          <h2 className="text-xl font-display font-bold text-slate-100 mt-0.5">
            {mode.name} — Paused
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-3 bg-[#111827] border border-slate-800 rounded p-3 text-center font-mono tabular-nums">
          <div>
            <span className="text-[10px] text-slate-400 block">PROGRESS</span>
            <span className="text-base font-bold text-cyan-300">
              {Math.round(telemetry.progressPct)}%
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block">PROPELLANT</span>
            <span className="text-base font-bold text-amber-400">
              {Math.round(telemetry.fuelPct)}%
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-400 block">SCIENCE</span>
            <span className="text-base font-bold text-purple-300">
              {Math.round(telemetry.scienceDataPoints)}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full py-3 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-sm uppercase tracking-wider cursor-pointer"
          >
            Resume Mission [Esc / P]
          </button>
          <button
            type="button"
            onClick={onOpenLearning}
            className="w-full py-2.5 rounded bg-[#111827] hover:bg-slate-800 border border-slate-700 text-slate-200 font-display font-semibold text-xs uppercase tracking-wider cursor-pointer"
          >
            Space Science Learning Center
          </button>
          <button
            type="button"
            onClick={onRestart}
            className="w-full py-2.5 rounded bg-[#111827] hover:bg-slate-800 border border-slate-700 text-slate-200 font-display font-semibold text-xs uppercase tracking-wider cursor-pointer"
          >
            Restart Mission Assembly
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="w-full py-2.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 font-display font-semibold text-xs uppercase tracking-wider cursor-pointer"
          >
            Return to Title Screen
          </button>
        </div>
      </div>
    </div>
  );
};

interface OutcomeModalProps {
  isOpen: boolean;
  mode: MissionModeConfig;
  difficulty: DifficultyLevel;
  telemetrySnapshot: TelemetryState;
  scoreBreakdown: MissionScoreBreakdown;
  bestScore: number;
  directorName: string;
  onChangeDirectorName: (name: string) => void;
  onPlayAgain: () => void;
  onNextMission: () => void;
  onReturnTitle: () => void;
}

export const OutcomeModal: React.FC<OutcomeModalProps> = ({
  isOpen,
  mode,
  difficulty,
  telemetrySnapshot,
  scoreBreakdown,
  bestScore,
  directorName,
  onChangeDirectorName,
  onPlayAgain,
  onNextMission,
  onReturnTitle,
}) => {
  const [showCertificate, setShowCertificate] = useState(false);

  if (!isOpen) return null;

  const isVictory = scoreBreakdown.victory;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isVictory ? 'Mission Accomplished' : 'Mission Aborted'}
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/80 pointer-events-auto overflow-y-auto"
    >
      <div className="w-full max-w-2xl bg-[#0B0E17] border border-slate-700 rounded-lg p-6 space-y-5 shadow-2xl my-auto">
        {/* Top Outcome Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <div
              className={`text-xs font-mono uppercase font-bold ${
                isVictory ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isVictory
                ? '● NASA MISSION TELEMETRY VERIFIED · SUCCESS'
                : '✖ MISSION CONTINGENCY ABORT · DEFEAT'}
            </div>
            <h2 className="text-2xl font-display font-bold text-slate-100 mt-0.5">
              {isVictory ? `${mode.name} Accomplished` : `${mode.name} Aborted`}
            </h2>
            {!isVictory && scoreBreakdown.failureReason && (
              <p className="text-xs text-rose-300 mt-1">{scoreBreakdown.failureReason}</p>
            )}
          </div>

          <div className="text-right font-mono tabular-nums">
            <span className="text-[10px] text-slate-400 block">FINAL MISSION SCORE</span>
            <span className="text-3xl font-bold text-cyan-300">
              {scoreBreakdown.totalScore.toLocaleString()}
            </span>
            <span className="text-[11px] text-slate-400 block">
              BEST: {Math.max(bestScore, scoreBreakdown.totalScore).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Toggle Certificate View vs Telemetry Score Breakdown */}
        {isVictory && showCertificate ? (
          <div className="bg-[#07090E] border-2 border-cyan-500/80 rounded-lg p-6 space-y-4 text-center relative">
            <div className="text-xs font-mono tracking-widest text-cyan-400 uppercase">
              NATIONAL AERONAUTICS &amp; SPACE EXPLORATION SIMULATION DIRECTORATE
            </div>
            <h3 className="text-2xl font-display font-bold text-slate-100 tracking-wide">
              OFFICIAL MISSION COMPLETION CERTIFICATE
            </h3>
            <p className="text-xs text-slate-400">
              This certifies that Flight Mission Director
            </p>
            <div className="max-w-xs mx-auto">
              <input
                type="text"
                aria-label="Flight Director Name"
                value={directorName}
                onChange={(e) => onChangeDirectorName(e.target.value)}
                className="w-full text-center bg-[#111827] border border-cyan-500/50 rounded px-3 py-1.5 text-lg font-display font-bold text-amber-300"
              />
            </div>
            <p className="text-xs text-slate-300 max-w-lg mx-auto leading-relaxed">
              has successfully planned, engineered, launched, and completed the{' '}
              <strong className="text-slate-100">{mode.name}</strong> ({mode.subtitle}) to{' '}
              <strong className="text-cyan-300">{mode.targetBody}</strong> on{' '}
              <strong className="uppercase">{difficulty}</strong> clearance with a verified rank of{' '}
              <strong className="text-emerald-400">{scoreBreakdown.rankTitle}</strong>.
            </p>
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-xs font-mono tabular-nums">
              <div>
                <span className="text-slate-500 block">FINAL SCORE</span>
                <span className="text-slate-100 font-bold">
                  {scoreBreakdown.totalScore.toLocaleString()} PTS
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">CREW SAFETY</span>
                <span className="text-emerald-400 font-bold">
                  {Math.round(telemetrySnapshot.crewSafetyPct)}%
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">DATE ISSUED</span>
                <span className="text-slate-100 font-bold">2026-11-10</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 3 Primary Mastery / Progress Stat Tiles */}
            <div className="grid grid-cols-3 gap-3 bg-[#111827] border border-slate-800 rounded p-3.5 text-center font-mono tabular-nums">
              <div>
                <span className="text-[10px] text-slate-400 block">
                  {isVictory ? 'DIRECTOR RANK' : 'PROGRESS REACHED'}
                </span>
                <span className="text-sm font-bold text-cyan-300">
                  {isVictory
                    ? scoreBreakdown.rankTitle
                    : `${Math.round(telemetrySnapshot.progressPct)}% (${telemetrySnapshot.distanceFromDestKm.toLocaleString()} km left)`}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">FUEL / HULL HEALTH</span>
                <span className="text-sm font-bold text-emerald-400">
                  {Math.round(telemetrySnapshot.fuelPct)}% Fuel ·{' '}
                  {Math.round(telemetrySnapshot.healthPct)}% Hull
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 block">TRANSIT TIME</span>
                <span className="text-sm font-bold text-amber-300">
                  T+{Math.round(telemetrySnapshot.travelTimeHours)} Hours
                </span>
              </div>
            </div>

            {/* Detailed 6-Factor Score Breakdown */}
            <div className="bg-[#111827] border border-slate-800 rounded p-4 space-y-2 text-xs font-mono tabular-nums">
              <div className="text-slate-400 uppercase text-[11px] pb-1 border-b border-slate-800">
                NASA Evaluation &amp; Telemetry Score Breakdown
              </div>
              <div className="flex justify-between">
                <span>1. Mission Objective Completion:</span>
                <span className="text-slate-100">+{scoreBreakdown.missionSuccessPts} pts</span>
              </div>
              <div className="flex justify-between">
                <span>2. Congressional Budget Efficiency:</span>
                <span className="text-amber-300">+{scoreBreakdown.budgetEfficiencyPts} pts</span>
              </div>
              <div className="flex justify-between">
                <span>3. Propellant &amp; Delta-V Efficiency:</span>
                <span className="text-cyan-300">+{scoreBreakdown.fuelEfficiencyPts} pts</span>
              </div>
              <div className="flex justify-between">
                <span>4. Crew Safety &amp; Hull Preservation:</span>
                <span className="text-emerald-400">+{scoreBreakdown.crewSafetyPts} pts</span>
              </div>
              <div className="flex justify-between">
                <span>5. Scientific Discoveries &amp; Samples:</span>
                <span className="text-purple-300">
                  +{scoreBreakdown.scientificDiscoveryPts} pts
                </span>
              </div>
              <div className="flex justify-between">
                <span>6. Launch Window &amp; Time Management:</span>
                <span className="text-slate-200">+{scoreBreakdown.timeManagementPts} pts</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-slate-800 font-bold text-sm">
                <span>Difficulty Multiplier ({scoreBreakdown.difficultyMultiplier}x):</span>
                <span className="text-cyan-300">
                  {scoreBreakdown.totalScore.toLocaleString()} PTS TOTAL
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-start="true"
              onClick={onPlayAgain}
              className="px-5 py-2.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
            >
              {isVictory ? 'Replay Mission' : 'Try Again [Enter]'}
            </button>

            {isVictory && (
              <button
                type="button"
                onClick={onNextMission}
                className="px-4 py-2.5 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                Next Destination →
              </button>
            )}

            {isVictory && (
              <button
                type="button"
                onClick={() => setShowCertificate((v) => !v)}
                className="px-4 py-2.5 rounded bg-[#111827] hover:bg-slate-800 border border-cyan-500/60 text-cyan-300 font-display font-semibold text-xs uppercase tracking-wider cursor-pointer"
              >
                {showCertificate ? 'View Score Breakdown' : 'View NASA Certificate'}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onReturnTitle}
            className="px-4 py-2.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 font-display font-semibold text-xs uppercase tracking-wider cursor-pointer"
          >
            Title Screen
          </button>
        </div>
      </div>
    </div>
  );
};

interface AchievementsModalProps {
  isOpen: boolean;
  badges: AchievementBadge[];
  leaderboard: LeaderboardEntry[];
  onClose: () => void;
}

export const AchievementsModal: React.FC<AchievementsModalProps> = ({
  isOpen,
  badges,
  leaderboard,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Achievements and Leaderboard"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 pointer-events-auto"
    >
      <div className="w-full max-w-3xl max-h-[86vh] bg-[#0B0E17] border border-slate-700 rounded-lg flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#111827]">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-100">
              FLIGHT DIRECTOR COMMENDATIONS &amp; HALL OF FAME
            </h2>
            <p className="text-xs font-mono text-cyan-400">
              Persistent Mission Records &amp; Unlocked Aerospace Badges
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono cursor-pointer"
          >
            Close [Esc]
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Badges Grid */}
          <div>
            <h3 className="text-xs font-mono text-slate-400 uppercase mb-3">
              AEROSPACE ACHIEVEMENT MEDALS ({badges.filter((b) => b.unlocked).length}/{badges.length} UNLOCKED)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {badges.map((b) => (
                <div
                  key={b.id}
                  className={`p-3.5 rounded border ${
                    b.unlocked
                      ? 'bg-[#111827] border-cyan-400/80 text-slate-100'
                      : 'bg-[#07090E] border-slate-800 text-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-display font-bold">{b.name}</span>
                    <span className="text-[10px] font-mono">
                      {b.unlocked ? '★ UNLOCKED' : 'LOCKED'}
                    </span>
                  </div>
                  <p className="text-[11px] mt-1 leading-relaxed">{b.description}</p>
                  <div className="text-[10px] font-mono text-cyan-400/80 mt-2">
                    {b.criteria}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Leaderboard Table */}
          <div>
            <h3 className="text-xs font-mono text-slate-400 uppercase mb-3">
              MISSION CONTROL LEADERBOARD
            </h3>
            <div className="bg-[#111827] border border-slate-800 rounded overflow-hidden">
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-[#07090E]">
                    <th className="py-2.5 px-4">RANK</th>
                    <th className="py-2.5 px-4">DIRECTOR</th>
                    <th className="py-2.5 px-4">MISSION</th>
                    <th className="py-2.5 px-4">CLEARANCE</th>
                    <th className="py-2.5 px-4 text-right">SCORE</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard.map((entry, idx) => (
                    <tr key={entry.id} className="border-b border-slate-800/60">
                      <td className="py-2.5 px-4 text-cyan-400 font-bold">#{idx + 1}</td>
                      <td className="py-2.5 px-4 text-slate-100">{entry.directorName}</td>
                      <td className="py-2.5 px-4 text-slate-300">{entry.missionName}</td>
                      <td className="py-2.5 px-4 uppercase text-amber-300">
                        {entry.difficulty}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-emerald-400">
                        {entry.score.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
