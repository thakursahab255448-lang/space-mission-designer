import {
  AchievementBadge,
  AstronautEVAState,
  ComputedCraftSpecs,
  DifficultyLevel,
  EngineModule,
  LaunchWindowOption,
  LeaderboardEntry,
  MissionChallenge,
  MissionChallengeOption,
  MissionModeConfig,
  MissionModeId,
  MissionScoreBreakdown,
  PayloadModule,
  PowerSystem,
  RocketChassis,
  SpacecraftConfiguration,
  TelemetryState,
  TrajectoryOption,
} from './types';

export const STANDARD_GRAVITY = 9.80665; // m/s^2

export const PLANETARY_GRAVITY_MS2: Record<MissionModeId, number> = {
  moon: 1.62,
  mars: 3.71,
  satellite: 0.45, // Microgravity EVA tether walk
  deepspace: 1.31, // Europa surface gravity
  rescue: 0.65, // Low-G orbital rescue EVA
};

export const HABITAT_BASE_POS = { x: -11, z: -7 };

export function createInitialAstronautState(): AstronautEVAState {
  return {
    x: 4.2,
    y: 0,
    z: 6.5,
    vx: 0,
    vy: 0,
    vz: 0,
    headingRad: 0,
    isGrounded: true,
    jetpackActive: false,
    sprinting: false,
    inRover: false,
    roverX: 10.5,
    roverZ: -4.5,
    roverHeadingRad: -0.4,
    suitOxygenPct: 100,
    suitBatteryPct: 100,
    samplesCarried: 0,
    flagsPlanted: 0,
    nearInteractableLabel: null,
    nearInteractableType: null,
  };
}

/**
 * Pure deterministic physics and life-support step for the 3D Astronaut / Rover on the surface.
 */
export function stepAstronautSimulation(
  state: AstronautEVAState,
  dtSeconds: number,
  modeId: MissionModeId,
  input: {
    moveX: number; // -1 (left/A) to +1 (right/D)
    moveZ: number; // -1 (forward/W) to +1 (backward/S)
    jumpOrJetpack: boolean;
    sprint: boolean;
  }
): AstronautEVAState {
  if (dtSeconds <= 0) return state;

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const next: AstronautEVAState = { ...state };
  const gravity = PLANETARY_GRAVITY_MS2[modeId] || 1.62;

  const topSpeed = next.inRover ? 13.5 : input.sprint ? 8.2 : 5.2;
  const len = Math.hypot(input.moveX, input.moveZ);
  const normX = len > 0 ? input.moveX / len : 0;
  const normZ = len > 0 ? input.moveZ / len : 0;

  const targetVx = normX * topSpeed;
  const targetVz = normZ * topSpeed;
  const accel = next.isGrounded ? 10.0 : 5.5;
  const blend = Math.min(1, accel * dtSeconds);

  next.vx = next.vx + (targetVx - next.vx) * blend;
  next.vz = next.vz + (targetVz - next.vz) * blend;

  if (len > 0.05) {
    next.headingRad = Math.atan2(normX, normZ);
  }

  // Vertical jump & jetpack thrust physics
  if (input.jumpOrJetpack && next.suitBatteryPct > 1 && !next.inRover) {
    next.jetpackActive = true;
    const jetpackThrust = Math.max(gravity + 4.8, 7.2);
    next.vy = clamp(next.vy + (jetpackThrust - gravity) * dtSeconds, -12, 8.5);
    next.isGrounded = false;
  } else {
    next.jetpackActive = false;
    next.vy -= gravity * 2.2 * dtSeconds;
  }

  next.x += next.vx * dtSeconds;
  next.z += next.vz * dtSeconds;
  next.y += next.vy * dtSeconds;

  if (next.y <= 0) {
    next.y = 0;
    next.vy = 0;
    next.isGrounded = true;
  } else if (next.y > 14) {
    next.y = 14;
    next.vy = 0;
  }

  // Keep inside natural boulder perimeter (radius 22m) and avoid walking inside solid rocket core
  const radialDist = Math.hypot(next.x, next.z);
  if (radialDist > 21.5) {
    const scale = 21.5 / radialDist;
    next.x *= scale;
    next.z *= scale;
  }
  if (radialDist < 2.3 && next.y < 6) {
    const pushAngle = Math.atan2(next.z || 0.1, next.x || 0.1);
    next.x = Math.cos(pushAngle) * 2.35;
    next.z = Math.sin(pushAngle) * 2.35;
  }

  if (next.inRover) {
    next.roverX = next.x;
    next.roverZ = next.z;
    next.roverHeadingRad = next.headingRad;
  }

  // Habitat dome proximity recharges suit O2 & Battery; otherwise slow EVA drain
  const distToHabitat = Math.hypot(
    next.x - HABITAT_BASE_POS.x,
    next.z - HABITAT_BASE_POS.z
  );
  if (distToHabitat < 4.8) {
    next.suitOxygenPct = clamp(next.suitOxygenPct + dtSeconds * 12, 0, 100);
    next.suitBatteryPct = clamp(next.suitBatteryPct + dtSeconds * 15, 0, 100);
  } else {
    const o2Drain = (input.sprint ? 0.45 : 0.22) * (next.inRover ? 0.35 : 1.0);
    const batDrain = next.jetpackActive ? 2.4 : next.inRover ? 0.65 : 0.18;
    next.suitOxygenPct = clamp(next.suitOxygenPct - dtSeconds * o2Drain, 0, 100);
    next.suitBatteryPct = clamp(next.suitBatteryPct - dtSeconds * batDrain, 0, 100);
  }

  next.sprinting = input.sprint;
  return next;
}

export const DIFFICULTY_SETTINGS: Record<
  DifficultyLevel,
  {
    label: string;
    budgetMultiplier: number;
    fuelConsumptionMultiplier: number;
    hazardFrequencyMultiplier: number;
    scoreMultiplier: number;
    description: string;
  }
> = {
  beginner: {
    label: 'Beginner (Cadet)',
    budgetMultiplier: 1.25,
    fuelConsumptionMultiplier: 0.8,
    hazardFrequencyMultiplier: 0.7,
    scoreMultiplier: 1.0,
    description: 'Generous NASA budget reserve (+25%), forgiving propellant margins, and assisted flight stabilization.',
  },
  intermediate: {
    label: 'Intermediate (Flight Director)',
    budgetMultiplier: 1.0,
    fuelConsumptionMultiplier: 1.0,
    hazardFrequencyMultiplier: 1.0,
    scoreMultiplier: 1.35,
    description: 'Standard NASA mission budgets, authentic Tsiolkovsky Delta-V margins, and dynamic deep-space hazards.',
  },
  expert: {
    label: 'Expert (Chief Architect)',
    budgetMultiplier: 0.85,
    fuelConsumptionMultiplier: 1.2,
    hazardFrequencyMultiplier: 1.4,
    scoreMultiplier: 1.75,
    description: 'Strict congressional budget cap (-15%), tight orbital insertion tolerances, and frequent solar storm anomalies.',
  },
};

export const MISSION_MODES: MissionModeConfig[] = [
  {
    id: 'moon',
    name: 'Moon Mission',
    subtitle: 'Artemis South Pole Lunar Landing',
    nasaInspiration: 'NASA Artemis III & Apollo Lunar Module',
    targetBody: 'The Moon (Shackleton Crater)',
    distanceKm: 384400,
    requiredDeltaV: 5900,
    baseBudgetM: 490,
    targetOrbitKm: 100,
    estimatedHours: 72,
    primaryColor: '#06B6D4',
    accentHex: '#22D3EE',
    description:
      'Design a crewed lunar lander, execute Trans-Lunar Injection (TLI), navigate boulder fields, and touch down at the Lunar South Pole to sample water-ice regolith.',
    objectives: [
      'Achieve Low Earth Parking Orbit & Trans-Lunar Injection',
      'Navigate cislunar micrometeoroid corridor',
      'Execute powered descent to Shackleton Crater landing zone',
      'Extract 3 cryogenic water-ice core samples & return telemetry',
    ],
    surfaceType: 'lunar',
  },
  {
    id: 'mars',
    name: 'Mars Exploration',
    subtitle: 'Jezero Delta Autonomous Rover & Sample Return',
    nasaInspiration: 'NASA Mars 2020 Perseverance & Sample Return',
    targetBody: 'Mars (Jezero Crater)',
    distanceKm: 225000000,
    requiredDeltaV: 7400,
    baseBudgetM: 590,
    targetOrbitKm: 400,
    estimatedHours: 4800,
    primaryColor: '#F59E0B',
    accentHex: '#FB923C',
    description:
      'Launch an interplanetary cruise stage on a Hohmann transfer to the Red Planet, survive atmospheric entry, drive across ancient river deltas, and drill biosignature cores.',
    objectives: [
      'Complete interplanetary Hohmann transfer burn to Mars',
      'Survive hypersonic entry & Sky-Crane touchdown in Jezero Crater',
      'Drive rover across 3 ancient lacustrine mineral outcrops',
      'Transmit high-gain spectrographic biosignature data to Earth',
    ],
    surfaceType: 'martian',
  },
  {
    id: 'satellite',
    name: 'Satellite Mission',
    subtitle: 'Geostationary Earth Observation & Relay Array',
    nasaInspiration: 'NASA GOES-U & TDRS Orbital Constellation',
    targetBody: 'Geostationary Transfer Orbit (GTO)',
    distanceKm: 35786,
    requiredDeltaV: 4300,
    baseBudgetM: 360,
    targetOrbitKm: 35786,
    estimatedHours: 18,
    primaryColor: '#3B82F6',
    accentHex: '#60A5FA',
    description:
      'Construct a high-precision Ka-band climate and telemetry satellite, launch into elliptical transfer orbit, circularize at 35,786 km, and align optical solar arrays.',
    objectives: [
      'Ascend through Max-Q and separate payload fairing cleanly',
      'Perform apogee kick burn at 35,786 km geostationary altitude',
      'Evade orbital debris nodes and align 3 calibration beacons',
      'Deploy dual solar arrays and lock Ka-band transponder link',
    ],
    surfaceType: 'orbital',
  },
  {
    id: 'deepspace',
    name: 'Deep Space Exploration',
    subtitle: 'Outer Solar System & Europa Subsurface Probe',
    nasaInspiration: 'NASA Europa Clipper & Voyager Interstellar Program',
    targetBody: 'Jupiter System (Europa Ice Shell)',
    distanceKm: 628730000,
    requiredDeltaV: 9100,
    baseBudgetM: 720,
    targetOrbitKm: 2700,
    estimatedHours: 14200,
    primaryColor: '#A855F7',
    accentHex: '#C084FC',
    description:
      'Engineer a radiation-hardened deep-space explorer, execute gravity assists across the asteroid belt, scan Europa’s subsurface ocean plumes, and detect unknown celestial anomalies.',
    objectives: [
      'Escape Earth gravity well with high-energy hyperbolic excess velocity',
      'Navigate Main Belt asteroid clusters and Jovian magnetosphere',
      'Fly through 3 Europa cryovolcanic water-vapor plumes',
      'Catalog unknown deep-space gravitational anomaly signal',
    ],
    surfaceType: 'jovian',
  },
  {
    id: 'rescue',
    name: 'Emergency Rescue Mission',
    subtitle: 'Distressed Orbital Crew Capsule Intercept & EVA',
    nasaInspiration: 'Apollo 13 Contingency & Soyuz/Orion Orbital Rescue',
    targetBody: 'High-Inclination Cislunar Orbit',
    distanceKm: 128000,
    requiredDeltaV: 6300,
    baseBudgetM: 520,
    targetOrbitKm: 6400,
    estimatedHours: 36,
    primaryColor: '#10B981',
    accentHex: '#34D399',
    description:
      'A crewed research vessel has suffered a Micrometeoroid & Orbital Debris (MMOD) strike with rapidly depleting O2. Launch an intercept craft, match spin rate, and dock before life support fails.',
    objectives: [
      'Launch on immediate fast-intercept trajectory window',
      'Nullify relative inclination and approach distressed Orion-7 vessel',
      'Stabilize tumbling attitude and capture 3 emergency EVA life-pods',
      'Transfer oxygen reserves and return astronauts safely to Earth',
    ],
    surfaceType: 'rescue_orbit',
  },
];

export const ROCKET_CHASSIS_CATALOG: RocketChassis[] = [
  {
    id: 'falcon_heavy',
    name: 'Falcon Heavy Block 5',
    costM: 115,
    fuelCapacityKg: 42000,
    dryMassKg: 9200,
    thrustKn: 22819,
    reliability: 96,
    description: 'Triple-core reusable kerolox launch vehicle. Balanced budget efficiency for satellite, lunar, and inner-planet missions.',
  },
  {
    id: 'vulcan_centaur',
    name: 'Atlas-Vulcan Centaur V',
    costM: 140,
    fuelCapacityKg: 51000,
    dryMassKg: 8800,
    thrustKn: 24500,
    reliability: 98,
    description: 'High-precision methalox/hydrolox upper stage optimized for exact orbital insertion and emergency fast-intercept windows.',
  },
  {
    id: 'sls_block1b',
    name: 'NASA SLS Block 1B Exploration',
    costM: 195,
    fuelCapacityKg: 76000,
    dryMassKg: 11500,
    thrustKn: 39140,
    reliability: 97,
    description: 'Super-heavy shuttle-derived launch vehicle with Exploration Upper Stage. High lift capacity for crewed lunar & Mars architectures.',
  },
  {
    id: 'starship_superheavy',
    name: 'Starship Deep-Space Tanker',
    costM: 235,
    fuelCapacityKg: 98000,
    dryMassKg: 13200,
    thrustKn: 74400,
    reliability: 94,
    description: 'Ultra-heavy full-flow staged combustion vehicle with orbital propellant capacity for outer-planet and high-mass expeditions.',
  },
];

export const ENGINE_CATALOG: EngineModule[] = [
  {
    id: 'raptor_vac',
    name: 'Raptor Vacuum Methalox',
    costM: 55,
    ispSeconds: 380,
    burnRateKgPerSec: 120,
    thrustBonus: 1.15,
    description: 'High-thrust liquid methane/oxygen vacuum engine. Ideal for rapid orbital maneuvers and powered lunar/Martian descent.',
  },
  {
    id: 'rs25_hydrolox',
    name: 'RS-25 / RL10 Cryo-Hydrolox',
    costM: 80,
    ispSeconds: 452,
    burnRateKgPerSec: 95,
    thrustBonus: 1.05,
    description: 'Classic NASA liquid hydrogen/oxygen propulsion with superior specific impulse (452s Isp) for Trans-Lunar and Mars injections.',
  },
  {
    id: 'ntp_draco',
    name: 'DRACO Nuclear Thermal (NTP)',
    costM: 135,
    ispSeconds: 850,
    burnRateKgPerSec: 65,
    thrustBonus: 1.1,
    description: 'Next-generation fission thermal rocket heating hydrogen propellant to 2,700 K. Doubles efficiency over chemical rockets.',
  },
  {
    id: 'next_ion',
    name: 'NEXT-C Xenon Gridded Ion Drive',
    costM: 110,
    ispSeconds: 1150,
    burnRateKgPerSec: 40,
    thrustBonus: 0.92,
    description: 'Ultra-high specific impulse solar/nuclear electric thruster. Exceptional fuel economy for deep-space & satellite orbits.',
  },
];

export const POWER_SYSTEM_CATALOG: PowerSystem[] = [
  {
    id: 'rosa_solar',
    name: 'ROSA Roll-Out Solar Arrays',
    costM: 40,
    powerOutputKw: 28,
    massKg: 650,
    oxygenEfficiency: 1.0,
    description: 'Lightweight flexible photovoltaic wings used on ISS and DART. High output in inner solar system (Moon, LEO, Mars).',
  },
  {
    id: 'mmrtg_isotope',
    name: 'MMRTG Plutonium-238 Core',
    costM: 75,
    powerOutputKw: 38,
    massKg: 920,
    oxygenEfficiency: 1.12,
    description: 'Multi-Mission Radioisotope Thermoelectric Generator. Immune to dust storms, lunar night, and outer-planet darkness.',
  },
  {
    id: 'kilopower_krusty',
    name: 'Kilopower Stirling Fission Core',
    costM: 115,
    powerOutputKw: 65,
    massKg: 1350,
    oxygenEfficiency: 1.28,
    description: 'Compact 65 kWe space reactor with regenerative ECLSS life-support loop. Maximum crew safety and continuous deep-space power.',
  },
];

export const PAYLOAD_CATALOG: PayloadModule[] = [
  {
    id: 'artemis_lander',
    name: 'HLS Lunar Surface Lander & Drill',
    costM: 65,
    massKg: 2800,
    scienceMultiplier: 1.3,
    bestForMode: 'moon',
    description: 'Equipped with terrain-relative LIDAR, shock-absorbing struts, and a 2-meter cryogenic regolith coring drill.',
  },
  {
    id: 'perseverance_rover',
    name: 'RTG Autonomous Mars Rover + Ingenuity',
    costM: 85,
    massKg: 3100,
    scienceMultiplier: 1.45,
    bestForMode: 'mars',
    description: '6-wheel rocker-bogie rover with SuperCam laser spectrometer, sample caching carousel, and coaxial scout rotorcraft.',
  },
  {
    id: 'goes_satbus',
    name: 'Ka-Band Geostationary Observatory Bus',
    costM: 50,
    massKg: 1900,
    scienceMultiplier: 1.25,
    bestForMode: 'satellite',
    description: 'Ultra-stable star-tracker satellite bus with multi-spectral Earth/space imagers and optical laser communications.',
  },
  {
    id: 'europa_clipper_suite',
    name: 'REASON Ice-Penetrating Radar & Mass Spec',
    costM: 95,
    massKg: 2650,
    scienceMultiplier: 1.6,
    bestForMode: 'deepspace',
    description: 'Tantalum-vault shielded deep-space instrument suite capable of sounding 30 km through icy moons and analyzing plume molecules.',
  },
  {
    id: 'eva_rescue_pod',
    name: 'Universal Docking Collar & EVA Trauma Bay',
    costM: 70,
    massKg: 2400,
    scienceMultiplier: 1.35,
    bestForMode: 'rescue',
    description: 'Androgynous magnetic grapple ring, autonomous relative-nav LIDAR, and hyperbaric medical life-support transfer module.',
  },
];

export const LAUNCH_WINDOWS: LaunchWindowOption[] = [
  {
    id: 'optimal_synodic',
    name: 'Optimal Synodic Alignment Window',
    deltaVModifier: 0.92,
    timeModifier: 1.0,
    solarRisk: 0.15,
    description: 'Planetary phase angle aligned for minimum energy transfer (-8% required Delta-V) and calm solar weather.',
  },
  {
    id: 'fast_conjunction',
    name: 'High-Energy Fast Transit Window',
    deltaVModifier: 1.12,
    timeModifier: 0.72,
    solarRisk: 0.25,
    description: 'Reduces crew radiation exposure and transit duration by 28%, but requires +12% higher injection Delta-V.',
  },
  {
    id: 'ballistic_capture',
    name: 'Low-Thrust Ballistic Gravity Window',
    deltaVModifier: 0.85,
    timeModifier: 1.25,
    solarRisk: 0.2,
    description: 'Exploits Earth-Sun Lagrange manifold capture to save 15% propellant at the cost of a 25% longer mission duration.',
  },
];

export const TRAJECTORY_OPTIONS: TrajectoryOption[] = [
  {
    id: 'hohmann_transfer',
    name: 'Classical Hohmann Transfer Ellipse',
    deltaVModifier: 1.0,
    durationMultiplier: 1.0,
    accuracyBonus: 10,
    description: 'Two-burn tangential elliptical orbit touching departure and arrival orbits. The gold standard for fuel-to-time balance.',
  },
  {
    id: 'gravity_assist',
    name: 'Lunar / Venus Gravity Assist Slingshot',
    deltaVModifier: 0.88,
    durationMultiplier: 1.18,
    accuracyBonus: 15,
    description: 'Uses planetary orbital momentum exchange to gain free velocity (-12% Delta-V cost) with high navigation precision.',
  },
  {
    id: 'direct_burn',
    name: 'Direct Hyperbolic Powered Ascent',
    deltaVModifier: 1.16,
    durationMultiplier: 0.78,
    accuracyBonus: 5,
    description: 'Continuous high-energy burn for rapid arrival (-22% flight time). Ideal for time-critical emergency rescue missions.',
  },
];

export const MISSION_CHALLENGES: MissionChallenge[] = [
  {
    id: 'cme_solar_storm',
    title: 'Class X4 Coronal Mass Ejection Detected',
    category: 'environment',
    severity: 'critical',
    description:
      'Space Weather Prediction Center reports a high-energy solar proton wave approaching your trajectory vector within 14 minutes.',
    nasaContext: 'Real NASA deep-space craft orient their thickest propellant tanks toward the Sun as a radiation storm shelter.',
    options: [
      {
        label: 'Orient Aft Fuel Tanks & Divert Power to Magnetic Shield',
        actionSummary: '-8% Power, +4% Crew Safety, +120 Science Data',
        fuelDelta: -2,
        powerDelta: -8,
        healthDelta: 0,
        crewSafetyDelta: 4,
        scienceBonus: 120,
        timePenaltyHours: 2,
      },
      {
        label: 'Execute High-Thrust Evasive Out-of-Plane Burn',
        actionSummary: '-9% Fuel, Avoids Storm Damage Completely',
        fuelDelta: -9,
        powerDelta: -2,
        healthDelta: 0,
        crewSafetyDelta: 2,
        scienceBonus: 60,
        timePenaltyHours: -4,
      },
      {
        label: 'Maintain Nominal Course & Record Plasma Spectra',
        actionSummary: '-12% Hull Health, -10% Crew Safety, +260 Science Data',
        fuelDelta: 0,
        powerDelta: -5,
        healthDelta: -12,
        crewSafetyDelta: -10,
        scienceBonus: 260,
        timePenaltyHours: 0,
      },
    ],
  },
  {
    id: 'star_tracker_drift',
    title: 'Optical Star Tracker Gyroscope Desync',
    category: 'navigation',
    severity: 'moderate',
    description:
      'Cosmic ray bit-flip in Flight Computer B caused a 0.4-degree attitude drift during mid-course trajectory correction.',
    nasaContext: 'Voyager and Orion use triple-modular redundant computers and optical star catalogs to recalibrate inertial measurement units.',
    options: [
      {
        label: 'Run Canopus Optical Recalibration & RCS Fine Trim',
        actionSummary: '-4% Fuel, -5% Power, Restores 100% Lock',
        fuelDelta: -4,
        powerDelta: -5,
        healthDelta: 2,
        crewSafetyDelta: 3,
        scienceBonus: 90,
        timePenaltyHours: 3,
      },
      {
        label: 'Switch to Backup Inertial Sun-Sensor Mode',
        actionSummary: '-3% Power, Minor Trajectory Dispersion (+6h)',
        fuelDelta: -2,
        powerDelta: -3,
        healthDelta: 0,
        crewSafetyDelta: 0,
        scienceBonus: 50,
        timePenaltyHours: 6,
      },
      {
        label: 'Force Manual Thruster Override Without Reboot',
        actionSummary: '-8% Fuel, -6% Hull Stress, Saves Time (-2h)',
        fuelDelta: -8,
        powerDelta: 0,
        healthDelta: -6,
        crewSafetyDelta: -4,
        scienceBonus: 40,
        timePenaltyHours: -2,
      },
    ],
  },
  {
    id: 'dsn_comm_blackout',
    title: 'Deep Space Network Ka-Band Transponder Drop',
    category: 'communication',
    severity: 'moderate',
    description:
      'High-gain dish gimbal actuator experienced thermal binding, reducing telemetry downlink to Madrid and Goldstone stations.',
    nasaContext: 'NASA’s Deep Space Network (DSN) relies on 70-meter dishes in California, Spain, and Australia for continuous 360-degree sky coverage.',
    options: [
      {
        label: 'Perform Thermal Roll Maneuver (BBQ Roll) to Free Gimbal',
        actionSummary: '-4% Fuel, +150 Science Data, Restores Full Link',
        fuelDelta: -4,
        powerDelta: -3,
        healthDelta: 3,
        crewSafetyDelta: 2,
        scienceBonus: 150,
        timePenaltyHours: 2,
      },
      {
        label: 'Reroute Telemetry Through Low-Gain Omni Antenna',
        actionSummary: '-10% Power, Preserves Propellant Reserves',
        fuelDelta: 0,
        powerDelta: -10,
        healthDelta: 0,
        crewSafetyDelta: 1,
        scienceBonus: 70,
        timePenaltyHours: 4,
      },
      {
        label: 'Overdrive Travelling-Wave Tube Amplifier (TWTA)',
        actionSummary: '-14% Power, -5% Health, +190 Science Burst',
        fuelDelta: 0,
        powerDelta: -14,
        healthDelta: -5,
        crewSafetyDelta: 0,
        scienceBonus: 190,
        timePenaltyHours: 0,
      },
    ],
  },
  {
    id: 'cryo_boiloff_leak',
    title: 'Cryogenic Propellant Manifold Pressure Spike',
    category: 'fuel',
    severity: 'critical',
    description:
      'Micro-valve seal degradation is causing hydrogen boil-off in Auxiliary Tank 2, threatening orbital insertion Delta-V margins.',
    nasaContext: 'Managing zero-boil-off cryogenic propellants is one of NASA’s top engineering challenges for Artemis and Mars transit.',
    options: [
      {
        label: 'Cross-Feed Propellant to Main Tank & Engage Cryo-Cooler',
        actionSummary: '-9% Power, Saves Fuel (-2% Fuel only), +4% Safety',
        fuelDelta: -2,
        powerDelta: -9,
        healthDelta: 2,
        crewSafetyDelta: 4,
        scienceBonus: 100,
        timePenaltyHours: 2,
      },
      {
        label: 'Vent Excess Pressure & Use Ullage Thrust Impulse',
        actionSummary: '-7% Fuel, Gains Forward Velocity (-5h Transit)',
        fuelDelta: -7,
        powerDelta: -2,
        healthDelta: 0,
        crewSafetyDelta: 1,
        scienceBonus: 80,
        timePenaltyHours: -5,
      },
      {
        label: 'Seal Manifold & Isolate Auxiliary Tank Completely',
        actionSummary: '-11% Fuel Capacity, Zero Power Draw',
        fuelDelta: -11,
        powerDelta: 0,
        healthDelta: 0,
        crewSafetyDelta: -3,
        scienceBonus: 40,
        timePenaltyHours: 0,
      },
    ],
  },
  {
    id: 'eclss_co2_scrubber',
    title: 'ECLSS Carbon Dioxide Scrubber Saturation',
    category: 'equipment',
    severity: 'critical',
    description:
      'Primary amine bed in the Environmental Control and Life Support System shows rising CO2 partial pressure above 3.8 mmHg.',
    nasaContext: 'On Apollo 13 and ISS, lithium hydroxide and vacuum-desorbed amine beds keep cabin air breathable for astronauts.',
    options: [
      {
        label: 'Activate Secondary Zeolite Thermal Regeneration Cycle',
        actionSummary: '-8% Power, +6% Crew Safety, Full O2 Recovery',
        fuelDelta: 0,
        powerDelta: -8,
        healthDelta: 2,
        crewSafetyDelta: 6,
        scienceBonus: 110,
        timePenaltyHours: 1,
      },
      {
        label: 'Purge Cabin Loop & Repressurize from Reserve O2 Tank',
        actionSummary: '-4% Fuel, -3% Power, +3% Crew Safety',
        fuelDelta: -4,
        powerDelta: -3,
        healthDelta: 0,
        crewSafetyDelta: 3,
        scienceBonus: 75,
        timePenaltyHours: 0,
      },
      {
        label: 'Switch Crew to Closed-Loop Spacesuit Ventilators',
        actionSummary: '-8% Crew Safety, +4h Delay, Saves Spacecraft Power',
        fuelDelta: 0,
        powerDelta: 2,
        healthDelta: 0,
        crewSafetyDelta: -8,
        scienceBonus: 50,
        timePenaltyHours: 4,
      },
    ],
  },
];

export const INITIAL_BADGES: AchievementBadge[] = [
  {
    id: 'artemis_pioneer',
    name: 'Artemis Lunar Pioneer',
    description: 'Successfully complete the Moon Mission and return Shackleton Crater ice cores.',
    criteria: 'Complete Moon Mission',
    unlocked: false,
  },
  {
    id: 'red_planet_architect',
    name: 'Red Planet Architect',
    description: 'Land on Mars and transmit biosignature telemetry from Jezero Crater.',
    criteria: 'Complete Mars Exploration',
    unlocked: false,
  },
  {
    id: 'tsiolkovsky_master',
    name: 'Tsiolkovsky Fuel Master',
    description: 'Complete any mission with at least 35% propellant remaining.',
    criteria: 'Fuel Remaining >= 35%',
    unlocked: false,
  },
  {
    id: 'fiscal_eagle',
    name: 'Congressional Fiscal Eagle',
    description: 'Complete a mission with at least $80M remaining in NASA budget reserves.',
    criteria: 'Budget Remaining >= $80M',
    unlocked: false,
  },
  {
    id: 'zero_harm_director',
    name: 'Gene Kranz Safety Medal',
    description: 'Finish a mission with Crew Safety & Spacecraft Health both at 90% or higher.',
    criteria: 'Failure Is Not An Option (Health & Safety >= 90%)',
    unlocked: false,
  },
  {
    id: 'deep_cosmos_voyager',
    name: 'Beyond the Universe',
    description: 'Achieve a total score of 9,000+ points or complete an Expert difficulty mission.',
    criteria: 'Score >= 9,000 or Expert Victory',
    unlocked: false,
  },
];

export const SEED_LEADERBOARD: LeaderboardEntry[] = [
  {
    id: 'seed-1',
    directorName: 'Dr. Margaret Hamilton',
    missionName: 'Moon Mission',
    difficulty: 'expert',
    score: 11420,
    rankTitle: 'Flight Director Emeritus',
    dateIso: '2026-10-24',
  },
  {
    id: 'seed-2',
    directorName: 'Cmdr. Gene Kranz',
    missionName: 'Emergency Rescue Mission',
    difficulty: 'expert',
    score: 10890,
    rankTitle: 'Flight Director Emeritus',
    dateIso: '2026-10-29',
  },
  {
    id: 'seed-3',
    directorName: 'Dr. Katherine Johnson',
    missionName: 'Mars Exploration',
    difficulty: 'intermediate',
    score: 9340,
    rankTitle: 'Chief Mission Architect',
    dateIso: '2026-11-02',
  },
  {
    id: 'seed-4',
    directorName: 'Dir. Carl Sagan',
    missionName: 'Deep Space Exploration',
    difficulty: 'intermediate',
    score: 8870,
    rankTitle: 'Chief Mission Architect',
    dateIso: '2026-11-06',
  },
];

/**
 * Pure Tsiolkovsky Rocket Equation:
 * Delta-V = Isp * g0 * ln(wetMass / dryMass)
 */
export function calculateTsiolkovskyDeltaV(
  ispSeconds: number,
  wetMassKg: number,
  dryMassKg: number
): number {
  if (ispSeconds <= 0 || wetMassKg <= 0 || dryMassKg <= 0 || wetMassKg <= dryMassKg) {
    return 0;
  }
  const exhaustVelocity = ispSeconds * STANDARD_GRAVITY;
  return Math.round(exhaustVelocity * Math.log(wetMassKg / dryMassKg));
}

/**
 * Pure Hohmann Transfer calculation between two circular orbits around a central body.
 * Returns deltaV1 (m/s), deltaV2 (m/s), totalDeltaV (m/s), and transferTimeHours.
 */
export function calculateHohmannTransfer(
  r1Km: number,
  r2Km: number,
  muKm3s2 = 398600.4418 // Earth standard gravitational parameter km^3/s^2
): {
  deltaV1Ms: number;
  deltaV2Ms: number;
  totalDeltaVMs: number;
  transferTimeHours: number;
} {
  if (r1Km <= 0 || r2Km <= 0 || r1Km === r2Km) {
    return { deltaV1Ms: 0, deltaV2Ms: 0, totalDeltaVMs: 0, transferTimeHours: 0 };
  }
  const a = (r1Km + r2Km) / 2;
  const v1 = Math.sqrt(muKm3s2 / r1Km);
  const v2 = Math.sqrt(muKm3s2 / r2Km);
  const vPerigee = Math.sqrt(muKm3s2 * (2 / r1Km - 1 / a));
  const vApogee = Math.sqrt(muKm3s2 * (2 / r2Km - 1 / a));

  const dv1KmS = Math.abs(vPerigee - v1);
  const dv2KmS = Math.abs(v2 - vApogee);
  const transferSeconds = Math.PI * Math.sqrt(Math.pow(a, 3) / muKm3s2);

  const deltaV1Ms = Math.round(dv1KmS * 1000);
  const deltaV2Ms = Math.round(dv2KmS * 1000);

  return {
    deltaV1Ms,
    deltaV2Ms,
    totalDeltaVMs: deltaV1Ms + deltaV2Ms,
    transferTimeHours: Number((transferSeconds / 3600).toFixed(2)),
  };
}

/**
 * Computes full spacecraft engineering specifications from selected components, mode, and difficulty.
 */
export function calculateCraftSpecs(
  config: SpacecraftConfiguration,
  modeId: MissionModeId,
  difficulty: DifficultyLevel
): ComputedCraftSpecs {
  const mode = MISSION_MODES.find((m) => m.id === modeId) || MISSION_MODES[0];
  const diff = DIFFICULTY_SETTINGS[difficulty];
  const rocket =
    ROCKET_CHASSIS_CATALOG.find((r) => r.id === config.rocketId) || ROCKET_CHASSIS_CATALOG[0];
  const engine =
    ENGINE_CATALOG.find((e) => e.id === config.engineId) || ENGINE_CATALOG[0];
  const power =
    POWER_SYSTEM_CATALOG.find((p) => p.id === config.powerId) || POWER_SYSTEM_CATALOG[0];
  const payload =
    PAYLOAD_CATALOG.find((pl) => pl.id === config.payloadId) || PAYLOAD_CATALOG[0];
  const windowOpt =
    LAUNCH_WINDOWS.find((w) => w.id === config.launchWindowId) || LAUNCH_WINDOWS[0];
  const trajectory =
    TRAJECTORY_OPTIONS.find((t) => t.id === config.trajectoryId) || TRAJECTORY_OPTIONS[0];

  const availableBudgetM = Math.round(mode.baseBudgetM * diff.budgetMultiplier);
  const fuelCostM = Math.round((config.fuelLoadPct / 100) * 28);
  const shieldCostM = config.shieldReinforcement * 18;
  const totalCostM =
    rocket.costM + engine.costM + power.costM + payload.costM + fuelCostM + shieldCostM;
  const budgetRemainingM = availableBudgetM - totalCostM;

  const shieldMassKg = config.shieldReinforcement * 420;
  const dryMassKg = rocket.dryMassKg + power.massKg + payload.massKg + shieldMassKg;
  const fuelMassKg = Math.round(rocket.fuelCapacityKg * (config.fuelLoadPct / 100));
  const wetMassKg = dryMassKg + fuelMassKg;

  // Multi-stage effective Delta-V using Tsiolkovsky equation scaled by staging factor (1.35x)
  const rawDeltaV = calculateTsiolkovskyDeltaV(engine.ispSeconds, wetMassKg, dryMassKg);
  const totalDeltaV = Math.round(rawDeltaV * 1.35);

  const requiredDeltaV = Math.round(
    mode.requiredDeltaV * windowOpt.deltaVModifier * trajectory.deltaVModifier
  );
  const deltaVMargin = totalDeltaV - requiredDeltaV;

  const weightNewtons = wetMassKg * STANDARD_GRAVITY;
  const totalThrustNewtons = rocket.thrustKn * 1000 * engine.thrustBonus;
  const thrustToWeightRatio = Number(((totalThrustNewtons / weightNewtons) * 0.35).toFixed(2));

  const payloadSynergyBonus = payload.bestForMode === mode.id ? 0.35 : 0;
  const scienceMultiplier = Number((payload.scienceMultiplier + payloadSynergyBonus).toFixed(2));

  const reliabilityScore = Math.min(
    100,
    Math.round(rocket.reliability + config.shieldReinforcement * 1.5)
  );

  const estimatedTransitHours = Math.max(
    4,
    Math.round(mode.estimatedHours * windowOpt.timeModifier * trajectory.durationMultiplier)
  );

  return {
    totalCostM,
    budgetRemainingM,
    isWithinBudget: budgetRemainingM >= 0,
    wetMassKg,
    dryMassKg,
    fuelMassKg,
    totalDeltaV,
    requiredDeltaV,
    deltaVMargin,
    hasSufficientDeltaV: totalDeltaV >= requiredDeltaV * 0.85,
    thrustToWeightRatio,
    powerOutputKw: power.powerOutputKw,
    reliabilityScore,
    scienceMultiplier,
    estimatedTransitHours,
  };
}

/**
 * Validates whether a spacecraft configuration is ready for launch.
 */
export function validateMissionReadiness(specs: ComputedCraftSpecs): {
  canLaunch: boolean;
  warnings: string[];
  blockers: string[];
} {
  const warnings: string[] = [];
  const blockers: string[] = [];

  if (!specs.isWithinBudget) {
    blockers.push(
      `Mission exceeds NASA budget allocation by $${Math.abs(specs.budgetRemainingM)}M. Reduce hardware cost or fuel load.`
    );
  }
  if (specs.thrustToWeightRatio < 1.05) {
    blockers.push(
      `Thrust-to-Weight Ratio (${specs.thrustToWeightRatio}) is too low for liftoff. Select a higher-thrust rocket or engine.`
    );
  }
  if (!specs.hasSufficientDeltaV) {
    blockers.push(
      `Insufficient Delta-V (${specs.totalDeltaV} m/s vs ${specs.requiredDeltaV} m/s required). Increase fuel load or upgrade engine Isp.`
    );
  } else if (specs.deltaVMargin < 0) {
    warnings.push(
      `Tight Delta-V margin (${specs.deltaVMargin} m/s). Careful flight piloting required to conserve propellant.`
    );
  }

  return {
    canLaunch: blockers.length === 0,
    warnings,
    blockers,
  };
}

/**
 * Resolves a random mission challenge option and updates telemetry state deterministically.
 */
export function resolveMissionChallenge(
  telemetry: TelemetryState,
  option: MissionChallengeOption
): TelemetryState {
  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  return {
    ...telemetry,
    fuelPct: clamp(telemetry.fuelPct + option.fuelDelta, 0, 100),
    powerPct: clamp(telemetry.powerPct + option.powerDelta, 0, 100),
    healthPct: clamp(telemetry.healthPct + option.healthDelta, 0, 100),
    crewSafetyPct: clamp(telemetry.crewSafetyPct + option.crewSafetyDelta, 0, 100),
    scienceDataPoints: Math.max(0, telemetry.scienceDataPoints + option.scienceBonus),
    travelTimeHours: Math.max(0, telemetry.travelTimeHours + option.timePenaltyHours),
  };
}

/**
 * Advances mission telemetry during active flight/surface gameplay.
 */
export function stepMissionTelemetry(
  telemetry: TelemetryState,
  dtSeconds: number,
  specs: ComputedCraftSpecs,
  difficulty: DifficultyLevel,
  controls: { thrusting: boolean; shielding: boolean; scanning: boolean }
): TelemetryState {
  if (
    telemetry.phase === 'assembly' ||
    telemetry.phase === 'complete' ||
    dtSeconds <= 0
  ) {
    return telemetry;
  }

  const diff = DIFFICULTY_SETTINGS[difficulty];
  const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

  const next = { ...telemetry };

  if (next.phase === 'countdown') {
    next.countdownSeconds = Math.max(0, next.countdownSeconds - dtSeconds);
    next.statusText = `T-${ Math.ceil(next.countdownSeconds) }s · Main Engine Ignition Sequence`;
    if (next.countdownSeconds <= 0) {
      next.phase = 'launch';
      next.statusText = 'LIFTOFF · Max-Q Ascent & Stage Separation';
      next.objectivesCompleted = Math.max(next.objectivesCompleted, 1);
    }
    return next;
  }

  const speedMultiplier = controls.thrusting && next.fuelPct > 0 ? 1.85 : 1.0;
  const progressRate =
    next.phase === 'launch' ? 6.5 : next.phase === 'transit' ? 3.8 : 4.2;

  const progressDelta = dtSeconds * progressRate * speedMultiplier;
  next.progressPct = clamp(next.progressPct + progressDelta, 0, 100);

  // Fuel consumption
  const baseFuelDrain =
    (next.phase === 'launch' ? 1.45 : 0.42) * diff.fuelConsumptionMultiplier;
  const thrustFuelDrain = controls.thrusting ? 1.15 * diff.fuelConsumptionMultiplier : 0;
  next.fuelPct = clamp(next.fuelPct - dtSeconds * (baseFuelDrain + thrustFuelDrain), 0, 100);

  // Power & Oxygen balance
  const solarRecharge = specs.powerOutputKw >= 38 ? 0.9 : 0.55;
  const shieldDrain = controls.shielding ? 1.6 : 0;
  const scanDrain = controls.scanning ? 0.9 : 0;
  next.powerPct = clamp(
    next.powerPct + dtSeconds * (solarRecharge - shieldDrain - scanDrain - 0.35),
    0,
    100
  );

  const o2Drain = next.powerPct > 15 ? 0.18 : 0.85;
  next.oxygenPct = clamp(next.oxygenPct - dtSeconds * o2Drain, 0, 100);

  if (next.oxygenPct < 25 || next.healthPct < 35) {
    next.crewSafetyPct = clamp(next.crewSafetyPct - dtSeconds * 1.4, 0, 100);
  }

  // Distance & Travel Time
  const remainingFraction = Math.max(0, 1 - next.progressPct / 100);
  next.distanceFromDestKm = Math.round(next.totalDistanceKm * remainingFraction);
  next.travelTimeHours = Number(
    (next.travelTimeHours + dtSeconds * (specs.estimatedTransitHours / 35)).toFixed(1)
  );

  // Velocity & Altitude
  if (next.phase === 'launch') {
    next.velocityKms = Number((1.2 + (next.progressPct / 30) * 9.8).toFixed(2));
    next.altitudeKm = Math.round((next.progressPct / 30) * 420);
    if (next.progressPct >= 30) {
      next.phase = 'transit';
      next.statusText = 'ORBITAL TRANSIT · Deep Space Trajectory Cruise';
      next.objectivesCompleted = Math.max(next.objectivesCompleted, 2);
    }
  } else if (next.phase === 'transit') {
    next.velocityKms = Number((11.2 + (controls.thrusting ? 3.4 : 0)).toFixed(2));
    next.altitudeKm = Math.round(420 + (next.totalDistanceKm - next.distanceFromDestKm) * 0.15);
    if (next.progressPct >= 72) {
      next.phase = 'objective';
      next.statusText = 'TARGET ARRIVAL · Executing Primary Surface / Orbital Operations';
      next.objectivesCompleted = Math.max(next.objectivesCompleted, 3);
    }
  } else if (next.phase === 'objective') {
    next.velocityKms = Number((controls.thrusting ? 0.85 : 0.24).toFixed(2));
    if (controls.scanning) {
      next.scienceDataPoints = Math.round(
        next.scienceDataPoints + dtSeconds * 45 * specs.scienceMultiplier
      );
    }
    if (next.progressPct >= 100) {
      next.phase = 'complete';
      next.objectivesCompleted = next.totalObjectives;
      next.statusText = 'MISSION ACCOMPLISHED · All Telemetry & Samples Verified';
    }
  }

  return next;
}

/**
 * Calculates final mission score, breakdown, rank, and unlocked badges.
 */
export function calculateMissionScore(
  telemetry: TelemetryState,
  specs: ComputedCraftSpecs,
  modeId: MissionModeId,
  difficulty: DifficultyLevel
): MissionScoreBreakdown {
  const diff = DIFFICULTY_SETTINGS[difficulty];
  const victory =
    telemetry.phase === 'complete' &&
    telemetry.healthPct > 0 &&
    telemetry.crewSafetyPct > 0 &&
    telemetry.oxygenPct > 0;

  let failureReason: string | undefined;
  if (!victory) {
    if (telemetry.healthPct <= 0) {
      failureReason = 'Critical structural hull failure from debris/hazard impact.';
    } else if (telemetry.crewSafetyPct <= 0 || telemetry.oxygenPct <= 0) {
      failureReason = 'Life support / crew safety dropped below survivable threshold.';
    } else if (telemetry.fuelPct <= 0 && telemetry.progressPct < 100) {
      failureReason = 'Propellant reserves exhausted prior to mission objective completion.';
    } else {
      failureReason = 'Mission aborted prior to final telemetry verification.';
    }
  }

  const missionSuccessPts = victory
    ? 3000
    : Math.round((telemetry.progressPct / 100) * 1200);
  const budgetEfficiencyPts = Math.max(0, Math.round(specs.budgetRemainingM * 14));
  const fuelEfficiencyPts = Math.round(telemetry.fuelPct * 22);
  const crewSafetyPts = Math.round(
    (telemetry.crewSafetyPct * 0.6 + telemetry.healthPct * 0.4) * 20
  );
  const scientificDiscoveryPts = Math.round(
    telemetry.scienceDataPoints * specs.scienceMultiplier + telemetry.waypointsCollected * 250
  );

  const timeRatio =
    specs.estimatedTransitHours > 0
      ? Math.max(0.5, Math.min(1.5, specs.estimatedTransitHours / Math.max(1, telemetry.travelTimeHours)))
      : 1;
  const timeManagementPts = victory ? Math.round(800 * timeRatio) : Math.round(200 * timeRatio);

  const rawTotal =
    missionSuccessPts +
    budgetEfficiencyPts +
    fuelEfficiencyPts +
    crewSafetyPts +
    scientificDiscoveryPts +
    timeManagementPts;

  const totalScore = Math.round(rawTotal * diff.scoreMultiplier);

  let rankTitle = 'Cadet Flight Engineer';
  if (victory && totalScore >= 10000) {
    rankTitle = 'Flight Director Emeritus';
  } else if (victory && totalScore >= 8000) {
    rankTitle = 'Chief Mission Architect';
  } else if (victory && totalScore >= 6000) {
    rankTitle = 'Senior Flight Director';
  } else if (victory) {
    rankTitle = 'Mission Specialist';
  }

  const unlockedBadges: string[] = [];
  if (victory) {
    if (modeId === 'moon') unlockedBadges.push('artemis_pioneer');
    if (modeId === 'mars') unlockedBadges.push('red_planet_architect');
    if (telemetry.fuelPct >= 35) unlockedBadges.push('tsiolkovsky_master');
    if (specs.budgetRemainingM >= 80) unlockedBadges.push('fiscal_eagle');
    if (telemetry.healthPct >= 90 && telemetry.crewSafetyPct >= 90) {
      unlockedBadges.push('zero_harm_director');
    }
    if (totalScore >= 9000 || difficulty === 'expert') {
      unlockedBadges.push('deep_cosmos_voyager');
    }
  }

  return {
    victory,
    missionSuccessPts,
    budgetEfficiencyPts,
    fuelEfficiencyPts,
    crewSafetyPts,
    scientificDiscoveryPts,
    timeManagementPts,
    difficultyMultiplier: diff.scoreMultiplier,
    totalScore,
    rankTitle,
    unlockedBadges,
    failureReason,
  };
}
