/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AchievementBadge,
  AstronautEVAState,
  CameraViewMode,
  DifficultyLevel,
  GameState,
  LeaderboardEntry,
  MissionChallenge,
  MissionChallengeOption,
  MissionModeId,
  MissionScoreBreakdown,
  SimulationControlMode,
  SpacecraftConfiguration,
  TelemetryState,
} from './game/types';
import {
  calculateCraftSpecs,
  calculateMissionScore,
  createInitialAstronautState,
  INITIAL_BADGES,
  MISSION_CHALLENGES,
  MISSION_MODES,
  resolveMissionChallenge,
  SEED_LEADERBOARD,
  stepMissionTelemetry,
} from './game/rules';
import { soundEngine } from './game/audio';
import { SpaceSceneCanvas } from './game/SpaceSceneCanvas';
import { TitleScreen } from './components/TitleScreen';
import { HudOverlay } from './components/HudOverlay';
import { ScienceLearningModal } from './components/ScienceLearningModal';
import {
  AchievementsModal,
  OutcomeModal,
  PauseModal,
} from './components/StatusModals';

const STORAGE_KEY_SAVE = 'space_mission_designer_save_v1';

const DEFAULT_CONFIG_BY_MODE: Record<MissionModeId, SpacecraftConfiguration> = {
  moon: {
    rocketId: 'sls_block1b',
    engineId: 'rs25_hydrolox',
    powerId: 'rosa_solar',
    payloadId: 'artemis_lander',
    launchWindowId: 'optimal_synodic',
    trajectoryId: 'hohmann_transfer',
    fuelLoadPct: 90,
    shieldReinforcement: 1,
  },
  mars: {
    rocketId: 'sls_block1b',
    engineId: 'ntp_draco',
    powerId: 'mmrtg_isotope',
    payloadId: 'perseverance_rover',
    launchWindowId: 'optimal_synodic',
    trajectoryId: 'hohmann_transfer',
    fuelLoadPct: 95,
    shieldReinforcement: 1,
  },
  satellite: {
    rocketId: 'falcon_heavy',
    engineId: 'rs25_hydrolox',
    powerId: 'rosa_solar',
    payloadId: 'goes_satbus',
    launchWindowId: 'optimal_synodic',
    trajectoryId: 'hohmann_transfer',
    fuelLoadPct: 80,
    shieldReinforcement: 1,
  },
  deepspace: {
    rocketId: 'starship_superheavy',
    engineId: 'next_ion',
    powerId: 'kilopower_krusty',
    payloadId: 'europa_clipper_suite',
    launchWindowId: 'ballistic_capture',
    trajectoryId: 'gravity_assist',
    fuelLoadPct: 95,
    shieldReinforcement: 2,
  },
  rescue: {
    rocketId: 'vulcan_centaur',
    engineId: 'ntp_draco',
    powerId: 'mmrtg_isotope',
    payloadId: 'eva_rescue_pod',
    launchWindowId: 'fast_conjunction',
    trajectoryId: 'direct_burn',
    fuelLoadPct: 90,
    shieldReinforcement: 1,
  },
};

function createInitialTelemetry(
  modeId: MissionModeId,
  budgetRemainingM: number
): TelemetryState {
  const mode = MISSION_MODES.find((m) => m.id === modeId) || MISSION_MODES[0];
  return {
    phase: 'assembly',
    statusText: 'PRE-LAUNCH ASSEMBLY · Walk Astronaut [WASD] or Configure Rocket Launch',
    fuelPct: 100,
    healthPct: 100,
    crewSafetyPct: 100,
    oxygenPct: 100,
    powerPct: 100,
    budgetRemainingM,
    distanceFromDestKm: mode.distanceKm,
    totalDistanceKm: mode.distanceKm,
    travelTimeHours: 0,
    progressPct: 0,
    velocityKms: 0,
    altitudeKm: 0,
    scienceDataPoints: 0,
    objectivesCompleted: 0,
    totalObjectives: mode.objectives.length,
    countdownSeconds: 3,
    activeBurn: false,
    shieldActive: false,
    waypointsCollected: 0,
    hazardsAvoided: 0,
  };
}

export default function App() {
  const isAutostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  }, []);

  const [gameState, setGameState] = useState<GameState>(
    isAutostart ? 'playing' : 'title'
  );
  const [selectedMode, setSelectedMode] = useState<MissionModeId>('moon');
  const [selectedDifficulty, setSelectedDifficulty] =
    useState<DifficultyLevel>('intermediate');
  const [config, setConfig] = useState<SpacecraftConfiguration>(
    DEFAULT_CONFIG_BY_MODE.moon
  );

  // Default to astronaut_eva so the player immediately sees and controls the 3D Astronaut walking around!
  const [simMode, setSimMode] = useState<SimulationControlMode>('astronaut_eva');
  const [astronautState, setAstronautState] = useState<AstronautEVAState>(() =>
    createInitialAstronautState()
  );
  const [virtualInput, setVirtualInput] = useState({
    moveX: 0,
    moveZ: 0,
    jetpack: false,
    sprint: false,
    interactTrigger: 0,
    roverToggleTrigger: 0,
  });

  const specs = useMemo(
    () => calculateCraftSpecs(config, selectedMode, selectedDifficulty),
    [config, selectedMode, selectedDifficulty]
  );

  const [telemetry, setTelemetry] = useState<TelemetryState>(() =>
    createInitialTelemetry('moon', specs.budgetRemainingM)
  );
  const [frozenTelemetry, setFrozenTelemetry] = useState<TelemetryState>(() =>
    createInitialTelemetry('moon', specs.budgetRemainingM)
  );
  const [finalScoreBreakdown, setFinalScoreBreakdown] =
    useState<MissionScoreBreakdown | null>(null);

  const [cameraView, setCameraView] = useState<CameraViewMode>('chase');
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);

  const [activeChallenge, setActiveChallenge] =
    useState<MissionChallenge | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(
    'ASTRONAUT EVA SIMULATION · Walk with WASD / Arrows, Jetpack [Space], Collect Samples [E], or Drive Rover [G]'
  );

  const [activeBurn, setActiveBurn] = useState(false);
  const [shieldActive, setShieldActive] = useState(false);
  const [scanning, setScanning] = useState(true);
  const steerThrustRef = useRef(false);
  const challengeShownForRunRef = useRef(false);

  const [directorName, setDirectorName] = useState('Director Alex Vance');
  const [bestScore, setBestScore] = useState(0);
  const [badges, setBadges] = useState<AchievementBadge[]>(INITIAL_BADGES);
  const [leaderboard, setLeaderboard] =
    useState<LeaderboardEntry[]>(SEED_LEADERBOARD);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SAVE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.directorName) setDirectorName(parsed.directorName);
        if (typeof parsed.bestScore === 'number') setBestScore(parsed.bestScore);
        if (Array.isArray(parsed.unlockedBadgeIds)) {
          setBadges((prev) =>
            prev.map((b) => ({
              ...b,
              unlocked: parsed.unlockedBadgeIds.includes(b.id),
            }))
          );
        }
        if (Array.isArray(parsed.leaderboard) && parsed.leaderboard.length > 0) {
          setLeaderboard(parsed.leaderboard);
        }
      }
    } catch {
      // Ignore storage parse error
    }
  }, []);

  const persistProgress = useCallback(
    (
      nextBest: number,
      nextBadges: AchievementBadge[],
      nextBoard: LeaderboardEntry[],
      name: string
    ) => {
      try {
        localStorage.setItem(
          STORAGE_KEY_SAVE,
          JSON.stringify({
            directorName: name,
            bestScore: nextBest,
            unlockedBadgeIds: nextBadges.filter((b) => b.unlocked).map((b) => b.id),
            leaderboard: nextBoard.slice(0, 10),
          })
        );
      } catch {
        // Ignore storage write error
      }
    },
    []
  );

  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  const activeModeConfig = useMemo(
    () => MISSION_MODES.find((m) => m.id === selectedMode) || MISSION_MODES[0],
    [selectedMode]
  );

  const handleSelectMode = useCallback(
    (modeId: MissionModeId) => {
      soundEngine.playUiClick();
      setSelectedMode(modeId);
      const preset = DEFAULT_CONFIG_BY_MODE[modeId];
      setConfig(preset);
      const nextSpecs = calculateCraftSpecs(preset, modeId, selectedDifficulty);
      setTelemetry(createInitialTelemetry(modeId, nextSpecs.budgetRemainingM));
    },
    [selectedDifficulty]
  );

  const handleSelectDifficulty = useCallback(
    (diff: DifficultyLevel) => {
      soundEngine.playUiClick();
      setSelectedDifficulty(diff);
      const nextSpecs = calculateCraftSpecs(config, selectedMode, diff);
      setTelemetry((prev) => ({
        ...prev,
        budgetRemainingM: nextSpecs.budgetRemainingM,
      }));
    },
    [config, selectedMode]
  );

  const handleStartMission = useCallback(() => {
    soundEngine.playUiClick();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const nextSpecs = calculateCraftSpecs(config, selectedMode, selectedDifficulty);
    const fresh = createInitialTelemetry(selectedMode, nextSpecs.budgetRemainingM);
    setTelemetry(fresh);
    setAstronautState(createInitialAstronautState());
    setSimMode('astronaut_eva');
    setActiveChallenge(null);
    setStatusBanner(
      'ASTRONAUT EVA SIMULATION · Walk [WASD/Arrows], Jetpack [Space], Collect Samples [E], Drive Rover [G], or Board Rocket [V]'
    );
    challengeShownForRunRef.current = false;
    setDockCollapsed(false);
    setGameState('playing');
  }, [config, selectedMode, selectedDifficulty]);

  const handleToggleSimMode = useCallback((target?: SimulationControlMode) => {
    soundEngine.playUiClick();
    setSimMode((prev) => {
      const next =
        target || (prev === 'astronaut_eva' ? 'spacecraft_flight' : 'astronaut_eva');
      if (next === 'astronaut_eva') {
        setStatusBanner(
          'ASTRONAUT EVA WALK ACTIVE · Move with WASD / Arrows, Jetpack [Space], Collect Samples [E], Rover [G]'
        );
      } else {
        setStatusBanner(
          'SPACECRAFT CONTROL ACTIVE · Configure Rocket Subsystems & Initiate Countdown Launch'
        );
      }
      return next;
    });
  }, []);

  const finishMission = useCallback(
    (finalTel: TelemetryState) => {
      setFrozenTelemetry(finalTel);
      const breakdown = calculateMissionScore(
        finalTel,
        specs,
        selectedMode,
        selectedDifficulty
      );
      setFinalScoreBreakdown(breakdown);

      if (breakdown.victory) {
        soundEngine.playVictoryFanfare();
      } else {
        soundEngine.playDefeatSting();
      }

      const updatedBest = Math.max(bestScore, breakdown.totalScore);
      setBestScore(updatedBest);

      const updatedBadges = badges.map((b) =>
        breakdown.unlockedBadges.includes(b.id) ? { ...b, unlocked: true } : b
      );
      setBadges(updatedBadges);

      let updatedBoard = leaderboard;
      if (breakdown.victory) {
        const newEntry: LeaderboardEntry = {
          id: `run-${Date.now()}`,
          directorName,
          missionName: activeModeConfig.name,
          difficulty: selectedDifficulty,
          score: breakdown.totalScore,
          rankTitle: breakdown.rankTitle,
          dateIso: new Date().toISOString().slice(0, 10),
        };
        updatedBoard = [...leaderboard, newEntry]
          .sort((a, b) => b.score - a.score)
          .slice(0, 8);
        setLeaderboard(updatedBoard);
      }

      persistProgress(updatedBest, updatedBadges, updatedBoard, directorName);
      setGameState('gameover');
    },
    [
      specs,
      selectedMode,
      selectedDifficulty,
      bestScore,
      badges,
      leaderboard,
      directorName,
      activeModeConfig.name,
      persistProgress,
    ]
  );

  useEffect(() => {
    if (gameState !== 'playing' || learningOpen || achievementsOpen || activeChallenge) {
      return;
    }

    const interval = window.setInterval(() => {
      setTelemetry((prev) => {
        if (prev.phase === 'assembly' || prev.phase === 'complete') return prev;

        const prevCeil = Math.ceil(prev.countdownSeconds);
        const next = stepMissionTelemetry(
          prev,
          0.2,
          specs,
          selectedDifficulty,
          {
            thrusting: activeBurn || steerThrustRef.current,
            shielding: shieldActive,
            scanning,
          }
        );

        if (prev.phase === 'countdown') {
          const nextCeil = Math.ceil(next.countdownSeconds);
          if (nextCeil !== prevCeil && nextCeil > 0) {
            soundEngine.playCountdownBeep(false);
          } else if (next.phase === 'launch') {
            soundEngine.playCountdownBeep(true);
            soundEngine.playLaunchRumble();
            setStatusBanner(
              'LIFTOFF ACHIEVED · Steer with WASD / Arrows to Collect Telemetry & Evade Debris'
            );
          }
        }

        if (prev.phase === 'transit' && next.phase === 'objective') {
          setSimMode('astronaut_eva');
          setStatusBanner(
            'SURFACE TOUCHDOWN · Walk Astronaut [WASD] to Collect Samples [E] & Drive Rover [G]!'
          );
        }

        if (
          !challengeShownForRunRef.current &&
          next.phase === 'transit' &&
          next.progressPct >= 48 &&
          next.progressPct <= 58
        ) {
          challengeShownForRunRef.current = true;
          const randomChallenge =
            MISSION_CHALLENGES[
              Math.floor(Math.random() * MISSION_CHALLENGES.length)
            ];
          setActiveChallenge(randomChallenge);
          soundEngine.playHazardTelegraph();
        }

        if (next.phase === 'complete') {
          setTimeout(() => finishMission(next), 50);
        } else if (
          next.healthPct <= 0 ||
          next.crewSafetyPct <= 0 ||
          next.oxygenPct <= 0 ||
          (next.fuelPct <= 0 && next.progressPct < 98)
        ) {
          setTimeout(() => finishMission(next), 350);
        }

        return next;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [
    gameState,
    learningOpen,
    achievementsOpen,
    activeChallenge,
    specs,
    selectedDifficulty,
    activeBurn,
    shieldActive,
    scanning,
    finishMission,
  ]);

  const handleUpdateConfig = useCallback(
    (partial: Partial<SpacecraftConfiguration>) => {
      soundEngine.playUiClick();
      setConfig((prev) => {
        const merged = { ...prev, ...partial };
        const nextSpecs = calculateCraftSpecs(
          merged,
          selectedMode,
          selectedDifficulty
        );
        setTelemetry((t) => ({
          ...t,
          budgetRemainingM: nextSpecs.budgetRemainingM,
        }));
        return merged;
      });
    },
    [selectedMode, selectedDifficulty]
  );

  const handleInitiateLaunch = useCallback(() => {
    soundEngine.playCountdownBeep(false);
    setSimMode('spacecraft_flight');
    setTelemetry((prev) => ({
      ...prev,
      phase: 'countdown',
      countdownSeconds: 3.0,
      budgetRemainingM: specs.budgetRemainingM,
      statusText: 'T-3s · Main Engine Ignition Sequence',
    }));
  }, [specs.budgetRemainingM]);

  const handleAdvancePhaseOrComplete = useCallback(() => {
    soundEngine.playThrusterPulse();
    setTelemetry((prev) => {
      if (prev.phase === 'countdown') {
        soundEngine.playLaunchRumble();
        return {
          ...prev,
          phase: 'launch',
          countdownSeconds: 0,
          progressPct: Math.max(prev.progressPct, 5),
          objectivesCompleted: 1,
          statusText: 'LIFTOFF · Max-Q Ascent & Stage Separation',
        };
      }
      if (prev.phase === 'launch') {
        return {
          ...prev,
          phase: 'transit',
          progressPct: Math.max(prev.progressPct, 32),
          objectivesCompleted: 2,
          fuelPct: Math.max(10, prev.fuelPct - 6),
          statusText: 'ORBITAL TRANSIT · Deep Space Trajectory Cruise',
        };
      }
      if (prev.phase === 'transit') {
        setSimMode('astronaut_eva');
        setStatusBanner(
          'SURFACE TOUCHDOWN · Walk Astronaut [WASD] to Collect Samples [E] & Drive Rover [G]!'
        );
        return {
          ...prev,
          phase: 'objective',
          progressPct: Math.max(prev.progressPct, 75),
          objectivesCompleted: 3,
          fuelPct: Math.max(8, prev.fuelPct - 6),
          statusText: 'SURFACE EVA OPERATIONS · Walk Astronaut & Extract Core Samples',
        };
      }
      if (prev.phase === 'objective') {
        const completedState: TelemetryState = {
          ...prev,
          phase: 'complete',
          progressPct: 100,
          distanceFromDestKm: 0,
          objectivesCompleted: prev.totalObjectives,
          scienceDataPoints: prev.scienceDataPoints + 240,
          statusText: 'MISSION ACCOMPLISHED · All Telemetry & Samples Verified',
        };
        setTimeout(() => finishMission(completedState), 50);
        return completedState;
      }
      return prev;
    });
  }, [finishMission]);

  const handleTriggerChallenge = useCallback(() => {
    soundEngine.playHazardTelegraph();
    const pick =
      MISSION_CHALLENGES[Math.floor(Math.random() * MISSION_CHALLENGES.length)];
    setActiveChallenge(pick);
  }, []);

  const handleResolveChallenge = useCallback((opt: MissionChallengeOption) => {
    soundEngine.playScienceCollect();
    setTelemetry((prev) => resolveMissionChallenge(prev, opt));
    setActiveChallenge(null);
    setStatusBanner(`ANOMALY RESOLVED: ${opt.label} (${opt.actionSummary})`);
  }, []);

  const handleCollectWaypoint = useCallback((bonusPoints: number, label: string) => {
    setTelemetry((prev) => ({
      ...prev,
      scienceDataPoints: prev.scienceDataPoints + bonusPoints,
      waypointsCollected: prev.waypointsCollected + 1,
      progressPct:
        prev.phase === 'assembly'
          ? Math.min(25, prev.progressPct + 6)
          : Math.min(100, prev.progressPct + 5),
    }));
    setStatusBanner(`+${bonusPoints} SCIENCE TELEMETRY · ${label}`);
  }, []);

  const handleHazardCollision = useCallback(
    (damage: number, safetyLoss: number, hazardName: string) => {
      setTelemetry((prev) => {
        const nextHealth = Math.max(0, prev.healthPct - damage);
        const nextSafety = Math.max(0, prev.crewSafetyPct - safetyLoss);
        const next = {
          ...prev,
          healthPct: nextHealth,
          crewSafetyPct: nextSafety,
        };
        if (nextHealth <= 0 || nextSafety <= 0) {
          setTimeout(() => finishMission(next), 350);
        }
        return next;
      });
      setStatusBanner(
        `▲ IMPACT ALERT: ${hazardName} (-${damage}% Hull${
          shieldActive ? ', Mitigated by Shield' : ''
        })`
      );
    },
    [shieldActive, finishMission]
  );

  const handleCycleCamera = useCallback(() => {
    soundEngine.playUiClick();
    const order: CameraViewMode[] = ['chase', 'orbital', 'cockpit', 'inspect'];
    setCameraView((prev) => order[(order.indexOf(prev) + 1) % order.length]);
  }, []);

  const handleToggleMute = useCallback(() => {
    const nextMuted = soundEngine.toggleMute();
    setMuted(nextMuted);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Escape') {
        if (learningOpen) {
          setLearningOpen(false);
          return;
        }
        if (achievementsOpen) {
          setAchievementsOpen(false);
          return;
        }
        if (gameState === 'playing') {
          setGameState('paused');
        } else if (gameState === 'paused') {
          setGameState('playing');
        }
        return;
      }

      if (gameState === 'title' && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        handleStartMission();
        return;
      }

      if (gameState === 'gameover' && e.code === 'Enter') {
        e.preventDefault();
        handleStartMission();
        return;
      }

      if (gameState === 'playing') {
        if (e.code === 'KeyP') {
          setGameState('paused');
        } else if (e.code === 'KeyV') {
          handleToggleSimMode();
        } else if (e.code === 'KeyC') {
          handleCycleCamera();
        } else if (e.code === 'KeyH') {
          setDockCollapsed((v) => !v);
        } else if (e.code === 'KeyM') {
          handleToggleMute();
        } else if (e.code === 'KeyL') {
          setLearningOpen((v) => !v);
        } else if (e.code === 'KeyB') {
          setAchievementsOpen((v) => !v);
        } else if (e.code === 'KeyE' && simMode === 'spacecraft_flight') {
          setShieldActive((v) => !v);
          soundEngine.playUiClick();
        } else if (e.code === 'KeyF') {
          setScanning((v) => !v);
          soundEngine.playUiClick();
        } else if (e.code === 'KeyR') {
          handleStartMission();
        }
      } else if (gameState === 'paused' && e.code === 'KeyP') {
        setGameState('playing');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    gameState,
    simMode,
    learningOpen,
    achievementsOpen,
    handleStartMission,
    handleToggleSimMode,
    handleCycleCamera,
    handleToggleMute,
  ]);

  const handleNextMission = useCallback(() => {
    const idx = MISSION_MODES.findIndex((m) => m.id === selectedMode);
    const nextMode = MISSION_MODES[(idx + 1) % MISSION_MODES.length].id;
    handleSelectMode(nextMode);
    const preset = DEFAULT_CONFIG_BY_MODE[nextMode];
    const nextSpecs = calculateCraftSpecs(preset, nextMode, selectedDifficulty);
    setTelemetry(createInitialTelemetry(nextMode, nextSpecs.budgetRemainingM));
    setAstronautState(createInitialAstronautState());
    setSimMode('astronaut_eva');
    setGameState('playing');
  }, [selectedMode, selectedDifficulty, handleSelectMode]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#07090E] select-none">
      {/* Persistent Isolated 3D WebGL Viewport */}
      <SpaceSceneCanvas
        gameState={gameState}
        modeId={selectedMode}
        phase={telemetry.phase}
        simMode={simMode}
        cameraView={cameraView}
        config={config}
        progressPct={telemetry.progressPct}
        activeBurn={activeBurn}
        shieldActive={shieldActive}
        scanning={scanning}
        virtualInput={virtualInput}
        onCollectWaypoint={handleCollectWaypoint}
        onHazardCollision={handleHazardCollision}
        onSteerActivity={(isThrusting) => {
          steerThrustRef.current = isThrusting;
        }}
        onAstronautStateUpdate={setAstronautState}
        onBoardRocketFromEVA={() => handleToggleSimMode('spacecraft_flight')}
      />

      {/* Title Screen State */}
      {gameState === 'title' && (
        <TitleScreen
          selectedMode={selectedMode}
          selectedDifficulty={selectedDifficulty}
          onSelectMode={handleSelectMode}
          onSelectDifficulty={handleSelectDifficulty}
          onStartMission={handleStartMission}
          onOpenLearningCenter={() => setLearningOpen(true)}
          onOpenAchievements={() => setAchievementsOpen(true)}
        />
      )}

      {/* Active Playing HUD & Collapsible Bottom Engineering / Astronaut EVA Dock */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <HudOverlay
          mode={activeModeConfig}
          difficulty={selectedDifficulty}
          telemetry={telemetry}
          simMode={simMode}
          astronautState={astronautState}
          config={config}
          specs={specs}
          cameraView={cameraView}
          dockCollapsed={dockCollapsed}
          muted={muted}
          activeChallenge={activeChallenge}
          statusBanner={statusBanner}
          activeBurn={activeBurn}
          shieldActive={shieldActive}
          scanning={scanning}
          onToggleSimMode={handleToggleSimMode}
          onVirtualMove={(dx, dz) =>
            setVirtualInput((prev) => ({ ...prev, moveX: dx, moveZ: dz }))
          }
          onVirtualJetpack={(active) =>
            setVirtualInput((prev) => ({ ...prev, jetpack: active }))
          }
          onTriggerEvaInteract={() =>
            setVirtualInput((prev) => ({
              ...prev,
              interactTrigger: prev.interactTrigger + 1,
            }))
          }
          onTriggerRoverToggle={() =>
            setVirtualInput((prev) => ({
              ...prev,
              roverToggleTrigger: prev.roverToggleTrigger + 1,
            }))
          }
          onUpdateConfig={handleUpdateConfig}
          onInitiateLaunch={handleInitiateLaunch}
          onToggleBurn={() => {
            soundEngine.playThrusterPulse();
            setActiveBurn((v) => !v);
          }}
          onToggleShield={() => {
            soundEngine.playUiClick();
            setShieldActive((v) => !v);
          }}
          onToggleScan={() => {
            soundEngine.playUiClick();
            setScanning((v) => !v);
          }}
          onTriggerChallenge={handleTriggerChallenge}
          onResolveChallenge={handleResolveChallenge}
          onAdvancePhaseOrComplete={handleAdvancePhaseOrComplete}
          onCycleCamera={handleCycleCamera}
          onToggleDock={() => setDockCollapsed((v) => !v)}
          onToggleMute={handleToggleMute}
          onOpenLearning={() => setLearningOpen(true)}
          onOpenAchievements={() => setAchievementsOpen(true)}
          onPause={() => setGameState('paused')}
          onRestart={handleStartMission}
        />
      )}

      {/* Pause Modal */}
      <PauseModal
        isOpen={gameState === 'paused'}
        mode={activeModeConfig}
        telemetry={telemetry}
        onResume={() => setGameState('playing')}
        onRestart={handleStartMission}
        onReturnTitle={() => setGameState('title')}
        onOpenLearning={() => setLearningOpen(true)}
      />

      {/* Victory / Game Over Outcome & Certificate Modal */}
      {gameState === 'gameover' && finalScoreBreakdown && (
        <OutcomeModal
          isOpen={true}
          mode={activeModeConfig}
          difficulty={selectedDifficulty}
          telemetrySnapshot={frozenTelemetry}
          scoreBreakdown={finalScoreBreakdown}
          bestScore={bestScore}
          directorName={directorName}
          onChangeDirectorName={(name) => {
            setDirectorName(name);
            persistProgress(bestScore, badges, leaderboard, name);
          }}
          onPlayAgain={handleStartMission}
          onNextMission={handleNextMission}
          onReturnTitle={() => setGameState('title')}
        />
      )}

      {/* Space Science Learning Center Modal */}
      <ScienceLearningModal
        isOpen={learningOpen}
        onClose={() => setLearningOpen(false)}
      />

      {/* Badges & Leaderboard Modal */}
      <AchievementsModal
        isOpen={achievementsOpen}
        badges={badges}
        leaderboard={leaderboard}
        onClose={() => setAchievementsOpen(false)}
      />
    </main>
  );
}
