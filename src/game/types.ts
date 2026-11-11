export type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export type MissionModeId = 'moon' | 'mars' | 'satellite' | 'deepspace' | 'rescue';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'expert';

export type MissionPhase =
  | 'assembly'
  | 'countdown'
  | 'launch'
  | 'transit'
  | 'objective'
  | 'complete';

export type CameraViewMode = 'chase' | 'orbital' | 'cockpit' | 'inspect';

export type SimulationControlMode = 'astronaut_eva' | 'spacecraft_flight';

export interface AstronautEVAState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  headingRad: number;
  isGrounded: boolean;
  jetpackActive: boolean;
  sprinting: boolean;
  inRover: boolean;
  roverX: number;
  roverZ: number;
  roverHeadingRad: number;
  suitOxygenPct: number;
  suitBatteryPct: number;
  samplesCarried: number;
  flagsPlanted: number;
  nearInteractableLabel: string | null;
  nearInteractableType: 'rocket' | 'habitat' | 'rover' | 'sample' | 'flag' | null;
}

export interface MissionModeConfig {
  id: MissionModeId;
  name: string;
  subtitle: string;
  nasaInspiration: string;
  targetBody: string;
  distanceKm: number;
  requiredDeltaV: number; // m/s
  baseBudgetM: number; // $ Millions
  targetOrbitKm: number;
  estimatedHours: number;
  primaryColor: string;
  accentHex: string;
  description: string;
  objectives: string[];
  surfaceType: 'lunar' | 'martian' | 'orbital' | 'jovian' | 'rescue_orbit';
}

export interface RocketChassis {
  id: string;
  name: string;
  costM: number;
  fuelCapacityKg: number;
  dryMassKg: number;
  thrustKn: number;
  reliability: number; // 0-100
  description: string;
}

export interface EngineModule {
  id: string;
  name: string;
  costM: number;
  ispSeconds: number; // Specific impulse
  burnRateKgPerSec: number;
  thrustBonus: number;
  description: string;
}

export interface PowerSystem {
  id: string;
  name: string;
  costM: number;
  powerOutputKw: number;
  massKg: number;
  oxygenEfficiency: number; // 0.8 to 1.4
  description: string;
}

export interface PayloadModule {
  id: string;
  name: string;
  costM: number;
  massKg: number;
  scienceMultiplier: number;
  bestForMode: MissionModeId;
  description: string;
}

export interface LaunchWindowOption {
  id: string;
  name: string;
  deltaVModifier: number; // e.g. 0.92 for optimal, 1.15 for off-window
  timeModifier: number;
  solarRisk: number;
  description: string;
}

export interface TrajectoryOption {
  id: string;
  name: string;
  deltaVModifier: number;
  durationMultiplier: number;
  accuracyBonus: number;
  description: string;
}

export interface SpacecraftConfiguration {
  rocketId: string;
  engineId: string;
  powerId: string;
  payloadId: string;
  launchWindowId: string;
  trajectoryId: string;
  fuelLoadPct: number; // 50 - 100
  shieldReinforcement: number; // 0 - 3 levels
}

export interface ComputedCraftSpecs {
  totalCostM: number;
  budgetRemainingM: number;
  isWithinBudget: boolean;
  wetMassKg: number;
  dryMassKg: number;
  fuelMassKg: number;
  totalDeltaV: number; // m/s calculated via Tsiolkovsky equation
  requiredDeltaV: number; // m/s adjusted for window & trajectory
  deltaVMargin: number;
  hasSufficientDeltaV: boolean;
  thrustToWeightRatio: number;
  powerOutputKw: number;
  reliabilityScore: number;
  scienceMultiplier: number;
  estimatedTransitHours: number;
}

export interface MissionChallengeOption {
  label: string;
  actionSummary: string;
  fuelDelta: number;
  powerDelta: number;
  healthDelta: number;
  crewSafetyDelta: number;
  scienceBonus: number;
  timePenaltyHours: number;
}

export interface MissionChallenge {
  id: string;
  title: string;
  category: 'technical' | 'communication' | 'navigation' | 'fuel' | 'environment' | 'equipment';
  severity: 'moderate' | 'critical';
  description: string;
  nasaContext: string;
  options: MissionChallengeOption[];
}

export interface TelemetryState {
  phase: MissionPhase;
  statusText: string;
  fuelPct: number;
  healthPct: number;
  crewSafetyPct: number;
  oxygenPct: number;
  powerPct: number;
  budgetRemainingM: number;
  distanceFromDestKm: number;
  totalDistanceKm: number;
  travelTimeHours: number;
  progressPct: number;
  velocityKms: number;
  altitudeKm: number;
  scienceDataPoints: number;
  objectivesCompleted: number;
  totalObjectives: number;
  countdownSeconds: number;
  activeBurn: boolean;
  shieldActive: boolean;
  waypointsCollected: number;
  hazardsAvoided: number;
}

export interface MissionScoreBreakdown {
  victory: boolean;
  missionSuccessPts: number;
  budgetEfficiencyPts: number;
  fuelEfficiencyPts: number;
  crewSafetyPts: number;
  scientificDiscoveryPts: number;
  timeManagementPts: number;
  difficultyMultiplier: number;
  totalScore: number;
  rankTitle: string;
  unlockedBadges: string[];
  failureReason?: string;
}

export interface AchievementBadge {
  id: string;
  name: string;
  description: string;
  criteria: string;
  unlocked: boolean;
}

export interface LeaderboardEntry {
  id: string;
  directorName: string;
  missionName: string;
  difficulty: DifficultyLevel;
  score: number;
  rankTitle: string;
  dateIso: string;
}
