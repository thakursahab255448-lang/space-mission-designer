import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCraftSpecs,
  calculateHohmannTransfer,
  calculateMissionScore,
  calculateTsiolkovskyDeltaV,
  resolveMissionChallenge,
  stepMissionTelemetry,
  validateMissionReadiness,
} from './rules';
import { SpacecraftConfiguration, TelemetryState } from './types';

test('Tsiolkovsky rocket equation computes accurate Delta-V', () => {
  // Isp = 450s, wetMass = 50000kg, dryMass = 10000kg
  const dv = calculateTsiolkovskyDeltaV(450, 50000, 10000);
  // 450 * 9.80665 * ln(5) = 4412.9925 * 1.6094379 = ~7102 m/s
  assert.equal(dv, 7102);
  assert.equal(calculateTsiolkovskyDeltaV(450, 10000, 10000), 0);
});

test('Hohmann transfer calculates LEO to GEO transfer accurately', () => {
  // LEO r1 = 6678 km (300 km altitude), GEO r2 = 42164 km (35786 km altitude)
  const transfer = calculateHohmannTransfer(6678, 42164);
  assert.ok(transfer.deltaV1Ms > 2300 && transfer.deltaV1Ms < 2500);
  assert.ok(transfer.deltaV2Ms > 1400 && transfer.deltaV2Ms < 1550);
  assert.equal(transfer.totalDeltaVMs, transfer.deltaV1Ms + transfer.deltaV2Ms);
  assert.ok(transfer.transferTimeHours > 5.0 && transfer.transferTimeHours < 5.5);
});

test('calculateCraftSpecs and validateMissionReadiness validate valid Moon configuration', () => {
  const config: SpacecraftConfiguration = {
    rocketId: 'sls_block1b',
    engineId: 'rs25_hydrolox',
    powerId: 'rosa_solar',
    payloadId: 'artemis_lander',
    launchWindowId: 'optimal_synodic',
    trajectoryId: 'hohmann_transfer',
    fuelLoadPct: 90,
    shieldReinforcement: 1,
  };

  const specs = calculateCraftSpecs(config, 'moon', 'intermediate');
  assert.equal(specs.isWithinBudget, true);
  assert.equal(specs.hasSufficientDeltaV, true);
  assert.ok(specs.thrustToWeightRatio > 1.2);

  const validation = validateMissionReadiness(specs);
  assert.equal(validation.canLaunch, true);
  assert.equal(validation.blockers.length, 0);
});

test('validateMissionReadiness catches over-budget configuration on expert difficulty', () => {
  const expensiveConfig: SpacecraftConfiguration = {
    rocketId: 'starship_superheavy',
    engineId: 'ntp_draco',
    powerId: 'kilopower_krusty',
    payloadId: 'europa_clipper_suite',
    launchWindowId: 'fast_conjunction',
    trajectoryId: 'direct_burn',
    fuelLoadPct: 100,
    shieldReinforcement: 3,
  };

  // Satellite base budget is 320M, on expert it is 320 * 0.85 = 272M
  const specs = calculateCraftSpecs(expensiveConfig, 'satellite', 'expert');
  assert.equal(specs.isWithinBudget, false);
  const validation = validateMissionReadiness(specs);
  assert.equal(validation.canLaunch, false);
  assert.ok(validation.blockers.length > 0);
});

test('resolveMissionChallenge updates telemetry within clamped bounds', () => {
  const initialTelemetry: TelemetryState = {
    phase: 'transit',
    statusText: 'In Transit',
    fuelPct: 80,
    healthPct: 95,
    crewSafetyPct: 98,
    oxygenPct: 92,
    powerPct: 85,
    budgetRemainingM: 90,
    distanceFromDestKm: 120000,
    totalDistanceKm: 384400,
    travelTimeHours: 24,
    progressPct: 50,
    velocityKms: 10.8,
    altitudeKm: 180000,
    scienceDataPoints: 200,
    objectivesCompleted: 2,
    totalObjectives: 4,
    countdownSeconds: 0,
    activeBurn: false,
    shieldActive: false,
    waypointsCollected: 1,
    hazardsAvoided: 2,
  };

  const updated = resolveMissionChallenge(initialTelemetry, {
    label: 'Test Option',
    actionSummary: 'Test',
    fuelDelta: -10,
    powerDelta: -5,
    healthDelta: 10, // should clamp at 100
    crewSafetyDelta: 5, // should clamp at 100
    scienceBonus: 150,
    timePenaltyHours: 3,
  });

  assert.equal(updated.fuelPct, 70);
  assert.equal(updated.powerPct, 80);
  assert.equal(updated.healthPct, 100);
  assert.equal(updated.crewSafetyPct, 100);
  assert.equal(updated.scienceDataPoints, 350);
  assert.equal(updated.travelTimeHours, 27);
});

test('stepMissionTelemetry transitions phases and calculateMissionScore awards badges', () => {
  const config: SpacecraftConfiguration = {
    rocketId: 'sls_block1b',
    engineId: 'rs25_hydrolox',
    powerId: 'mmrtg_isotope',
    payloadId: 'artemis_lander',
    launchWindowId: 'optimal_synodic',
    trajectoryId: 'hohmann_transfer',
    fuelLoadPct: 95,
    shieldReinforcement: 1,
  };
  const specs = calculateCraftSpecs(config, 'moon', 'intermediate');

  let telemetry: TelemetryState = {
    phase: 'objective',
    statusText: 'Objective Phase',
    fuelPct: 55,
    healthPct: 94,
    crewSafetyPct: 96,
    oxygenPct: 88,
    powerPct: 90,
    budgetRemainingM: specs.budgetRemainingM,
    distanceFromDestKm: 5000,
    totalDistanceKm: 384400,
    travelTimeHours: 64,
    progressPct: 98,
    velocityKms: 0.4,
    altitudeKm: 10,
    scienceDataPoints: 800,
    objectivesCompleted: 3,
    totalObjectives: 4,
    countdownSeconds: 0,
    activeBurn: false,
    shieldActive: false,
    waypointsCollected: 3,
    hazardsAvoided: 4,
  };

  telemetry = stepMissionTelemetry(telemetry, 1.5, specs, 'intermediate', {
    thrusting: false,
    shielding: false,
    scanning: true,
  });

  assert.equal(telemetry.phase, 'complete');
  assert.equal(telemetry.progressPct, 100);

  const score = calculateMissionScore(telemetry, specs, 'moon', 'intermediate');
  assert.equal(score.victory, true);
  assert.ok(score.totalScore > 6000);
  assert.ok(score.unlockedBadges.includes('artemis_pioneer'));
  assert.ok(score.unlockedBadges.includes('tsiolkovsky_master'));
  assert.ok(score.unlockedBadges.includes('zero_harm_director'));
});
