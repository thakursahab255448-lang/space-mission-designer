import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  CameraViewMode,
  GameState,
  MissionModeId,
  MissionPhase,
  SpacecraftConfiguration,
} from './types';
import { soundEngine } from './audio';

interface SpaceSceneCanvasProps {
  gameState: GameState;
  modeId: MissionModeId;
  phase: MissionPhase;
  cameraView: CameraViewMode;
  config: SpacecraftConfiguration;
  progressPct: number;
  activeBurn: boolean;
  shieldActive: boolean;
  scanning: boolean;
  onCollectWaypoint: (bonusPoints: number, label: string) => void;
  onHazardCollision: (damage: number, safetyLoss: number, hazardName: string) => void;
  onSteerActivity: (isThrusting: boolean) => void;
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

const PARTICLE_POOL_SIZE = 140;

export const SpaceSceneCanvas: React.FC<SpaceSceneCanvasProps> = ({
  gameState,
  modeId,
  phase,
  cameraView,
  config,
  progressPct,
  activeBurn,
  shieldActive,
  scanning,
  onCollectWaypoint,
  onHazardCollision,
  onSteerActivity,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Store latest props in refs so React updates never tear down WebGLRenderer
  const propsRef = useRef({
    gameState,
    modeId,
    phase,
    cameraView,
    config,
    progressPct,
    activeBurn,
    shieldActive,
    scanning,
    onCollectWaypoint,
    onHazardCollision,
    onSteerActivity,
  });
  propsRef.current = {
    gameState,
    modeId,
    phase,
    cameraView,
    config,
    progressPct,
    activeBurn,
    shieldActive,
    scanning,
    onCollectWaypoint,
    onHazardCollision,
    onSteerActivity,
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
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

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
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      1200
    );
    camera.position.set(0, 6, 18);

    // 3. Balanced 3-Point Aerospace Lighting Rig (Warm Solar Key + Cool Hemisphere + Rim)
    const hemiLight = new THREE.HemisphereLight(0x7dd3fc, 0x1e1b4b, 0.85);
    scene.add(hemiLight);

    const sunKeyLight = new THREE.DirectionalLight(0xfff3d6, 2.4);
    sunKeyLight.position.set(28, 36, 24);
    sunKeyLight.castShadow = !isSoftwareGl;
    sunKeyLight.shadow.mapSize.set(1024, 1024);
    sunKeyLight.shadow.camera.near = 1;
    sunKeyLight.shadow.camera.far = 120;
    const d = 25;
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

      // Atmospheric bands or terrain patches
      for (let i = 0; i < 28; i++) {
        ctx.fillStyle = i % 2 === 0 ? bandColor1 : bandColor2;
        ctx.globalAlpha = 0.25 + (i % 5) * 0.06;
        const y = ((i * 37) % 240);
        const h = 6 + (i % 18);
        ctx.fillRect(0, y, 512, h);
      }

      if (craterMode) {
        for (let c = 0; c < 45; c++) {
          const cx = (c * 73) % 490 + 10;
          const cy = (c * 41) % 230 + 12;
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

    // 5. Starfield & Galaxy InstancedMesh (> 20 instances -> InstancedMesh with computeBoundingSphere)
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

    // 6. Planetary Vista & Destination Bodies Group
    const vistaGroup = new THREE.Group();
    scene.add(vistaGroup);

    // Departure Earth sphere in background
    const earthSphere = new THREE.Mesh(
      new THREE.SphereGeometry(14, 32, 32),
      new THREE.MeshStandardMaterial({
        map: earthTex,
        roughness: 0.55,
        metalness: 0.1,
      })
    );
    earthSphere.position.set(-34, -14, -46);
    vistaGroup.add(earthSphere);

    // Atmosphere halo ring around Earth
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

    // Target Destination Planet / Moon (changes texture & rings dynamically by modeId)
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
    const destPlanetMesh = new THREE.Mesh(new THREE.SphereGeometry(11, 32, 32), destPlanetMat);
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

    // 7. Launch Pad & Planetary Surface Terrain Group (used during assembly, countdown, launch & surface objective)
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
    const groundPlane = new THREE.Mesh(new THREE.CylinderGeometry(48, 52, 2, 48), groundMat);
    groundPlane.position.set(0, -5.0, 0);
    groundPlane.receiveShadow = !isSoftwareGl;
    terrainGroup.add(groundPlane);

    // Natural perimeter boulders around the terrain (InstancedMesh of 28 boulders)
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

    // Composite Launch Pad & Umbilical Tower (7-part THREE.Group)
    const launchPadGroup = new THREE.Group();
    launchPadGroup.position.set(0, -4.0, 0);
    terrainGroup.add(launchPadGroup);

    const padBase = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 6.2, 0.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75, metalness: 0.3 })
    );
    padBase.position.y = 0.4;
    launchPadGroup.add(padBase);

    const flameTrench = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 0.85, 7.5),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9, metalness: 0.2 })
    );
    flameTrench.position.y = 0.42;
    launchPadGroup.add(flameTrench);

    const towerMast = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 11.5, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.45, metalness: 0.75 })
    );
    towerMast.position.set(-3.8, 6.0, -1.2);
    launchPadGroup.add(towerMast);

    for (let armIdx = 0; armIdx < 3; armIdx++) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 0.28, 0.4),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4, metalness: 0.65 })
      );
      arm.position.set(-2.1, 3.8 + armIdx * 2.6, -1.2);
      launchPadGroup.add(arm);
    }

    const lightningRod = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.2, metalness: 0.9 })
    );
    lightningRod.position.set(-3.8, 12.8, -1.2);
    launchPadGroup.add(lightningRod);

    // 8. Hero Composite Spacecraft & Rocket Assembly (11-part THREE.Group across 3 silhouette scales)
    const spacecraftRoot = new THREE.Group();
    spacecraftRoot.position.set(0, 0, 0);
    scene.add(spacecraftRoot);

    // Soft radial contact shadow plane under spacecraft (offset on Y to prevent Z-fighting)
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
    contactShadow.position.set(0, -3.96, 0);
    terrainGroup.add(contactShadow);

    // Materials with varied roughness (>= 0.25 delta) and metalness
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
    const engineGlowMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
    });

    // Part 1: Service Module Main Cylinder Hull
    const serviceHull = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 2.8, 24), hullMat);
    spacecraftRoot.add(serviceHull);

    // Part 2: Thermal Kapton Gold Foil Collar
    const goldCollar = new THREE.Mesh(new THREE.CylinderGeometry(1.27, 1.27, 0.75, 24), goldFoilMat);
    goldCollar.position.y = -0.55;
    spacecraftRoot.add(goldCollar);

    // Part 3: Command Module Conical Capsule
    const commandCone = new THREE.Mesh(new THREE.ConeGeometry(1.15, 1.65, 24), hullMat);
    commandCone.position.y = 2.22;
    spacecraftRoot.add(commandCone);

    // Part 4: Glazed Cockpit Viewport Window
    const viewportWindow = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), canopyGlassMat);
    viewportWindow.position.set(0, 2.05, 0.78);
    viewportWindow.scale.set(1.1, 0.75, 0.5);
    spacecraftRoot.add(viewportWindow);

    // Part 5: Forward Docking Ring / Probe Collar
    const dockingCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.48, 0.45, 16), darkCarbonMat);
    dockingCollar.position.y = 3.15;
    spacecraftRoot.add(dockingCollar);

    // Part 6: Gimbaled Main Engine Bell (Lathe-like flared nozzle)
    const engineNozzle = new THREE.Mesh(new THREE.ConeGeometry(0.78, 1.25, 20, 1, true), darkCarbonMat);
    engineNozzle.position.y = -1.95;
    spacecraftRoot.add(engineNozzle);

    const engineCoreGlow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 16), engineGlowMat);
    engineCoreGlow.rotation.x = Math.PI / 2;
    engineCoreGlow.position.y = -2.45;
    spacecraftRoot.add(engineCoreGlow);

    // Part 7 & 8: Dual Articulated Solar Array Wings (or RTG Radiators)
    const solarWingsGroup = new THREE.Group();
    spacecraftRoot.add(solarWingsGroup);

    const leftWing = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 1.15), solarPanelMat);
    leftWing.position.set(-3.0, 0.15, 0);
    solarWingsGroup.add(leftWing);

    const rightWing = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 1.15), solarPanelMat);
    rightWing.position.set(3.0, 0.15, 0);
    solarWingsGroup.add(rightWing);

    // Part 9: High-Gain Ka-Band Parabolic Dish Antenna
    const dishGroup = new THREE.Group();
    dishGroup.position.set(0, 0.4, -1.35);
    spacecraftRoot.add(dishGroup);

    const dishBowl = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.45),
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        roughness: 0.25,
        metalness: 0.8,
        side: THREE.DoubleSide,
      })
    );
    dishBowl.rotation.x = -Math.PI * 0.65;
    dishGroup.add(dishBowl);

    // Part 10: 4 Landing Struts & Footpads + Rover/Booster Sub-Assembly
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

    // Part 11: Detachable First-Stage Heavy Booster Stack (visible during assembly, countdown & early launch)
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

    // Part 12: Energy Shield Bubble (visible when shieldActive is true)
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

    // 9. Zero-GC Pooled Particle Ring Buffer (InstancedMesh for exhaust, RCS & sparkles)
    const particleGeo = new THREE.SphereGeometry(0.22, 8, 8);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const particleMesh = new THREE.InstancedMesh(particleGeo, particleMat, PARTICLE_POOL_SIZE);
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

    // 10. 3 Distinct Space Hazard Archetypes + Collectible Science Waypoints
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
        // Archetype 1: Tumbling Silicate/Iron Meteoroid Cluster
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
        const subRock = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.65, 0),
          new THREE.MeshStandardMaterial({ color: 0xa8a29e, roughness: 0.7, metalness: 0.4 })
        );
        subRock.position.set(0.95, 0.4, 0.3);
        hGroup.add(subRock);
      } else if (arch === 'cme_plasma_ring') {
        // Archetype 2: Coronal Mass Ejection Electromagnetic Plasma Torus
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
        const innerCore = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.65, 1),
          new THREE.MeshBasicMaterial({ color: 0xfef08a, wireframe: true })
        );
        hGroup.add(innerCore);
      } else {
        // Archetype 3: Orbital Debris / Defunct Satellite Fragment
        const busBox = new THREE.Mesh(
          new THREE.BoxGeometry(1.1, 1.1, 1.1),
          new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.35, metalness: 0.8 })
        );
        hGroup.add(busBox);
        const brokenPanel = new THREE.Mesh(
          new THREE.BoxGeometry(2.6, 0.08, 0.75),
          new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.2, metalness: 0.7 })
        );
        brokenPanel.rotation.z = 0.35;
        hGroup.add(brokenPanel);
      }

      // Visible Windup Telegraph Ring (glows & expands 0.6s before close intercept)
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
        (i % 2 === 0 ? -1 : 1) * (5 + (i * 3) % 9),
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

    // Science Telemetry / Sample Waypoint Nodes
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

      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.55, 0),
        new THREE.MeshStandardMaterial({
          color: 0x67e8f9,
          emissive: 0x22d3ee,
          emissiveIntensity: 0.5,
          roughness: 0.15,
          metalness: 0.9,
        })
      );
      wGroup.add(crystal);

      const pos = new THREE.Vector3((w - 1) * 5.5, (w % 2 === 0 ? 1 : -1) * 2.2, -18 - w * 18);
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

    // Pre-warm shaders on hardware GPUs
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 11. Keyboard & Pointer Input State (with blur cleanup)
    const keysPressed = new Set<string>();
    let pointerX = 0;
    let pointerY = 0;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      keysPressed.add(e.code);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.delete(e.code);
    };
    const handleBlur = () => {
      keysPressed.clear();
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

    // 12. Simulation Loop State (clamped dt, hitstop, trauma camera shake, software-WebGL fenceSync)
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

    function tick() {
      const now = performance.now();
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      // Clamp frame delta time to <= 0.05s
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      elapsedTotal += dt;

      const currentProps = propsRef.current;

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

      // Hit flash decay & trauma decay continue during hitstop
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

      // Ambient rotation of planets
      earthSphere.rotation.y += simDt * 0.08;
      destPlanetMesh.rotation.y += simDt * 0.12;
      shieldBubble.visible = currentProps.shieldActive;
      if (currentProps.shieldActive) {
        shieldBubble.rotation.y += simDt * 1.4;
      }

      const phase = currentProps.phase;
      const isFlightPhase = phase === 'launch' || phase === 'transit' || phase === 'objective';

      // Visibility of terrain vs open space hazards
      terrainGroup.visible =
        currentProps.gameState === 'title' ||
        phase === 'assembly' ||
        phase === 'countdown' ||
        (phase === 'launch' && currentProps.progressPct < 18) ||
        (phase === 'objective' &&
          (currentProps.modeId === 'moon' || currentProps.modeId === 'mars'));

      launchPadGroup.visible =
        phase === 'assembly' ||
        phase === 'countdown' ||
        (phase === 'launch' && currentProps.progressPct < 18);

      heavyBoosterGroup.visible =
        phase === 'assembly' ||
        phase === 'countdown' ||
        (phase === 'launch' && currentProps.progressPct < 22);

      // Solar wing deployment interpolation
      const targetWingScale =
        phase === 'assembly' || phase === 'countdown' || phase === 'launch' ? 0.15 : 1.0;
      solarWingsGroup.scale.x = THREE.MathUtils.damp(
        solarWingsGroup.scale.x,
        targetWingScale,
        5,
        dt
      );

      // Player WASD / Arrow steering during active flight phases
      let moveX = 0;
      let moveY = 0;
      if (currentProps.gameState === 'playing' && isFlightPhase) {
        if (keysPressed.has('KeyA') || keysPressed.has('ArrowLeft')) moveX -= 1;
        if (keysPressed.has('KeyD') || keysPressed.has('ArrowRight')) moveX += 1;
        if (keysPressed.has('KeyW') || keysPressed.has('ArrowUp')) moveY += 1;
        if (keysPressed.has('KeyS') || keysPressed.has('ArrowDown')) moveY -= 1;
      }

      const isManualBurn = keysPressed.has('Space') || currentProps.activeBurn;
      currentProps.onSteerActivity(isManualBurn || moveX !== 0 || moveY !== 0);

      if (currentProps.gameState === 'playing' && isFlightPhase && simDt > 0) {
        craftVx = THREE.MathUtils.damp(craftVx, moveX * 9.5, 6, simDt);
        craftVy = THREE.MathUtils.damp(craftVy, moveY * 6.5, 6, simDt);
        craftX = THREE.MathUtils.clamp(craftX + craftVx * simDt, -9.5, 9.5);
        craftY = THREE.MathUtils.clamp(craftY + craftVy * simDt, -1.5, 6.5);

        const climbOffset =
          phase === 'launch' ? Math.min(12, currentProps.progressPct * 0.45) : 2.5;
        spacecraftRoot.position.set(craftX, craftY + climbOffset, 0);

        // Banking & pitch tilt during steering
        spacecraftRoot.rotation.z = THREE.MathUtils.damp(
          spacecraftRoot.rotation.z,
          -moveX * 0.38,
          7,
          simDt
        );
        spacecraftRoot.rotation.x = THREE.MathUtils.damp(
          spacecraftRoot.rotation.x,
          phase === 'launch' ? -0.15 : -0.95 + moveY * 0.25,
          5,
          simDt
        );
        spacecraftRoot.rotation.y = THREE.MathUtils.damp(
          spacecraftRoot.rotation.y,
          0,
          5,
          simDt
        );

        // Spawn thruster exhaust particles
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
        // Title screen or Assembly / Countdown idle pose
        craftX = THREE.MathUtils.damp(craftX, 0, 4, dt);
        craftY = THREE.MathUtils.damp(craftY, 0, 4, dt);
        const padY = phase === 'assembly' || phase === 'countdown' ? 2.6 : 1.2;
        spacecraftRoot.position.set(craftX, padY, 0);
        spacecraftRoot.rotation.x = THREE.MathUtils.damp(
          spacecraftRoot.rotation.x,
          currentProps.gameState === 'title' ? 0.18 : 0,
          4,
          dt
        );
        spacecraftRoot.rotation.z = THREE.MathUtils.damp(
          spacecraftRoot.rotation.z,
          currentProps.gameState === 'title' ? -0.12 : 0,
          4,
          dt
        );
        spacecraftRoot.rotation.y += dt * (currentProps.gameState === 'title' ? 0.45 : 0.22);

        if (phase === 'countdown') {
          // Pre-ignition steam/cryo vent particles at launchpad base
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

      // Update hazards & waypoints during active flight
      for (let i = 0; i < hazards.length; i++) {
        const h = hazards[i];
        h.group.visible = currentProps.gameState === 'playing' && isFlightPhase;
        if (!h.group.visible || simDt <= 0) continue;

        h.hitCooldown = Math.max(0, h.hitCooldown - simDt);

        // Distinct movement policies per archetype
        const speedBoost = isManualBurn ? 1.45 : 1.0;
        h.position.z += h.velocity.z * speedBoost * simDt;

        if (h.archetype === 'meteoroid_swarm') {
          // Policy 1: Ballistic seek drift toward player X lane
          const seekDx = THREE.MathUtils.clamp(
            spacecraftRoot.position.x - h.position.x,
            -1,
            1
          );
          h.position.x += seekDx * 2.2 * simDt;
          h.group.rotation.x += simDt * 2.1;
          h.group.rotation.y += simDt * 1.7;
        } else if (h.archetype === 'cme_plasma_ring') {
          // Policy 2: Pulsing harmonic wave oscillation
          h.position.y =
            h.baseY + Math.sin(elapsedTotal * 2.4 + h.phaseOffset) * 2.6 + 2.5;
          const pulseScale = 1 + Math.sin(elapsedTotal * 5 + h.phaseOffset) * 0.18;
          h.group.scale.set(pulseScale, pulseScale, pulseScale);
          h.group.rotation.z += simDt * 1.5;
        } else {
          // Policy 3: Lateral spiral flanker orbit
          h.position.x += Math.cos(elapsedTotal * 1.8 + h.phaseOffset) * 4.2 * simDt;
          h.position.y =
            h.baseY + Math.sin(elapsedTotal * 1.8 + h.phaseOffset) * 1.8 + 2.5;
          h.group.rotation.y -= simDt * 2.4;
        }

        h.group.position.copy(h.position);

        // Visible + Audible Windup Telegraph when approaching spacecraft Z plane (-16 < z < -3)
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

        // Collision check with spacecraft
        const dist3D = h.position.distanceTo(spacecraftRoot.position);
        if (dist3D < 2.35 && h.hitCooldown <= 0) {
          h.hitCooldown = 2.0;
          hitstopTimer = 0.055; // 55ms heavy hitstop
          hitFlashTimer = 0.18;
          cameraTrauma = Math.min(1.0, cameraTrauma + 0.65);
          soundEngine.playHeavyImpact();

          // Particle burst on impact
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

        // Recycle hazard behind camera
        if (h.position.z > 14) {
          h.position.z = -65 - (i * 9) % 25;
          h.position.x = ((Math.random() - 0.5) * 15);
          h.baseY = (Math.random() - 0.5) * 4.5;
          h.telegraphed = false;
        }
      }

      // Update collectible science/navigation waypoints
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

      // Update pooled particles in-place (Zero-GC)
      for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        if (particleLife[i] > 0) {
          particleLife[i] -= dt;
          const idx3 = i * 3;
          particlePositions[idx3] += particleVelocities[idx3] * dt;
          particlePositions[idx3 + 1] += particleVelocities[idx3 + 1] * dt;
          particlePositions[idx3 + 2] += particleVelocities[idx3 + 2] * dt;

          const ratio = Math.max(0.01, particleLife[i] / Math.max(0.01, particleMaxLife[i]));
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

      // 13. Smooth Camera Choreography with exponential damping + trauma shake
      if (currentProps.gameState === 'title') {
        // Live World Camera Tour with subtle cursor parallax on Title Screen
        _vec3CamTarget.set(
          -5.5 + pointerX * 1.8 + Math.sin(elapsedTotal * 0.35) * 2.2,
          3.8 + pointerY * 1.1 + Math.cos(elapsedTotal * 0.28) * 0.8,
          13.5
        );
        _vec3LookTarget.set(2.2, 1.4, -2.0);
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
        // Default Chase Camera
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

      const dampFactor = 1 - Math.exp(-5.5 * dt);
      camera.position.lerp(_vec3CamTarget, dampFactor);

      // Apply decaying trauma^2 shake
      if (cameraTrauma > 0) {
        const shake = cameraTrauma * cameraTrauma * 0.65;
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
      }

      // FOV kick during active burn
      const targetFov = isManualBurn && isFlightPhase ? 62 : 55;
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
