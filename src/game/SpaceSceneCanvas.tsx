import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AstronautEVAState,
  CameraViewMode,
  GameState,
  MissionModeId,
  MissionPhase,
  SimulationControlMode,
  SpacecraftConfiguration,
} from './types';
import {
  createInitialAstronautState,
  HABITAT_BASE_POS,
  stepAstronautSimulation,
} from './rules';
import { soundEngine } from './audio';

interface SpaceSceneCanvasProps {
  gameState: GameState;
  modeId: MissionModeId;
  phase: MissionPhase;
  simMode: SimulationControlMode;
  cameraView: CameraViewMode;
  config: SpacecraftConfiguration;
  progressPct: number;
  activeBurn: boolean;
  shieldActive: boolean;
  scanning: boolean;
  virtualInput: {
    moveX: number;
    moveZ: number;
    jetpack: boolean;
    sprint: boolean;
    interactTrigger: number;
    roverToggleTrigger: number;
  };
  onCollectWaypoint: (bonusPoints: number, label: string) => void;
  onHazardCollision: (damage: number, safetyLoss: number, hazardName: string) => void;
  onSteerActivity: (isThrusting: boolean) => void;
  onAstronautStateUpdate: (state: AstronautEVAState) => void;
  onBoardRocketFromEVA: () => void;
}

// Pre-allocated scratch math helpers outside the render loop (Zero-GC discipline)
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3CamTarget = new THREE.Vector3();
const _vec3LookTarget = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

interface HazardEntity {
  group: THREE.Group;
  archetype: 'meteoroid_swarm' | 'cme_plasma_ring' | 'rogue_debris';
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  baseY: number;
  phaseOffset: number;
  telegraphMesh: THREE.Mesh;
  windupTimer: number;
  telegraphed: boolean;
  hitCooldown: number;
}

interface WaypointEntity {
  group: THREE.Group;
  position: THREE.Vector3;
  collected: boolean;
  respawnTimer: number;
  label: string;
}

interface SurfaceNodeEntity {
  group: THREE.Group;
  x: number;
  z: number;
  type: 'sample' | 'flag';
  label: string;
  collectedOrPlanted: boolean;
  cooldown: number;
}

const PARTICLE_POOL_SIZE = 160;
const GROUND_Y = -4.0;

export const SpaceSceneCanvas: React.FC<SpaceSceneCanvasProps> = ({
  gameState,
  modeId,
  phase,
  simMode,
  cameraView,
  config,
  progressPct,
  activeBurn,
  shieldActive,
  scanning,
  virtualInput,
  onCollectWaypoint,
  onHazardCollision,
  onSteerActivity,
  onAstronautStateUpdate,
  onBoardRocketFromEVA,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const propsRef = useRef({
    gameState,
    modeId,
    phase,
    simMode,
    cameraView,
    config,
    progressPct,
    activeBurn,
    shieldActive,
    scanning,
    virtualInput,
    onCollectWaypoint,
    onHazardCollision,
    onSteerActivity,
    onAstronautStateUpdate,
    onBoardRocketFromEVA,
  });
  propsRef.current = {
    gameState,
    modeId,
    phase,
    simMode,
    cameraView,
    config,
    progressPct,
    activeBurn,
    shieldActive,
    scanning,
    virtualInput,
    onCollectWaypoint,
    onHazardCollision,
    onSteerActivity,
    onAstronautStateUpdate,
    onBoardRocketFromEVA,
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL detection from GPU renderer string
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(
      container.clientWidth || window.innerWidth,
      container.clientHeight || window.innerHeight
    );

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070d);
    scene.fog = new THREE.FogExp2(0x05070d, 0.0042);

    // 2. Mandatory Studio Environment Reflection (RoomEnvironment)
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      55,
      (container.clientWidth || window.innerWidth) /
        (container.clientHeight || window.innerHeight),
      0.1,
      1200
    );
    camera.position.set(0, 6, 18);

    // 3. Balanced 3-Point Aerospace Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x1e1b4b, 0.85);
    scene.add(hemiLight);

    const sunKeyLight = new THREE.DirectionalLight(0xfff3d6, 2.4);
    sunKeyLight.position.set(28, 36, 24);
    sunKeyLight.castShadow = !isSoftwareGl;
    sunKeyLight.shadow.mapSize.set(1024, 1024);
    sunKeyLight.shadow.camera.near = 1;
    sunKeyLight.shadow.camera.far = 120;
    const d = 26;
    sunKeyLight.shadow.camera.left = -d;
    sunKeyLight.shadow.camera.right = d;
    sunKeyLight.shadow.camera.top = d;
    sunKeyLight.shadow.camera.bottom = -d;
    sunKeyLight.shadow.bias = -0.0005;
    sunKeyLight.shadow.normalBias = 0.02;
    scene.add(sunKeyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.15);
    rimLight.position.set(-22, 12, -20);
    scene.add(rimLight);

    // 4. Procedural Textures (SRGBColorSpace + maxAnisotropy)
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const createPlanetaryTexture = (
      baseColor: string,
      bandColor1: string,
      bandColor2: string,
      craterMode: boolean
    ) => {
      const cvs = document.createElement('canvas');
      cvs.width = 512;
      cvs.height = 256;
      const ctx = cvs.getContext('2d')!;
      ctx.fillStyle = baseColor;
      ctx.fillRect(0, 0, 512, 256);

      for (let i = 0; i < 28; i++) {
        ctx.fillStyle = i % 2 === 0 ? bandColor1 : bandColor2;
        ctx.globalAlpha = 0.25 + (i % 5) * 0.06;
        const y = (i * 37) % 240;
        const h = 6 + (i % 18);
        ctx.fillRect(0, y, 512, h);
      }

      if (craterMode) {
        for (let c = 0; c < 45; c++) {
          const cx = ((c * 73) % 490) + 10;
          const cy = ((c * 41) % 230) + 12;
          const r = 4 + (c % 14);
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      const tex = new THREE.CanvasTexture(cvs);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = maxAniso;
      return tex;
    };

    const createBumpTexture = () => {
      const cvs = document.createElement('canvas');
      cvs.width = 256;
      cvs.height = 256;
      const ctx = cvs.getContext('2d')!;
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 160; i++) {
        const x = (i * 53) % 256;
        const y = (i * 97) % 256;
        const r = 2 + (i % 10);
        ctx.fillStyle = i % 2 === 0 ? '#b0b0b0' : '#505050';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      const tex = new THREE.CanvasTexture(cvs);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = maxAniso;
      return tex;
    };

    const earthTex = createPlanetaryTexture('#0c4a6e', '#15803d', '#e0f2fe', false);
    const moonTex = createPlanetaryTexture('#64748b', '#475569', '#94a3b8', true);
    const marsTex = createPlanetaryTexture('#9a3412', '#c2410c', '#7c2d12', true);
    const jupiterTex = createPlanetaryTexture('#78350f', '#d97706', '#a855f7', false);
    const bumpTex = createBumpTexture();

    // 5. Starfield InstancedMesh
    const STAR_COUNT = 550;
    const starGeo = new THREE.OctahedronGeometry(0.18, 0);
    const starMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const starInstanced = new THREE.InstancedMesh(starGeo, starMat, STAR_COUNT);
    const starPalette = [0xffffff, 0xbae6fd, 0xfde68a, 0xe9d5ff, 0x67e8f9];

    for (let i = 0; i < STAR_COUNT; i++) {
      const r = 65 + ((i * 19) % 180);
      const theta = (i * 2.39996) % (Math.PI * 2);
      const phi = Math.acos(2 * ((i % 100) / 100) - 1);
      _vec3A.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      const s = 0.6 + (i % 5) * 0.25;
      _scale.set(s, s, s);
      _quat.identity();
      _mat4.compose(_vec3A, _quat, _scale);
      starInstanced.setMatrixAt(i, _mat4);
      _color.setHex(starPalette[i % starPalette.length]);
      starInstanced.setColorAt(i, _color);
    }
    starInstanced.instanceMatrix.needsUpdate = true;
    if (starInstanced.instanceColor) starInstanced.instanceColor.needsUpdate = true;
    starInstanced.computeBoundingSphere();
    scene.add(starInstanced);

    // 6. Planetary Vista
    const vistaGroup = new THREE.Group();
    scene.add(vistaGroup);

    const earthSphere = new THREE.Mesh(
      new THREE.SphereGeometry(14, 32, 32),
      new THREE.MeshStandardMaterial({ map: earthTex, roughness: 0.55, metalness: 0.1 })
    );
    earthSphere.position.set(-34, -14, -46);
    vistaGroup.add(earthSphere);

    const earthHalo = new THREE.Mesh(
      new THREE.RingGeometry(14.3, 15.6, 48),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      })
    );
    earthHalo.position.copy(earthSphere.position);
    vistaGroup.add(earthHalo);

    const destPlanetGroup = new THREE.Group();
    destPlanetGroup.position.set(28, 10, -52);
    vistaGroup.add(destPlanetGroup);

    const destPlanetMat = new THREE.MeshStandardMaterial({
      map: moonTex,
      bumpMap: bumpTex,
      bumpScale: 0.25,
      roughness: 0.78,
      metalness: 0.12,
    });
    const destPlanetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(11, 32, 32),
      destPlanetMat
    );
    destPlanetGroup.add(destPlanetMesh);

    const planetaryRingMesh = new THREE.Mesh(
      new THREE.RingGeometry(13.5, 20.5, 48),
      new THREE.MeshStandardMaterial({
        color: 0xc084fc,
        roughness: 0.4,
        metalness: 0.3,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    planetaryRingMesh.rotation.x = Math.PI * 0.38;
    destPlanetGroup.add(planetaryRingMesh);

    // 7. Planetary Surface Terrain, Habitat Base, Rover, & Science Outcrops
    const terrainGroup = new THREE.Group();
    scene.add(terrainGroup);

    const groundMat = new THREE.MeshStandardMaterial({
      map: moonTex,
      bumpMap: bumpTex,
      bumpScale: 0.4,
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.1,
    });
    const groundPlane = new THREE.Mesh(
      new THREE.CylinderGeometry(48, 52, 2, 48),
      groundMat
    );
    groundPlane.position.set(0, -5.0, 0);
    groundPlane.receiveShadow = !isSoftwareGl;
    terrainGroup.add(groundPlane);

    // Subtle navigation grid ring around base on ground (offset Y to avoid Z-fighting)
    const baseGridRing = new THREE.Mesh(
      new THREE.RingGeometry(21.2, 21.5, 64),
      new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
      })
    );
    baseGridRing.rotation.x = -Math.PI / 2;
    baseGridRing.position.set(0, GROUND_Y + 0.02, 0);
    terrainGroup.add(baseGridRing);

    // Natural perimeter boulders (InstancedMesh of 28 boulders)
    const boulderGeo = new THREE.DodecahedronGeometry(1.4, 1);
    const boulderMat = new THREE.MeshStandardMaterial({
      bumpMap: bumpTex,
      bumpScale: 0.2,
      roughness: 0.88,
      metalness: 0.12,
    });
    const boulderInstanced = new THREE.InstancedMesh(boulderGeo, boulderMat, 28);
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2;
      const rad = 24 + (i % 4) * 4.5;
      _vec3A.set(Math.cos(angle) * rad, -3.7 + (i % 3) * 0.2, Math.sin(angle) * rad);
      _euler.set((i * 0.7) % 3, (i * 1.3) % 3, 0);
      _quat.setFromEuler(_euler);
      const sx = 0.85 + (i % 5) * 0.22;
      const sy = 0.65 + (i % 3) * 0.25;
      _scale.set(sx, sy, sx);
      _mat4.compose(_vec3A, _quat, _scale);
      boulderInstanced.setMatrixAt(i, _mat4);
      _color.setHex(i % 2 === 0 ? 0x64748b : 0x475569);
      boulderInstanced.setColorAt(i, _color);
    }
    boulderInstanced.instanceMatrix.needsUpdate = true;
    if (boulderInstanced.instanceColor) boulderInstanced.instanceColor.needsUpdate = true;
    boulderInstanced.computeBoundingSphere();
    terrainGroup.add(boulderInstanced);

    // Launch Pad & Umbilical Tower
    const launchPadGroup = new THREE.Group();
    launchPadGroup.position.set(0, GROUND_Y, 0);
    terrainGroup.add(launchPadGroup);

    const padBase = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8, 4.5, 0.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75, metalness: 0.3 })
    );
    padBase.position.y = 0.25;
    launchPadGroup.add(padBase);

    const towerMast = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 11.5, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45, metalness: 0.75 })
    );
    towerMast.position.set(-3.2, 5.8, -1.2);
    launchPadGroup.add(towerMast);

    for (let armIdx = 0; armIdx < 3; armIdx++) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(2.8, 0.24, 0.35),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.65 })
      );
      arm.position.set(-1.8, 3.8 + armIdx * 2.6, -1.2);
      launchPadGroup.add(arm);
    }

    // 7B. Composite 7-Part Geodesic Habitat Dome & O2 Recharge Station at (-11, -7)
    const habitatGroup = new THREE.Group();
    habitatGroup.position.set(HABITAT_BASE_POS.x, GROUND_Y, HABITAT_BASE_POS.z);
    terrainGroup.add(habitatGroup);

    const habFoundation = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 3.9, 0.4, 24),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7, metalness: 0.4 })
    );
    habFoundation.position.y = 0.2;
    habitatGroup.add(habFoundation);

    const habDome = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.35, metalness: 0.3 })
    );
    habDome.position.y = 0.35;
    habitatGroup.add(habDome);

    const habAirlock = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 1.8, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.4, metalness: 0.65 })
    );
    habAirlock.position.set(2.4, 1.0, 1.8);
    habAirlock.rotation.y = 0.65;
    habitatGroup.add(habAirlock);

    const habWindow = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 1.1, 0.15),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    habWindow.position.set(3.05, 1.05, 2.45);
    habWindow.rotation.y = 0.65;
    habitatGroup.add(habWindow);

    const habBeaconMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.8, roughness: 0.2 })
    );
    habBeaconMast.position.set(0, 4.2, 0);
    habitatGroup.add(habBeaconMast);

    const habRechargeRing = new THREE.Mesh(
      new THREE.RingGeometry(4.1, 4.5, 36),
      new THREE.MeshBasicMaterial({
        color: 0x10b981,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    );
    habRechargeRing.rotation.x = -Math.PI / 2;
    habRechargeRing.position.y = 0.03;
    habitatGroup.add(habRechargeRing);

    // 7C. Composite 9-Part Driveable 6-Wheel NASA Surface Rover
    const roverGroup = new THREE.Group();
    roverGroup.position.set(10.5, GROUND_Y, -4.5);
    terrainGroup.add(roverGroup);

    const roverShadow = new THREE.Mesh(
      new THREE.CircleGeometry(2.1, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      })
    );
    roverShadow.rotation.x = -Math.PI / 2;
    roverShadow.position.y = 0.02;
    roverGroup.add(roverShadow);

    const roverChassis = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.65, 2.3),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35, metalness: 0.6 })
    );
    roverChassis.position.y = 0.85;
    roverGroup.add(roverChassis);

    const roverGoldDeck = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.25, 1.8),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.85 })
    );
    roverGoldDeck.position.y = 1.25;
    roverGroup.add(roverGoldDeck);

    // 6 Rocker-Bogie Wheels
    const roverWheels: THREE.Mesh[] = [];
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
      metalness: 0.35,
    });
    const wheelOffsets = [
      [-1.0, 0.42, -0.95],
      [1.0, 0.42, -0.95],
      [-1.05, 0.42, 0.0],
      [1.05, 0.42, 0.0],
      [-1.0, 0.42, 0.95],
      [1.0, 0.42, 0.95],
    ];
    wheelOffsets.forEach(([wx, wy, wz]) => {
      const wMesh = new THREE.Mesh(wheelGeo, wheelMat);
      wMesh.position.set(wx, wy, wz);
      roverGroup.add(wMesh);
      roverWheels.push(wMesh);
    });

    // Rover SuperCam Mast & Head
    const roverMast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.1, 1.2, 12),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.8 })
    );
    roverMast.position.set(0.35, 1.85, 0.65);
    roverGroup.add(roverMast);

    const roverHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.32, 0.38),
      new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3, metalness: 0.5 })
    );
    roverHead.position.set(0.35, 2.48, 0.7);
    roverGroup.add(roverHead);

    const roverLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.11, 0.15, 12),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    roverLens.rotation.x = Math.PI / 2;
    roverLens.position.set(0.35, 2.48, 0.88);
    roverGroup.add(roverLens);

    // 7D. Interactive Surface Science Sample Nodes & Flag Deployment Sites
    const surfaceNodes: SurfaceNodeEntity[] = [];
    const nodeSpecs: {
      x: number;
      z: number;
      type: 'sample' | 'flag';
      label: string;
    }[] = [
      { x: 6.5, z: 9.0, type: 'flag', label: 'Artemis / NASA Flag Deployment Site' },
      { x: -7.5, z: 8.5, type: 'sample', label: 'Cryogenic Water-Ice Regolith Core' },
      { x: 13.5, z: 5.5, type: 'sample', label: 'Hydrothermal Silicate Outcrop' },
      { x: -13.0, z: 4.0, type: 'sample', label: 'Subsurface Seismic & Mass-Spec Node' },
      { x: 3.0, z: -12.5, type: 'sample', label: 'Ancient Crater Rim Mineral Vein' },
    ];

    nodeSpecs.forEach((spec) => {
      const nGroup = new THREE.Group();
      nGroup.position.set(spec.x, GROUND_Y, spec.z);

      const markerRing = new THREE.Mesh(
        new THREE.RingGeometry(1.1, 1.35, 24),
        new THREE.MeshBasicMaterial({
          color: spec.type === 'flag' ? 0xf59e0b : 0x22d3ee,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
          depthWrite: false,
        })
      );
      markerRing.rotation.x = -Math.PI / 2;
      markerRing.position.y = 0.03;
      nGroup.add(markerRing);

      if (spec.type === 'flag') {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8),
          new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.85, roughness: 0.2 })
        );
        pole.position.y = 1.3;
        nGroup.add(pole);

        const banner = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.72, 0.04),
          new THREE.MeshStandardMaterial({
            color: 0x06b6d4,
            emissive: 0x0284c7,
            emissiveIntensity: 0.4,
            roughness: 0.3,
          })
        );
        banner.position.set(0.62, 2.2, 0);
        nGroup.add(banner);
      } else {
        const crystalCluster = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.65, 0),
          new THREE.MeshStandardMaterial({
            color: 0x22d3ee,
            emissive: 0x06b6d4,
            emissiveIntensity: 0.55,
            roughness: 0.15,
            metalness: 0.85,
          })
        );
        crystalCluster.position.y = 0.75;
        nGroup.add(crystalCluster);
      }

      terrainGroup.add(nGroup);
      surfaceNodes.push({
        group: nGroup,
        x: spec.x,
        z: spec.z,
        type: spec.type,
        label: spec.label,
        collectedOrPlanted: false,
        cooldown: 0,
      });
    });

    // 7E. Composite 11-Part Playable 3D Astronaut ("Admi") Model (THREE.Group)
    const astronautRoot = new THREE.Group();
    astronautRoot.position.set(4.2, GROUND_Y, 6.5);
    terrainGroup.add(astronautRoot);

    // Contact shadow disc under astronaut feet
    const astroShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.85, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    );
    astroShadow.rotation.x = -Math.PI / 2;
    astroShadow.position.y = 0.025;
    astronautRoot.add(astroShadow);

    const astroBodyPivot = new THREE.Group();
    astronautRoot.add(astroBodyPivot);

    const suitWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.42,
      metalness: 0.25,
    });
    const suitJointMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.68,
      metalness: 0.45,
    });
    const visorGoldMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.1,
      metalness: 0.95,
      emissive: 0x78350f,
      emissiveIntensity: 0.2,
    });
    const suitAccentMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 0.6,
      roughness: 0.2,
    });

    // 1. Torso EMU Upper Suit
    const astroTorso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.36, 0.52, 8, 16),
      suitWhiteMat
    );
    astroTorso.position.y = 1.28;
    astroTorso.castShadow = !isSoftwareGl;
    astroBodyPivot.add(astroTorso);

    // 2. Chest Display Control Module (DCM)
    const astroChestDcm = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.28, 0.18),
      suitJointMat
    );
    astroChestDcm.position.set(0, 1.32, 0.32);
    astroBodyPivot.add(astroChestDcm);

    const astroChestLed = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.1, 0.04),
      suitAccentMat
    );
    astroChestLed.position.set(0, 1.35, 0.41);
    astroBodyPivot.add(astroChestLed);

    // 3. PLSS Life-Support Backpack + Oxygen Cylinders + Antenna
    const astroBackpack = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.76, 0.36),
      suitWhiteMat
    );
    astroBackpack.position.set(0, 1.34, -0.34);
    astroBodyPivot.add(astroBackpack);

    const astroAntenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8),
      suitJointMat
    );
    astroAntenna.position.set(0.2, 1.92, -0.38);
    astroBodyPivot.add(astroAntenna);

    const astroAntennaTip = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 8, 8),
      suitAccentMat
    );
    astroAntennaTip.position.set(0.2, 2.2, -0.38);
    astroBodyPivot.add(astroAntennaTip);

    // 4. Helmet Shell & Gold Reflective Solar Visor
    const astroHelmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 20, 20),
      suitWhiteMat
    );
    astroHelmet.position.set(0, 1.92, 0);
    astroBodyPivot.add(astroHelmet);

    const astroVisor = new THREE.Mesh(
      new THREE.SphereGeometry(0.31, 18, 18),
      visorGoldMat
    );
    astroVisor.position.set(0, 1.92, 0.08);
    astroVisor.scale.set(0.96, 0.82, 0.9);
    astroBodyPivot.add(astroVisor);

    // 5 & 6. Articulated Left & Right Arms
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.46, 1.54, 0);
    astroBodyPivot.add(leftArmPivot);
    const leftArmMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.12, 0.45, 8, 12),
      suitWhiteMat
    );
    leftArmMesh.position.y = -0.26;
    leftArmPivot.add(leftArmMesh);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.46, 1.54, 0);
    astroBodyPivot.add(rightArmPivot);
    const rightArmMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.12, 0.45, 8, 12),
      suitWhiteMat
    );
    rightArmMesh.position.y = -0.26;
    rightArmPivot.add(rightArmMesh);

    // 7 & 8. Articulated Left & Right Legs + Boots
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.2, 0.86, 0);
    astroBodyPivot.add(leftLegPivot);
    const leftLegMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14, 0.48, 8, 12),
      suitWhiteMat
    );
    leftLegMesh.position.y = -0.32;
    leftLegPivot.add(leftLegMesh);
    const leftBoot = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.18, 0.38),
      suitJointMat
    );
    leftBoot.position.set(0, -0.68, 0.05);
    leftLegPivot.add(leftBoot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.2, 0.86, 0);
    astroBodyPivot.add(rightLegPivot);
    const rightLegMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.14, 0.48, 8, 12),
      suitWhiteMat
    );
    rightLegMesh.position.y = -0.32;
    rightLegPivot.add(rightLegMesh);
    const rightBoot = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.18, 0.38),
      suitJointMat
    );
    rightBoot.position.set(0, -0.68, 0.05);
    rightLegPivot.add(rightBoot);

    // 8. Hero Composite Spacecraft & Rocket Assembly (11-part THREE.Group)
    const spacecraftRoot = new THREE.Group();
    spacecraftRoot.position.set(0, 0, 0);
    scene.add(spacecraftRoot);

    const contactShadow = new THREE.Mesh(
      new THREE.CircleGeometry(3.4, 32),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.42,
        depthWrite: false,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, GROUND_Y + 0.04, 0);
    terrainGroup.add(contactShadow);

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.32,
      metalness: 0.65,
    });
    const goldFoilMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.22,
      metalness: 0.88,
    });
    const darkCarbonMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.68,
      metalness: 0.35,
    });
    const solarPanelMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.15,
      metalness: 0.82,
      emissive: 0x0369a1,
      emissiveIntensity: 0.25,
    });
    const canopyGlassMat = new THREE.MeshPhysicalMaterial({
      color: 0x38bdf8,
      roughness: 0.1,
      metalness: 0.1,
      transmission: isSoftwareGl ? 0 : 0.85,
      transparent: true,
      opacity: isSoftwareGl ? 0.55 : 0.95,
      clearcoat: 1.0,
    });
    const engineGlowMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });

    const serviceHull = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.25, 2.8, 24),
      hullMat
    );
    spacecraftRoot.add(serviceHull);

    const goldCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.27, 1.27, 0.75, 24),
      goldFoilMat
    );
    goldCollar.position.y = -0.55;
    spacecraftRoot.add(goldCollar);

    const commandCone = new THREE.Mesh(
      new THREE.ConeGeometry(1.15, 1.65, 24),
      hullMat
    );
    commandCone.position.y = 2.22;
    spacecraftRoot.add(commandCone);

    const viewportWindow = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 16, 16),
      canopyGlassMat
    );
    viewportWindow.position.set(0, 2.05, 0.78);
    viewportWindow.scale.set(1.1, 0.75, 0.5);
    spacecraftRoot.add(viewportWindow);

    const dockingCollar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.48, 0.45, 16),
      darkCarbonMat
    );
    dockingCollar.position.y = 3.15;
    spacecraftRoot.add(dockingCollar);

    const engineNozzle = new THREE.Mesh(
      new THREE.ConeGeometry(0.78, 1.25, 20, 1, true),
      darkCarbonMat
    );
    engineNozzle.position.y = -1.95;
    spacecraftRoot.add(engineNozzle);

    const engineCoreGlow = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 16),
      engineGlowMat
    );
    engineCoreGlow.rotation.x = Math.PI / 2;
    engineCoreGlow.position.y = -2.45;
    spacecraftRoot.add(engineCoreGlow);

    const solarWingsGroup = new THREE.Group();
    spacecraftRoot.add(solarWingsGroup);

    const leftWing = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.08, 1.15),
      solarPanelMat
    );
    leftWing.position.set(-3.0, 0.15, 0);
    solarWingsGroup.add(leftWing);

    const rightWing = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.08, 1.15),
      solarPanelMat
    );
    rightWing.position.set(3.0, 0.15, 0);
    solarWingsGroup.add(rightWing);

    const landingLegsGroup = new THREE.Group();
    spacecraftRoot.add(landingLegsGroup);
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + Math.PI / 4;
      const strut = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.9, 8),
        darkCarbonMat
      );
      strut.position.set(Math.cos(ang) * 1.45, -1.65, Math.sin(ang) * 1.45);
      strut.rotation.z = -Math.cos(ang) * 0.42;
      strut.rotation.x = Math.sin(ang) * 0.42;
      landingLegsGroup.add(strut);

      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.34, 0.1, 12),
        goldFoilMat
      );
      pad.position.set(Math.cos(ang) * 1.85, -2.42, Math.sin(ang) * 1.85);
      landingLegsGroup.add(pad);
    }

    const heavyBoosterGroup = new THREE.Group();
    heavyBoosterGroup.position.y = -4.2;
    spacecraftRoot.add(heavyBoosterGroup);

    const mainCoreBooster = new THREE.Mesh(
      new THREE.CylinderGeometry(1.28, 1.35, 4.4, 24),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.55 })
    );
    heavyBoosterGroup.add(mainCoreBooster);

    const sideBoosterL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.6, 3.8, 16),
      hullMat
    );
    sideBoosterL.position.set(-1.85, -0.2, 0);
    heavyBoosterGroup.add(sideBoosterL);

    const sideBoosterR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.6, 3.8, 16),
      hullMat
    );
    sideBoosterR.position.set(1.85, -0.2, 0);
    heavyBoosterGroup.add(sideBoosterR);

    const shieldBubble = new THREE.Mesh(
      new THREE.SphereGeometry(3.8, 24, 24),
      new THREE.MeshBasicMaterial({
        color: 0x06b6d4,
        wireframe: true,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      })
    );
    shieldBubble.visible = false;
    spacecraftRoot.add(shieldBubble);

    // 9. Zero-GC Pooled Particle Ring Buffer
    const particleGeo = new THREE.SphereGeometry(0.22, 8, 8);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const particleMesh = new THREE.InstancedMesh(
      particleGeo,
      particleMat,
      PARTICLE_POOL_SIZE
    );
    particleMesh.frustumCulled = false;
    scene.add(particleMesh);

    const particlePositions = new Float32Array(PARTICLE_POOL_SIZE * 3);
    const particleVelocities = new Float32Array(PARTICLE_POOL_SIZE * 3);
    const particleLife = new Float32Array(PARTICLE_POOL_SIZE);
    const particleMaxLife = new Float32Array(PARTICLE_POOL_SIZE);
    const particleColors = new Uint32Array(PARTICLE_POOL_SIZE);
    let particleWriteIdx = 0;

    const spawnParticle = (
      x: number,
      y: number,
      z: number,
      vx: number,
      vy: number,
      vz: number,
      life: number,
      hexColor: number
    ) => {
      const idx = particleWriteIdx;
      particleWriteIdx = (particleWriteIdx + 1) % PARTICLE_POOL_SIZE;
      particlePositions[idx * 3] = x;
      particlePositions[idx * 3 + 1] = y;
      particlePositions[idx * 3 + 2] = z;
      particleVelocities[idx * 3] = vx;
      particleVelocities[idx * 3 + 1] = vy;
      particleVelocities[idx * 3 + 2] = vz;
      particleLife[idx] = life;
      particleMaxLife[idx] = life;
      particleColors[idx] = hexColor;
    };

    // 10. Space Hazards + Waypoints
    const hazards: HazardEntity[] = [];
    const archetypes: HazardEntity['archetype'][] = [
      'meteoroid_swarm',
      'cme_plasma_ring',
      'rogue_debris',
    ];

    for (let i = 0; i < 6; i++) {
      const arch = archetypes[i % 3];
      const hGroup = new THREE.Group();

      if (arch === 'meteoroid_swarm') {
        const coreRock = new THREE.Mesh(
          new THREE.DodecahedronGeometry(1.15, 1),
          new THREE.MeshStandardMaterial({
            color: 0x78716c,
            bumpMap: bumpTex,
            bumpScale: 0.35,
            roughness: 0.88,
            metalness: 0.25,
          })
        );
        hGroup.add(coreRock);
      } else if (arch === 'cme_plasma_ring') {
        const plasmaTorus = new THREE.Mesh(
          new THREE.TorusGeometry(1.45, 0.22, 12, 28),
          new THREE.MeshStandardMaterial({
            color: 0xf59e0b,
            emissive: 0xea580c,
            emissiveIntensity: 0.85,
            roughness: 0.2,
            metalness: 0.5,
          })
        );
        hGroup.add(plasmaTorus);
      } else {
        const busBox = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 1.1, 1.1),
          new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.8 })
        );
        hGroup.add(busBox);
      }

      const telegraphMesh = new THREE.Mesh(
        new THREE.RingGeometry(1.6, 2.05, 24),
        new THREE.MeshBasicMaterial({
          color: 0xef4444,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.0,
          depthWrite: false,
        })
      );
      hGroup.add(telegraphMesh);

      const startPos = new THREE.Vector3(
        (i % 2 === 0 ? -1 : 1) * (5 + ((i * 3) % 9)),
        ((i % 3) - 1) * 3.5,
        -22 - i * 16
      );
      hGroup.position.copy(startPos);
      scene.add(hGroup);

      hazards.push({
        group: hGroup,
        archetype: arch,
        position: startPos,
        velocity: new THREE.Vector3(0, 0, 14 + (i % 3) * 3),
        baseY: startPos.y,
        phaseOffset: i * 1.4,
        telegraphMesh,
        windupTimer: 0,
        telegraphed: false,
        hitCooldown: 0,
      });
    }

    const waypoints: WaypointEntity[] = [];
    const waypointLabels = [
      'Spectrographic Core Sample',
      'Deep Space Telemetry Beacon',
      'Cryogenic Regolith Cache',
    ];
    for (let w = 0; w < 3; w++) {
      const wGroup = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.35, 0.12, 12, 28),
        new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          emissive: 0x06b6d4,
          emissiveIntensity: 0.7,
          roughness: 0.2,
          metalness: 0.8,
        })
      );
      wGroup.add(ring);

      const pos = new THREE.Vector3(
        (w - 1) * 5.5,
        (w % 2 === 0 ? 1 : -1) * 2.2,
        -18 - w * 18
      );
      wGroup.position.copy(pos);
      scene.add(wGroup);

      waypoints.push({
        group: wGroup,
        position: pos,
        collected: false,
        respawnTimer: 0,
        label: waypointLabels[w % waypointLabels.length],
      });
    }

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 11. Keyboard & Pointer Input Hub (with edge-triggered actions & blur cleanup)
    const keysPressed = new Set<string>();
    const justPressed = new Set<string>();
    let pointerX = 0;
    let pointerY = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (!keysPressed.has(e.code)) {
        justPressed.add(e.code);
      }
      keysPressed.add(e.code);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.code);
    };
    const handleBlur = () => {
      keysPressed.clear();
      justPressed.clear();
    };
    const handlePointerMove = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        pointerX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pointermove', handlePointerMove);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        }
      }
    });
    resizeObserver.observe(container);

    // 12. Simulation Loop State
    let frameId = 0;
    let lastTime = performance.now();
    let elapsedTotal = 0;
    let hitstopTimer = 0;
    let cameraTrauma = 0;
    let craftX = 0;
    let craftY = 0;
    let craftVx = 0;
    let craftVy = 0;
    let hitFlashTimer = 0;
    let lastModeId: MissionModeId | null = null;

    // Astronaut EVA state & gait animation state
    let astroState: AstronautEVAState = createInitialAstronautState();
    let walkDistanceCycle = 0;
    let astroSquashY = 1.0;
    let wasGrounded = true;
    let lastHudSyncTime = 0;
    let lastInteractTrigger = propsRef.current.virtualInput.interactTrigger;
    let lastRoverTrigger = propsRef.current.virtualInput.roverToggleTrigger;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function executeAstronautInteraction() {
      const currentProps = propsRef.current;
      // 1. Check if near Rover
      const distRover = Math.hypot(
        astroState.x - astroState.roverX,
        astroState.z - astroState.roverZ
      );
      if (distRover < 3.6 && !astroState.inRover) {
        astroState.inRover = true;
        astroState.x = astroState.roverX;
        astroState.z = astroState.roverZ;
        soundEngine.playUiClick();
        currentProps.onCollectWaypoint(25, '6-Wheel NASA Surface Rover Boarded');
        return;
      }

      // 2. Check if near Surface Science Sample or Flag Node
      for (let i = 0; i < surfaceNodes.length; i++) {
        const node = surfaceNodes[i];
        const dist = Math.hypot(astroState.x - node.x, astroState.z - node.z);
        if (dist < 3.2 && node.cooldown <= 0) {
          node.collectedOrPlanted = true;
          node.cooldown = 6.0;
          astroState.samplesCarried += 1;
          if (node.type === 'flag') astroState.flagsPlanted += 1;
          soundEngine.playScienceCollect();

          for (let k = 0; k < 16; k++) {
            spawnParticle(
              node.x,
              GROUND_Y + 1.2,
              node.z,
              (Math.random() - 0.5) * 8,
              2 + Math.random() * 6,
              (Math.random() - 0.5) * 8,
              0.5,
              node.type === 'flag' ? 0xf59e0b : 0x22d3ee
            );
          }

          currentProps.onCollectWaypoint(150, node.label);
          return;
        }
      }

      // 3. Check if near Rocket Gantry to Board Rocket
      const distRocket = Math.hypot(astroState.x, astroState.z);
      if (distRocket < 4.5) {
        soundEngine.playUiClick();
        currentProps.onBoardRocketFromEVA();
      }
    }

    function tick() {
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      elapsedTotal += dt;

      const currentProps = propsRef.current;
      const isEvaActive =
        currentProps.gameState === 'title' ||
        currentProps.simMode === 'astronaut_eva';

      // Sync destination planet appearance when mission mode changes
      if (lastModeId !== currentProps.modeId) {
        lastModeId = currentProps.modeId;
        if (currentProps.modeId === 'moon') {
          destPlanetMat.map = moonTex;
          groundMat.map = moonTex;
          planetaryRingMesh.visible = false;
        } else if (currentProps.modeId === 'mars') {
          destPlanetMat.map = marsTex;
          groundMat.map = marsTex;
          planetaryRingMesh.visible = false;
        } else if (currentProps.modeId === 'satellite') {
          destPlanetMat.map = earthTex;
          groundMat.map = moonTex;
          planetaryRingMesh.visible = true;
        } else if (currentProps.modeId === 'deepspace') {
          destPlanetMat.map = jupiterTex;
          groundMat.map = moonTex;
          planetaryRingMesh.visible = true;
        } else {
          destPlanetMat.map = earthTex;
          groundMat.map = moonTex;
          planetaryRingMesh.visible = false;
        }
        destPlanetMat.needsUpdate = true;
        groundMat.needsUpdate = true;
      }

      if (hitFlashTimer > 0) {
        hitFlashTimer = Math.max(0, hitFlashTimer - dt);
        hullMat.emissive.setHex(hitFlashTimer > 0 ? 0xef4444 : 0x000000);
        hullMat.emissiveIntensity = hitFlashTimer > 0 ? 0.85 : 0;
      }
      cameraTrauma = Math.max(0, cameraTrauma - dt * 1.8);
      if (hitstopTimer > 0) {
        hitstopTimer = Math.max(0, hitstopTimer - dt);
      }

      const simDt = hitstopTimer > 0 || currentProps.gameState === 'paused' ? 0 : dt;

      earthSphere.rotation.y += simDt * 0.08;
      destPlanetMesh.rotation.y += simDt * 0.12;
      shieldBubble.visible = currentProps.shieldActive;
      if (currentProps.shieldActive) {
        shieldBubble.rotation.y += simDt * 1.4;
      }

      const phase = currentProps.phase;
      const isFlightPhase =
        !isEvaActive &&
        (phase === 'launch' || phase === 'transit' || phase === 'objective');

      terrainGroup.visible =
        isEvaActive ||
        phase === 'assembly' ||
        phase === 'countdown' ||
        (phase === 'launch' && currentProps.progressPct < 18) ||
        (phase === 'objective' &&
          (currentProps.modeId === 'moon' || currentProps.modeId === 'mars'));

      launchPadGroup.visible =
        isEvaActive ||
        phase === 'assembly' ||
        phase === 'countdown' ||
        (phase === 'launch' && currentProps.progressPct < 18);

      heavyBoosterGroup.visible =
        phase === 'assembly' ||
        phase === 'countdown' ||
        (phase === 'launch' && currentProps.progressPct < 22);

      // Animate Surface Science Nodes
      for (let i = 0; i < surfaceNodes.length; i++) {
        const sn = surfaceNodes[i];
        if (sn.cooldown > 0) {
          sn.cooldown = Math.max(0, sn.cooldown - simDt);
        }
        sn.group.rotation.y += simDt * (sn.type === 'sample' ? 1.4 : 0.2);
      }

      // =======================================================================
      // MODE A: PLAYABLE 3D ASTRONAUT ("ADMI") EVA & ROVER SURFACE SIMULATION
      // =======================================================================
      if (isEvaActive && simDt > 0) {
        let moveX = currentProps.virtualInput.moveX;
        let moveZ = currentProps.virtualInput.moveZ;

        if (currentProps.gameState === 'playing') {
          if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) moveX -= 1;
          if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) moveX += 1;
          if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp')) moveZ -= 1;
          if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown')) moveZ += 1;
        } else if (currentProps.gameState === 'title') {
          // Autonomous astronaut patrol walk on Title screen
          moveX = Math.cos(elapsedTotal * 0.55) * 0.5;
          moveZ = Math.sin(elapsedTotal * 0.55) * 0.5;
        }

        const jumpOrJetpack =
          currentProps.gameState === 'playing' &&
          (keysPressed.has('Space') || currentProps.virtualInput.jetpack);
        const sprint =
          currentProps.gameState === 'playing' &&
          (keysPressed.has('ShiftLeft') ||
            keysPressed.has('ShiftRight') ||
            currentProps.virtualInput.sprint);

        // Edge-triggered Rover toggle [G]
        if (
          justPressed.has('KeyG') ||
          currentProps.virtualInput.roverToggleTrigger !== lastRoverTrigger
        ) {
          lastRoverTrigger = currentProps.virtualInput.roverToggleTrigger;
          if (astroState.inRover) {
            astroState.inRover = false;
            astroState.x += 1.8;
            soundEngine.playUiClick();
          } else if (
            Math.hypot(
              astroState.x - astroState.roverX,
              astroState.z - astroState.roverZ
            ) < 4.5
          ) {
            astroState.inRover = true;
            astroState.x = astroState.roverX;
            astroState.z = astroState.roverZ;
            soundEngine.playUiClick();
          }
        }

        // Edge-triggered Interact [E]
        if (
          justPressed.has('KeyE') ||
          currentProps.virtualInput.interactTrigger !== lastInteractTrigger
        ) {
          lastInteractTrigger = currentProps.virtualInput.interactTrigger;
          executeAstronautInteraction();
        }

        const prevGrounded = astroState.isGrounded;
        astroState = stepAstronautSimulation(astroState, simDt, currentProps.modeId, {
          moveX,
          moveZ,
          jumpOrJetpack,
          sprint,
        });

        // Squash-and-stretch on jump takeoff and landing
        if (prevGrounded && !astroState.isGrounded) {
          astroSquashY = 1.2;
          soundEngine.playThrusterPulse();
        } else if (!wasGrounded && astroState.isGrounded) {
          astroSquashY = 0.78;
        }
        wasGrounded = astroState.isGrounded;
        astroSquashY = THREE.MathUtils.damp(astroSquashY, 1.0, 9, simDt);

        // Determine nearest interactable prompt
        let nearLabel: string | null = null;
        let nearType: AstronautEVAState['nearInteractableType'] = null;

        const distHab = Math.hypot(
          astroState.x - HABITAT_BASE_POS.x,
          astroState.z - HABITAT_BASE_POS.z
        );
        const distRov = Math.hypot(
          astroState.x - astroState.roverX,
          astroState.z - astroState.roverZ
        );
        const distPad = Math.hypot(astroState.x, astroState.z);

        if (distRov < 3.8 && !astroState.inRover) {
          nearLabel = 'Press [G] or [E] to Drive 6-Wheel NASA Rover';
          nearType = 'rover';
        } else if (astroState.inRover) {
          nearLabel = 'Driving Rover · Press [G] to Exit on Foot';
          nearType = 'rover';
        } else if (distHab < 4.8) {
          nearLabel = 'Habitat Base Airlock · Recharging Suit O₂ & Battery';
          nearType = 'habitat';
        } else if (distPad < 4.5) {
          nearLabel = 'Press [E] to Board Rocket / Enter Spacecraft Cockpit';
          nearType = 'rocket';
        } else {
          for (let i = 0; i < surfaceNodes.length; i++) {
            const sn = surfaceNodes[i];
            if (Math.hypot(astroState.x - sn.x, astroState.z - sn.z) < 3.2) {
              nearLabel = `Press [E] to Interact: ${sn.label} (+150 Sci)`;
              nearType = sn.type;
              break;
            }
          }
        }
        astroState.nearInteractableLabel = nearLabel;
        astroState.nearInteractableType = nearType;

        // Update 3D Astronaut & Rover Transforms
        const speedHoriz = Math.hypot(astroState.vx, astroState.vz);
        walkDistanceCycle += speedHoriz * simDt * 2.6;

        astronautRoot.visible = !astroState.inRover;
        astronautRoot.position.set(astroState.x, GROUND_Y + astroState.y, astroState.z);
        astronautRoot.rotation.y = astroState.headingRad;

        // Shadow stays on ground plane
        astroShadow.position.y = -astroState.y + 0.025;
        const shadowScale = Math.max(0.35, 1 - astroState.y * 0.08);
        astroShadow.scale.set(shadowScale, shadowScale, 1);

        // Articulated Arm & Leg Walking Swing + Bobbing synced to distance traveled
        const swingAmp = astroState.isGrounded
          ? Math.min(0.68, speedHoriz * 0.11)
          : 0.25;
        const swingAngle = Math.sin(walkDistanceCycle) * swingAmp;
        leftLegPivot.rotation.x = swingAngle;
        rightLegPivot.rotation.x = -swingAngle;
        leftArmPivot.rotation.x = -swingAngle * 0.85;
        rightArmPivot.rotation.x = swingAngle * 0.85;

        const walkBob = astroState.isGrounded
          ? Math.abs(Math.cos(walkDistanceCycle)) * Math.min(0.12, speedHoriz * 0.02)
          : 0;
        astroBodyPivot.position.y = walkBob;
        astroBodyPivot.scale.set(
          1 / Math.sqrt(astroSquashY),
          astroSquashY,
          1 / Math.sqrt(astroSquashY)
        );

        // Jetpack thruster particles
        if (astroState.jetpackActive) {
          for (let p = 0; p < 2; p++) {
            spawnParticle(
              astroState.x - Math.sin(astroState.headingRad) * 0.35,
              GROUND_Y + astroState.y + 1.0,
              astroState.z - Math.cos(astroState.headingRad) * 0.35,
              (Math.random() - 0.5) * 1.8,
              -3.5 - Math.random() * 2.5,
              (Math.random() - 0.5) * 1.8,
              0.28,
              0x22d3ee
            );
          }
        } else if (astroState.isGrounded && speedHoriz > 2.2 && Math.random() < 0.35) {
          // Lunar/Martian dust footstep puff
          spawnParticle(
            astroState.x + (Math.random() - 0.5) * 0.4,
            GROUND_Y + 0.15,
            astroState.z + (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 1.2,
            0.6 + Math.random() * 0.8,
            (Math.random() - 0.5) * 1.2,
            0.35,
            currentProps.modeId === 'mars' ? 0xea580c : 0x94a3b8
          );
        }

        // Update Rover Position & Spinning Wheels
        roverGroup.position.set(astroState.roverX, GROUND_Y, astroState.roverZ);
        roverGroup.rotation.y = astroState.roverHeadingRad;
        if (astroState.inRover && speedHoriz > 0.2) {
          roverWheels.forEach((w) => {
            w.rotation.x += speedHoriz * simDt * 1.5;
          });
        }

        // Throttle React HUD state sync to ~10Hz
        if (now - lastHudSyncTime > 100) {
          lastHudSyncTime = now;
          currentProps.onAstronautStateUpdate({ ...astroState });
        }
      }

      // =======================================================================
      // MODE B: ROCKET & SPACECRAFT ORBITAL FLIGHT SIMULATION
      // =======================================================================
      const isDeployedWings =
        phase !== 'assembly' && phase !== 'countdown' && phase !== 'launch';
      solarWingsGroup.visible = isDeployedWings;
      const targetWingScale = isDeployedWings ? 1.0 : 0.01;
      solarWingsGroup.scale.x = THREE.MathUtils.damp(
        solarWingsGroup.scale.x,
        targetWingScale,
        5,
        dt
      );

      let flightMoveX = 0;
      let flightMoveY = 0;
      if (currentProps.gameState === 'playing' && isFlightPhase) {
        if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) flightMoveX -= 1;
        if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) flightMoveX += 1;
        if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp')) flightMoveY += 1;
        if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown')) flightMoveY -= 1;
      }

      const isManualBurn =
        (isFlightPhase && keysPressed.has('Space')) || currentProps.activeBurn;
      currentProps.onSteerActivity(
        isManualBurn || flightMoveX !== 0 || flightMoveY !== 0
      );

      if (currentProps.gameState === 'playing' && isFlightPhase && simDt > 0) {
        craftVx = THREE.MathUtils.damp(craftVx, flightMoveX * 9.5, 6, simDt);
        craftVy = THREE.MathUtils.damp(craftVy, flightMoveY * 6.5, 6, simDt);
        craftX = THREE.MathUtils.clamp(craftX + craftVx * simDt, -9.5, 9.5);
        craftY = THREE.MathUtils.clamp(craftY + craftVy * simDt, -1.5, 6.5);

        const climbOffset =
          phase === 'launch' ? Math.min(12, currentProps.progressPct * 0.45) : 2.5;
        spacecraftRoot.position.set(craftX, craftY + climbOffset, 0);

        spacecraftRoot.rotation.z = THREE.MathUtils.damp(
          spacecraftRoot.rotation.z,
          -flightMoveX * 0.38,
          7,
          simDt
        );
        spacecraftRoot.rotation.x = THREE.MathUtils.damp(
          spacecraftRoot.rotation.x,
          phase === 'launch' ? -0.15 : -0.95 + flightMoveY * 0.25,
          5,
          simDt
        );
        spacecraftRoot.rotation.y = THREE.MathUtils.damp(
          spacecraftRoot.rotation.y,
          0,
          5,
          simDt
        );

        const exhaustCount = isManualBurn ? 3 : 1;
        for (let p = 0; p < exhaustCount; p++) {
          spawnParticle(
            spacecraftRoot.position.x + (Math.random() - 0.5) * 0.6,
            spacecraftRoot.position.y - 1.8,
            spacecraftRoot.position.z + 1.5,
            (Math.random() - 0.5) * 2.2,
            -3.5 - Math.random() * 3.0,
            6.5 + Math.random() * 4.5,
            0.38 + Math.random() * 0.22,
            isManualBurn ? 0x22d3ee : 0xf59e0b
          );
        }
      } else {
        craftX = THREE.MathUtils.damp(craftX, 0, 4, dt);
        craftY = THREE.MathUtils.damp(craftY, 0, 4, dt);
        spacecraftRoot.position.set(craftX, 2.6, 0);
        spacecraftRoot.rotation.x = THREE.MathUtils.damp(
          spacecraftRoot.rotation.x,
          0,
          4,
          dt
        );
        spacecraftRoot.rotation.z = THREE.MathUtils.damp(
          spacecraftRoot.rotation.z,
          0,
          4,
          dt
        );
        spacecraftRoot.rotation.y += dt * 0.22;

        if (phase === 'countdown') {
          spawnParticle(
            (Math.random() - 0.5) * 2.2,
            -2.8,
            (Math.random() - 0.5) * 2.2,
            (Math.random() - 0.5) * 3.5,
            1.5 + Math.random() * 2.0,
            (Math.random() - 0.5) * 3.5,
            0.55,
            0xe2e8f0
          );
        }
      }

      // Hazards & Waypoints during flight
      for (let i = 0; i < hazards.length; i++) {
        const h = hazards[i];
        h.group.visible = currentProps.gameState === 'playing' && isFlightPhase;
        if (!h.group.visible || simDt <= 0) continue;

        h.hitCooldown = Math.max(0, h.hitCooldown - simDt);
        const speedBoost = isManualBurn ? 1.45 : 1.0;
        h.position.z += h.velocity.z * speedBoost * simDt;

        if (h.archetype === 'meteoroid_swarm') {
          const seekDx = THREE.MathUtils.clamp(
            spacecraftRoot.position.x - h.position.x,
            -1,
            1
          );
          h.position.x += seekDx * 2.2 * simDt;
          h.group.rotation.x += simDt * 2.1;
          h.group.rotation.y += simDt * 1.7;
        } else if (h.archetype === 'cme_plasma_ring') {
          h.position.y =
            h.baseY + Math.sin(elapsedTotal * 2.4 + h.phaseOffset) * 2.6 + 2.5;
          const pulseScale = 1 + Math.sin(elapsedTotal * 5 + h.phaseOffset) * 0.18;
          h.group.scale.set(pulseScale, pulseScale, pulseScale);
          h.group.rotation.z += simDt * 1.5;
        } else {
          h.position.x += Math.cos(elapsedTotal * 1.8 + h.phaseOffset) * 4.2 * simDt;
          h.position.y =
            h.baseY + Math.sin(elapsedTotal * 1.8 + h.phaseOffset) * 1.8 + 2.5;
          h.group.rotation.y -= simDt * 2.4;
        }

        h.group.position.copy(h.position);

        const distZ = Math.abs(h.position.z - spacecraftRoot.position.z);
        const lateralDist = Math.hypot(
          h.position.x - spacecraftRoot.position.x,
          h.position.y - spacecraftRoot.position.y
        );

        if (h.position.z > -16 && h.position.z < -2 && lateralDist < 4.5) {
          h.windupTimer += simDt;
          const mat = h.telegraphMesh.material as THREE.MeshBasicMaterial;
          mat.opacity = 0.45 + Math.sin(elapsedTotal * 18) * 0.35;
          const ringScale = 1.0 + Math.max(0, (16 - distZ) / 16) * 0.65;
          h.telegraphMesh.scale.set(ringScale, ringScale, 1);
          if (!h.telegraphed) {
            h.telegraphed = true;
            soundEngine.playHazardTelegraph();
          }
        } else {
          (h.telegraphMesh.material as THREE.MeshBasicMaterial).opacity = 0;
        }

        const dist3D = h.position.distanceTo(spacecraftRoot.position);
        if (dist3D < 2.35 && h.hitCooldown <= 0) {
          h.hitCooldown = 2.0;
          hitstopTimer = 0.055;
          hitFlashTimer = 0.18;
          cameraTrauma = Math.min(1.0, cameraTrauma + 0.65);
          soundEngine.playHeavyImpact();

          for (let k = 0; k < 18; k++) {
            spawnParticle(
              spacecraftRoot.position.x,
              spacecraftRoot.position.y,
              spacecraftRoot.position.z,
              (Math.random() - 0.5) * 14,
              (Math.random() - 0.5) * 14,
              (Math.random() - 0.5) * 14,
              0.48,
              0xef4444
            );
          }

          const dmg = currentProps.shieldActive ? 3 : 11;
          const safetyDmg = currentProps.shieldActive ? 1 : 8;
          const label =
            h.archetype === 'meteoroid_swarm'
              ? 'Micrometeoroid Swarm Strike'
              : h.archetype === 'cme_plasma_ring'
              ? 'CME Solar Plasma Surge'
              : 'Orbital Debris Fragment Impact';
          currentProps.onHazardCollision(dmg, safetyDmg, label);
        }

        if (h.position.z > 14) {
          h.position.z = -65 - ((i * 9) % 25);
          h.position.x = (Math.random() - 0.5) * 15;
          h.baseY = (Math.random() - 0.5) * 4.5;
          h.telegraphed = false;
        }
      }

      for (let w = 0; w < waypoints.length; w++) {
        const wp = waypoints[w];
        wp.group.visible =
          currentProps.gameState === 'playing' && isFlightPhase && !wp.collected;
        if (currentProps.gameState !== 'playing' || !isFlightPhase || simDt <= 0) continue;

        if (wp.collected) {
          wp.respawnTimer -= simDt;
          if (wp.respawnTimer <= 0) {
            wp.collected = false;
            wp.position.z = -55 - w * 14;
            wp.position.x = (Math.random() - 0.5) * 13;
            wp.position.y = 1.5 + (Math.random() - 0.5) * 4;
          }
          continue;
        }

        wp.position.z += (isManualBurn ? 16 : 11) * simDt;
        wp.group.position.copy(wp.position);
        wp.group.rotation.y += simDt * 1.8;

        const dist = wp.position.distanceTo(spacecraftRoot.position);
        const collectRadius = currentProps.scanning ? 4.2 : 2.7;
        if (dist < collectRadius) {
          wp.collected = true;
          wp.respawnTimer = 4.5;
          soundEngine.playScienceCollect();
          for (let k = 0; k < 14; k++) {
            spawnParticle(
              wp.position.x,
              wp.position.y,
              wp.position.z,
              (Math.random() - 0.5) * 9,
              (Math.random() - 0.5) * 9,
              (Math.random() - 0.5) * 9,
              0.45,
              0x22d3ee
            );
          }
          currentProps.onCollectWaypoint(125, wp.label);
        }

        if (wp.position.z > 14) {
          wp.position.z = -58 - w * 12;
          wp.position.x = (Math.random() - 0.5) * 13;
        }
      }

      // Update pooled particles in-place
      for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        if (particleLife[i] > 0) {
          particleLife[i] -= dt;
          const idx3 = i * 3;
          particlePositions[idx3] += particleVelocities[idx3] * dt;
          particlePositions[idx3 + 1] += particleVelocities[idx3 + 1] * dt;
          particlePositions[idx3 + 2] += particleVelocities[idx3 + 2] * dt;

          const ratio = Math.max(
            0.01,
            particleLife[i] / Math.max(0.01, particleMaxLife[i])
          );
          _vec3A.set(
            particlePositions[idx3],
            particlePositions[idx3 + 1],
            particlePositions[idx3 + 2]
          );
          _scale.set(ratio, ratio, ratio);
          _quat.identity();
          _mat4.compose(_vec3A, _quat, _scale);
          particleMesh.setMatrixAt(i, _mat4);
          _color.setHex(particleColors[i]);
          particleMesh.setColorAt(i, _color);
        } else {
          _scale.set(0, 0, 0);
          _mat4.compose(_vec3B.set(0, -999, 0), _quat.identity(), _scale);
          particleMesh.setMatrixAt(i, _mat4);
        }
      }
      particleMesh.instanceMatrix.needsUpdate = true;
      if (particleMesh.instanceColor) particleMesh.instanceColor.needsUpdate = true;

      // Clear single-frame edge triggers
      justPressed.clear();

      // 13. Smooth Camera Choreography (Follows Astronaut in EVA mode, or Spacecraft in Flight mode)
      if (currentProps.gameState === 'title') {
        _vec3CamTarget.set(
          -5.5 + pointerX * 1.8 + Math.sin(elapsedTotal * 0.35) * 2.2,
          3.8 + pointerY * 1.1 + Math.cos(elapsedTotal * 0.28) * 0.8,
          14.5
        );
        _vec3LookTarget.set(2.5, -0.5, 1.0);
      } else if (currentProps.simMode === 'astronaut_eva') {
        const focusX = astroState.x;
        const focusY = GROUND_Y + astroState.y + 1.5;
        const focusZ = astroState.z;

        if (currentProps.cameraView === 'orbital') {
          _vec3CamTarget.set(focusX, focusY + 15, focusZ + 14);
          _vec3LookTarget.set(focusX, focusY - 1, focusZ);
        } else if (currentProps.cameraView === 'cockpit') {
          // First-Person Helmet Visor Cam!
          const fwdX = Math.sin(astroState.headingRad);
          const fwdZ = Math.cos(astroState.headingRad);
          _vec3CamTarget.set(
            focusX + fwdX * 0.45,
            GROUND_Y + astroState.y + 1.92,
            focusZ + fwdZ * 0.45
          );
          _vec3LookTarget.set(
            focusX + fwdX * 14,
            GROUND_Y + astroState.y + 1.6 + pointerY * 3,
            focusZ + fwdZ * 14
          );
        } else if (currentProps.cameraView === 'inspect') {
          _vec3CamTarget.set(
            focusX + Math.sin(elapsedTotal * 0.6) * 6.5,
            focusY + 2.2,
            focusZ + Math.cos(elapsedTotal * 0.6) * 6.5
          );
          _vec3LookTarget.set(focusX, focusY, focusZ);
        } else {
          // Third-Person Astronaut Follow Cam
          _vec3CamTarget.set(
            focusX + pointerX * 2.2,
            focusY + 3.2 + pointerY * 1.2,
            focusZ + 7.8
          );
          _vec3LookTarget.set(focusX, focusY + 0.2, focusZ - 2.0);
        }
      } else if (currentProps.cameraView === 'orbital') {
        _vec3CamTarget.set(0, 22, 26);
        _vec3LookTarget.set(0, 0, -10);
      } else if (currentProps.cameraView === 'cockpit') {
        _vec3CamTarget.set(
          spacecraftRoot.position.x,
          spacecraftRoot.position.y + 1.8,
          spacecraftRoot.position.z - 1.5
        );
        _vec3LookTarget.set(
          spacecraftRoot.position.x * 1.2,
          spacecraftRoot.position.y + 1.2,
          -35
        );
      } else if (currentProps.cameraView === 'inspect') {
        _vec3CamTarget.set(
          Math.sin(elapsedTotal * 0.5) * 11,
          4.2 + pointerY * 2,
          Math.cos(elapsedTotal * 0.5) * 11
        );
        _vec3LookTarget.copy(spacecraftRoot.position);
      } else {
        _vec3CamTarget.set(
          spacecraftRoot.position.x * 0.55 + pointerX * 0.8,
          spacecraftRoot.position.y + 3.6 + pointerY * 0.6,
          14.8
        );
        _vec3LookTarget.set(
          spacecraftRoot.position.x * 0.35,
          spacecraftRoot.position.y + 0.8,
          -12
        );
      }

      const dampFactor = 1 - Math.exp(-6.5 * dt);
      camera.position.lerp(_vec3CamTarget, dampFactor);

      if (cameraTrauma > 0) {
        const shake = cameraTrauma * cameraTrauma * 0.65;
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
      }

      const targetFov =
        (isManualBurn && isFlightPhase) || astroState.jetpackActive ? 62 : 55;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5, dt);
        camera.updateProjectionMatrix();
      }

      camera.lookAt(_vec3LookTarget);
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pointermove', handlePointerMove);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      data-testid="space-webgl-canvas"
      className="fixed inset-0 w-full h-full overflow-hidden pointer-events-auto z-0"
    />
  );
};
