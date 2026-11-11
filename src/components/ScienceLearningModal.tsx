import React, { useState } from 'react';
import {
  calculateHohmannTransfer,
  calculateTsiolkovskyDeltaV,
  ENGINE_CATALOG,
  MISSION_MODES,
  POWER_SYSTEM_CATALOG,
} from '../game/rules';

interface ScienceLearningModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type LearningTab = 'rocket' | 'planets' | 'orbital' | 'tech' | 'nasa';

export const ScienceLearningModal: React.FC<ScienceLearningModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<LearningTab>('rocket');

  // Interactive Tsiolkovsky Calculator state
  const [isp, setIsp] = useState<number>(452);
  const [wetMass, setWetMass] = useState<number>(65000);
  const [dryMass, setDryMass] = useState<number>(12500);

  // Interactive Hohmann Transfer Calculator state
  const [r1AltKm, setR1AltKm] = useState<number>(400); // LEO altitude
  const [r2AltKm, setR2AltKm] = useState<number>(35786); // GEO altitude

  if (!isOpen) return null;

  const computedDv = calculateTsiolkovskyDeltaV(isp, wetMass, dryMass);
  const massRatio = dryMass > 0 ? (wetMass / dryMass).toFixed(2) : '0.00';

  const earthRadiusKm = 6378.14;
  const hohmann = calculateHohmannTransfer(
    earthRadiusKm + r1AltKm,
    earthRadiusKm + r2AltKm
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Space Science Learning Center"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/80 pointer-events-auto"
    >
      <div className="w-full max-w-4xl max-h-[88vh] bg-[#0B0E17] border border-slate-700 rounded-lg flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#111827]">
          <div>
            <h2 className="text-lg font-display font-bold text-slate-100 tracking-wide">
              SPACE SCIENCE &amp; AEROSPACE ENGINEERING CENTER
            </h2>
            <p className="text-xs font-mono text-cyan-400">
              Interactive Physics Calculators · Real NASA Telemetry vs. Simulation Models
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

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 py-2.5 bg-[#07090E] border-b border-slate-800 overflow-x-auto">
          {(
            [
              { id: 'rocket', label: '01. Rocket Science (Δv Lab)' },
              { id: 'orbital', label: '02. Orbital Mechanics (Hohmann)' },
              { id: 'planets', label: '03. Planetary Data' },
              { id: 'tech', label: '04. Spacecraft Tech' },
              { id: 'nasa', label: '05. NASA Mission Archives' },
            ] as { id: LearningTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3.5 py-2 rounded text-xs font-display font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === t.id
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6 text-sm text-slate-300">
          {activeTab === 'rocket' && (
            <div className="space-y-5">
              <div className="bg-[#111827] border border-slate-800 rounded p-4 space-y-2">
                <h3 className="text-base font-display font-semibold text-slate-100">
                  The Tsiolkovsky Rocket Equation
                </h3>
                <p className="text-xs leading-relaxed text-slate-300">
                  Derived by Konstantin Tsiolkovsky in 1903, this fundamental equation governs all spacecraft propulsion. A rocket’s maximum change in velocity (<strong>Δv</strong>) depends linearly on engine exhaust velocity (<strong>Isp × g₀</strong>) and logarithmically on the ratio of initial wet mass (<strong>m₀</strong>) to final dry mass (<strong>mf</strong>):
                </p>
                <div className="py-2 px-4 bg-[#07090E] border border-slate-800 rounded font-mono text-cyan-300 text-center text-base">
                  Δv = Isp · g₀ · ln(m₀ / mf) &nbsp;&nbsp;|&nbsp;&nbsp; g₀ = 9.80665 m/s²
                </div>
              </div>

              {/* Interactive Calculator */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#111827] border border-slate-800 rounded p-4 space-y-4">
                  <div className="text-xs font-mono text-amber-400 uppercase">
                    Interactive Propulsion Sandbox
                  </div>

                  <div>
                    <label className="flex justify-between text-xs font-mono mb-1">
                      <span>Specific Impulse (Isp):</span>
                      <span className="text-cyan-300 tabular-nums">{isp} seconds</span>
                    </label>
                    <input
                      type="range"
                      min={280}
                      max={1200}
                      step={10}
                      value={isp}
                      onChange={(e) => setIsp(Number(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                    <div className="flex justify-between text-[11px] font-mono text-slate-500">
                      <span>280s (Solid)</span>
                      <span>452s (Hydrolox)</span>
                      <span>850s (Nuclear)</span>
                      <span>1150s (Ion)</span>
                    </div>
                  </div>

                  <div>
                    <label className="flex justify-between text-xs font-mono mb-1">
                      <span>Initial Wet Mass (m₀ - with fuel):</span>
                      <span className="text-cyan-300 tabular-nums">
                        {wetMass.toLocaleString()} kg
                      </span>
                    </label>
                    <input
                      type="range"
                      min={20000}
                      max={120000}
                      step={1000}
                      value={wetMass}
                      onChange={(e) =>
                        setWetMass(Math.max(dryMass + 1000, Number(e.target.value)))
                      }
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="flex justify-between text-xs font-mono mb-1">
                      <span>Dry Structure + Payload Mass (mf):</span>
                      <span className="text-cyan-300 tabular-nums">
                        {dryMass.toLocaleString()} kg
                      </span>
                    </label>
                    <input
                      type="range"
                      min={5000}
                      max={45000}
                      step={500}
                      value={dryMass}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setDryMass(val);
                        if (wetMass <= val) setWetMass(val + 5000);
                      }}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="bg-[#111827] border border-slate-800 rounded p-4 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-mono text-slate-400">
                      CALCULATED SINGLE-STAGE DELTA-V
                    </div>
                    <div className="text-3xl font-mono font-bold text-cyan-400 mt-1 tabular-nums">
                      {computedDv.toLocaleString()} <span className="text-xs text-slate-400">m/s</span>
                    </div>
                    <div className="text-xs font-mono text-slate-400 mt-2 tabular-nums">
                      Mass Ratio (m₀/mf): <strong className="text-slate-100">{massRatio}</strong> · Exhaust Vel:{' '}
                      <strong className="text-slate-100">{Math.round(isp * 9.80665)} m/s</strong>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-4 border-t border-slate-800 text-xs font-mono">
                    <div className="text-slate-400">BENCHMARK THRESHOLDS:</div>
                    <div className="flex justify-between">
                      <span>Geostationary Transfer:</span>
                      <span className={computedDv >= 4300 ? 'text-emerald-400' : 'text-amber-400'}>
                        4,300 m/s {computedDv >= 4300 ? '✓ REACHABLE' : '✕ INSUFFICIENT'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Lunar South Pole Landing:</span>
                      <span className={computedDv >= 5900 ? 'text-emerald-400' : 'text-amber-400'}>
                        5,900 m/s {computedDv >= 5900 ? '✓ REACHABLE' : '✕ INSUFFICIENT'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Mars Interplanetary Capture:</span>
                      <span className={computedDv >= 7400 ? 'text-emerald-400' : 'text-amber-400'}>
                        7,400 m/s {computedDv >= 7400 ? '✓ REACHABLE' : '✕ INSUFFICIENT'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-[#111827] border border-slate-800 rounded p-4 text-xs space-y-1">
                <div className="font-mono text-cyan-300 font-semibold">
                  SIMULATION VS. REAL NASA MISSION CALCULATIONS
                </div>
                <p className="text-slate-300 leading-relaxed">
                  In real life, reaching Low Earth Orbit (LEO) alone requires ~9,400 m/s of Δv due to Earth’s deep gravity well and atmospheric drag. In this simulator, the first-stage booster separation is modeled with a 1.35× staging multiplier, focusing your mission budget on upper-stage trans-orbital injection, course correction, and planetary landing burns.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'orbital' && (
            <div className="space-y-5">
              <div className="bg-[#111827] border border-slate-800 rounded p-4 space-y-2">
                <h3 className="text-base font-display font-semibold text-slate-100">
                  Hohmann Transfer Orbits &amp; Kepler’s Third Law
                </h3>
                <p className="text-xs leading-relaxed text-slate-300">
                  Proposed by Walter Hohmann in 1925, a Hohmann Transfer is the most fuel-efficient two-impulse maneuver to move a spacecraft between two coplanar circular orbits. Burn 1 (<strong>Δv₁</strong>) injects the craft onto an elliptical transfer orbit; Burn 2 (<strong>Δv₂</strong>) circularizes the orbit at apogee.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#111827] border border-slate-800 rounded p-4 space-y-4">
                  <div className="text-xs font-mono text-amber-400 uppercase">
                    Interactive Earth Orbit Transfer Calculator
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-mono mb-1">
                      <span>Departure Orbit Altitude (r₁):</span>
                      <span className="text-cyan-300 tabular-nums">
                        {r1AltKm.toLocaleString()} km
                      </span>
                    </label>
                    <input
                      type="range"
                      min={200}
                      max={10000}
                      step={100}
                      value={r1AltKm}
                      onChange={(e) => setR1AltKm(Number(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="flex justify-between text-xs font-mono mb-1">
                      <span>Target Orbit Altitude (r₂):</span>
                      <span className="text-cyan-300 tabular-nums">
                        {r2AltKm.toLocaleString()} km
                      </span>
                    </label>
                    <input
                      type="range"
                      min={2000}
                      max={384400}
                      step={500}
                      value={r2AltKm}
                      onChange={(e) => setR2AltKm(Number(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </div>
                </div>

                <div className="bg-[#111827] border border-slate-800 rounded p-4 grid grid-cols-2 gap-3 font-mono tabular-nums">
                  <div>
                    <span className="text-[11px] text-slate-400 block">PERIGEE BURN (Δv₁)</span>
                    <span className="text-xl font-bold text-cyan-300">
                      {hohmann.deltaV1Ms.toLocaleString()} m/s
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">APOGEE BURN (Δv₂)</span>
                    <span className="text-xl font-bold text-amber-400">
                      {hohmann.deltaV2Ms.toLocaleString()} m/s
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">TOTAL TRANSFER Δv</span>
                    <span className="text-xl font-bold text-emerald-400">
                      {hohmann.totalDeltaVMs.toLocaleString()} m/s
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-400 block">COAST DURATION</span>
                    <span className="text-xl font-bold text-slate-100">
                      {hohmann.transferTimeHours} hrs
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'planets' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MISSION_MODES.map((m) => (
                <div
                  key={m.id}
                  className="bg-[#111827] border border-slate-800 rounded p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-display font-bold text-slate-100">
                      {m.targetBody}
                    </h3>
                    <span className="text-xs font-mono text-cyan-400 tabular-nums">
                      {m.distanceKm.toLocaleString()} km
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{m.description}</p>
                  <div className="pt-2 border-t border-slate-800 text-xs font-mono text-slate-400 flex justify-between tabular-nums">
                    <span>Req. Δv: {m.requiredDeltaV} m/s</span>
                    <span>Ref Orbit: {m.targetOrbitKm.toLocaleString()} km</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'tech' && (
            <div className="space-y-4">
              <h3 className="text-sm font-mono text-cyan-400 uppercase">
                Propulsion &amp; Power Subsystem Catalog
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ENGINE_CATALOG.map((eng) => (
                  <div
                    key={eng.id}
                    className="bg-[#111827] border border-slate-800 rounded p-3.5 space-y-1"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-display font-semibold text-slate-100">
                        {eng.name}
                      </span>
                      <span className="text-xs font-mono text-cyan-300 tabular-nums">
                        Isp: {eng.ispSeconds}s
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{eng.description}</p>
                  </div>
                ))}
                {POWER_SYSTEM_CATALOG.map((pwr) => (
                  <div
                    key={pwr.id}
                    className="bg-[#111827] border border-slate-800 rounded p-3.5 space-y-1"
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-display font-semibold text-slate-100">
                        {pwr.name}
                      </span>
                      <span className="text-xs font-mono text-amber-400 tabular-nums">
                        {pwr.powerOutputKw} kWe
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{pwr.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'nasa' && (
            <div className="space-y-3">
              {[
                {
                  mission: 'Apollo 11 & Artemis III Lunar Architecture',
                  year: '1969 / 2026+',
                  summary:
                    'Apollo 11 demonstrated Lunar Orbit Rendezvous (LOR). Artemis III targets the permanently shadowed craters of the Lunar South Pole to harvest water-ice for in-situ propellant production.',
                },
                {
                  mission: 'Mars 2020 Perseverance & Ingenuity',
                  year: '2021–Present',
                  summary:
                    'Used an autonomous Terrain-Relative Navigation (TRN) Sky-Crane descent to land in Jezero Crater, drilling ancient lakebed core samples for future return to Earth.',
                },
                {
                  mission: 'Europa Clipper Outer Planet Flagship',
                  year: '2024–2030',
                  summary:
                    'Performs 49 close flybys of Jupiter’s moon Europa using ice-penetrating radar and mass spectrometers to investigate the habitability of its subsurface liquid ocean.',
                },
                {
                  mission: 'Apollo 13 Cryogenic Oxygen Tank Contingency',
                  year: 'April 1970',
                  summary:
                    'After an oxygen tank explosion 321,860 km from Earth, NASA Flight Directors used the Lunar Module as a lifeboat and executed a free-return circumlunar trajectory home.',
                },
              ].map((item) => (
                <div
                  key={item.mission}
                  className="bg-[#111827] border border-slate-800 rounded p-4 space-y-1"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-display font-bold text-slate-100">
                      {item.mission}
                    </span>
                    <span className="text-xs font-mono text-cyan-400">{item.year}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">{item.summary}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
