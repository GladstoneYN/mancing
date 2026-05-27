/**
 * World — 3D scene setup: terrain, water, dock, props, lighting, fog.
 * Cozy golden-hour atmosphere with gentle rolling hills and animated water.
 */
import * as THREE from 'three';
import { WORLD, CAMERA } from '@/utils/Constants.js';

// ─── Heightmap helpers ──────────────────────────────────────────────
const _SIZE = WORLD.TERRAIN_SIZE;
const _SEG = WORLD.TERRAIN_SEGMENTS;
const _HALF = _SIZE / 2;

/**
 * Simple multi-octave noise for terrain.
 * We use a combination of sine waves to avoid importing a noise library.
 */
function terrainNoise(x, z) {
  return (
    Math.sin(x * 0.3) * Math.cos(z * 0.3) * 0.8 +
    Math.sin(x * 0.7 + 1.3) * Math.cos(z * 0.5 + 0.7) * 0.4 +
    Math.sin(x * 1.1 + 2.7) * Math.cos(z * 1.3 + 1.1) * 0.15
  );
}

/**
 * Compute the desired height at world (x, z).
 *   - z > 0   → land (above water)
 *   - z < -4  → seabed (below water)
 *   - -4 ≤ z ≤ 0 → smooth shoreline transition
 */
function computeHeight(x, z) {
  // Base rolling hills
  let h = terrainNoise(x, z);

  // Ensure land is dry and above water level (-0.3)
  if (z >= 1) {
    h = Math.max(h, 0.25);
  } else if (z < -6) {
    // Fully underwater — push down
    h -= 1.8;
    // Gentle underwater variation
    h += Math.sin(x * 0.5) * Math.cos(z * 0.4) * 0.2;
  } else {
    // Smooth transition zone — lerp from land height to water depth
    // transition zone: z in [-6, 1]
    const t = (z + 6) / 7; // 0 at z=-6, 1 at z=1
    const waterDepth = -1.8 + Math.sin(x * 0.5) * Math.cos(z * 0.4) * 0.2;
    const landHeightAtOne = Math.max(terrainNoise(x, 1), 0.25);
    h = THREE.MathUtils.lerp(waterDepth, landHeightAtOne, t);
  }

  return h;
}

export class World {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    // ── Renderer ───────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // ── Scene ─────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87CEEB); // will be overridden by sky
    this.scene.fog = new THREE.FogExp2(0x1a2235, 0.02);

    // ── Camera ────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      CAMERA.NEAR,
      CAMERA.FAR
    );
    this.camera.position.set(0, CAMERA.HEIGHT, CAMERA.DISTANCE);

    // Initialize collections for night lights early so that trees can register their lanterns
    this.lanternLights = [];
    this.lanternGlowSprites = [];

    // ── Build world ───────────────────────────────────
    this._buildSky();
    this._buildLighting();
    this._buildTerrain();
    this._buildWater();
    this._buildDock();
    this._buildTrees();
    this._buildRocks();
    
    // Smoke particles for shop (cabin)
    this.smokeParticleGroup = new THREE.Group();
    this.scene.add(this.smokeParticleGroup);
    this.smokeParticles = [];
    this.smokeTimer = 0;

    this._buildShop();
    this._buildLanterns();
    this._buildMountains();
    this._buildClouds();
    this._buildFireflies();
    this._buildFallingLeaves();
    this._buildGrassAndFlowers();
    this._buildUnderwaterFish();
    this._buildCampfire();
    this._buildActiveSpotRipples();
    this._buildSteppingStones();
    this._buildBenches();
    this._buildBeachProps();
    this._buildCampfireLogSeats();

    // ── Resize handler ────────────────────────────────
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);

    // Animation clock
    this._clock = 0;

    // Weather and Day/Night cycle setup
    this.weather = 'sunny';
    this.timeOfDay = 6.0; // starts at 6:00 AM sunrise
    this._buildRain();

    this.scene.userData.world = this;
  }

  /* ═══════════════════════════════════════════════════════
     PUBLIC METHODS
     ═══════════════════════════════════════════════════════ */

  /**
   * Animate water and scene effects.
   * @param {number} dt — delta time in seconds
   */
  update(dt) {
    this._clock += dt;
    this._animateWater();
    this._animateClouds(dt);
    this._animateFireflies(dt);
    this._animateFallingLeaves(dt);
    this._animateUnderwaterFish(dt);
    this._animateCampfire(dt);
    this._animateActiveSpotRipples(dt);
    this._animateSmoke(dt);
    this._animateDayNight(dt);
    this._animateRain(dt);
  }

  /**
   * Render the scene.
   * @param {THREE.PerspectiveCamera} camera
   */
  render(camera) {
    this.renderer.render(this.scene, camera);
  }

  /**
   * Sample the terrain height from the heightmap directly (without overrides).
   */
  _sampleTerrainHeight(x, z) {
    // Bilinear interpolation from heightmap
    // Map world coords to heightmap indices
    const u = (x + _HALF) / _SIZE * _SEG;
    const v = (z + _HALF) / _SIZE * _SEG;

    const i0 = Math.floor(u);
    const j0 = Math.floor(v);
    const i1 = Math.min(i0 + 1, _SEG);
    const j1 = Math.min(j0 + 1, _SEG);

    const fu = u - i0;
    const fv = v - j0;

    // Sample heightmap with bounds checking
    const h00 = this._sampleHeight(i0, j0);
    const h10 = this._sampleHeight(i1, j0);
    const h01 = this._sampleHeight(i0, j1);
    const h11 = this._sampleHeight(i1, j1);

    // Bilinear interpolation
    const h0 = h00 * (1 - fu) + h10 * fu;
    const h1 = h01 * (1 - fu) + h11 * fu;

    return h0 * (1 - fv) + h1 * fv;
  }

  /**
   * Get interpolated terrain height at world position (x, z).
   * Returns dock surface height if on the dock.
   * @param {number} x
   * @param {number} z
   * @returns {number} Y height
   */
  getTerrainHeight(x, z) {
    // Dock surface override
    if (this.isOnDock(x, z)) {
      if (z > 0 && z <= 2.0) {
        const t = z / 2.0; // 0 at z=0, 1 at z=2
        const groundHeight = this._sampleTerrainHeight(x, z);
        return THREE.MathUtils.lerp(0.3, groundHeight, t);
      }
      return 0.3;
    }

    return this._sampleTerrainHeight(x, z);
  }

  /**
   * Is the position on the dock?
   * Dock runs along z=0 to z=-24, roughly x in [-2, 2], with ramp extending to z=2.0.
   */
  isOnDock(x, z) {
    return x > -2.2 && x < 2.2 && z > -24.5 && z < 2.05;
  }

  /**
   * Is this position in water (below water level and not on dock)?
   */
  isInWater(x, z) {
    if (this.isOnDock(x, z)) return false;
    const h = this.getTerrainHeight(x, z);
    return h < WORLD.WATER_LEVEL;
  }

  /**
   * Checks if a player collides with the shop (house) bounding box.
   * Shop is centered at (15, 10), width 5 (X), depth 4 (Z).
   */
  collidesWithShop(x, z, radius = 0.35) {
    const minX = 15 - 2.5 - radius;
    const maxX = 15 + 2.5 + radius;
    const minZ = 10 - 2.0 - radius;
    const maxZ = 10 + 2.0 + radius;
    return x >= minX && x <= maxX && z >= minZ && z <= maxZ;
  }

  /**
   * Checks if a player collides with any of the solid tree trunks.
   */
  collidesWithTrees(x, z, radius = 0.35) {
    if (!this.treePositions) return false;
    // Average tree trunk base radius is about 0.22 units in world space
    const collisionDist = 0.22 + radius;
    const collisionDistSq = collisionDist * collisionDist;
    for (const [tx, tz] of this.treePositions) {
      const dx = x - tx;
      const dz = z - tz;
      const distSq = dx * dx + dz * dz;
      if (distSq < collisionDistSq) {
        return true;
      }
    }
    return false;
  }

  /**
   * Set the time of day synced from server.
   */
  setTimeOfDay(time) {
    this.timeOfDay = time;
  }

  /* ═══════════════════════════════════════════════════════
     PRIVATE — BUILD METHODS
     ═══════════════════════════════════════════════════════ */

  _buildSky() {
    // Gradient sky sphere — warm golden-hour tones
    const skyGeo = new THREE.SphereGeometry(CAMERA.FAR * 0.45, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTopColor: { value: new THREE.Color(0x1a2235) },     // deep twilight blue
        uMiddleColor: { value: new THREE.Color(0xf0a050) },  // warm golden
        uBottomColor: { value: new THREE.Color(0xffe4c4) },  // soft peach horizon
        uOffset: { value: 0.3 },
        uExponent: { value: 0.6 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPos.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTopColor;
        uniform vec3 uMiddleColor;
        uniform vec3 uBottomColor;
        uniform float uOffset;
        uniform float uExponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          // Bottom to middle (horizon glow)
          float t1 = max(pow(max(h + uOffset, 0.0), uExponent), 0.0);
          vec3 color = mix(uBottomColor, uMiddleColor, min(t1, 1.0));
          // Middle to top (sky)
          float t2 = max(pow(max(h - 0.05, 0.0), 0.5), 0.0);
          color = mix(color, uTopColor, min(t2, 1.0));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    this.skyMat = skyMat;
    const sky = new THREE.Mesh(skyGeo, this.skyMat);
    this.scene.add(sky);
  }

  _buildLighting() {
    // Warm ambient fill
    this.ambient = new THREE.AmbientLight(0xffecd2, 0.4);
    this.scene.add(this.ambient);

    // Hemisphere light for subtle sky/ground color bleed
    this.hemi = new THREE.HemisphereLight(0xffd89b, 0x4a7c59, 0.25);
    this.scene.add(this.hemi);

    // Directional "sun" — golden hour from upper-right
    this.sun = new THREE.DirectionalLight(0xffd89b, 0.8);
    this.sun.position.set(15, 20, 10);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -30;
    this.sun.shadow.camera.right = 30;
    this.sun.shadow.camera.top = 30;
    this.sun.shadow.camera.bottom = -30;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 60;
    this.sun.shadow.bias = -0.001;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  _buildTerrain() {
    const geo = new THREE.PlaneGeometry(_SIZE, _SIZE, _SEG, _SEG);
    geo.rotateX(-Math.PI / 2); // lay flat

    // Store heightmap as 2D array for runtime queries
    this._heightmap = [];
    for (let j = 0; j <= _SEG; j++) {
      this._heightmap[j] = [];
    }

    const pos = geo.attributes.position;
    const colors = [];
    const colorSand = new THREE.Color(0xdfc190);
    const colorGrass = new THREE.Color(0x4a7c59);
    const colorSeabed = new THREE.Color(0x2d5238); // dark sand/green underwater

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = computeHeight(x, z);
      pos.setY(i, h);

      // Store into heightmap grid
      // Vertex order: j * (_SEG + 1) + i_col
      const col = i % (_SEG + 1);
      const row = Math.floor(i / (_SEG + 1));
      this._heightmap[row][col] = h;

      // Dynamic vertex coloring based on Z coordinate (beach position)
      let vertexColor = new THREE.Color();
      if (z >= 0.5) {
        vertexColor.copy(colorGrass);
      } else if (z < -6.0) {
        vertexColor.copy(colorSeabed);
      } else {
        // z in [-6.0, 0.5]
        if (z < -5.0) {
          // Transition from seabed to sand
          const t = (z + 6.0) / 1.0; // 0 at -6, 1 at -5
          vertexColor.lerpColors(colorSeabed, colorSand, t);
        } else if (z < -1.5) {
          // Pure sand beach
          vertexColor.copy(colorSand);
        } else {
          // Transition from sand to grass
          const t = (z + 1.5) / 2.0; // 0 at -1.5, 1 at 0.5
          vertexColor.lerpColors(colorSand, colorGrass, t);
        }
      }
      colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.0,
      flatShading: false,
    });

    const terrain = new THREE.Mesh(geo, mat);
    terrain.receiveShadow = true;
    this.scene.add(terrain);
  }

  _buildWater() {
    // Water plane covering the lower half of the world
    const waterSize = 350; // Vast water plane
    const waterGeo = new THREE.PlaneGeometry(waterSize, waterSize, 80, 80);
    waterGeo.rotateX(-Math.PI / 2);

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1f5c7a, // Deep, relaxing teal
      transparent: true,
      opacity: 0.72,
      roughness: 0.05, // highly reflective
      metalness: 0.45, // metallic shine
      side: THREE.DoubleSide,
    });

    this.water = new THREE.Mesh(waterGeo, waterMat);
    this.water.position.y = WORLD.WATER_LEVEL;
    this.water.receiveShadow = true;
    this.scene.add(this.water);

    // Store original positions for animation
    const pos = this.water.geometry.attributes.position;
    this._waterBaseY = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      this._waterBaseY[i] = pos.getY(i);
    }
  }

  _buildDock() {
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x8B6914,
      roughness: 0.75,
      metalness: 0.05,
    });

    const darkWoodMat = new THREE.MeshStandardMaterial({
      color: 0x6B4F10,
      roughness: 0.8,
      metalness: 0.05,
    });

    const dockGroup = new THREE.Group();

    // Main deck — runs from z=0 to z=-24
    const dockLength = 24;
    const dockWidth = 4;
    const plankCount = 16;
    const plankLength = dockLength / plankCount;

    for (let i = 0; i < plankCount; i++) {
      const plankGeo = new THREE.BoxGeometry(dockWidth - 0.1, 0.15, plankLength - 0.08);
      const plank = new THREE.Mesh(plankGeo, woodMat);
      plank.position.set(0, 0.3, -i * plankLength - plankLength / 2);
      plank.castShadow = true;
      plank.receiveShadow = true;
      dockGroup.add(plank);
    }

    // Ramp planks — from z=0 to z=2.0 sloping to the ground
    const rampLength = 2.0;
    const rampPlankCount = 4;
    const rampPlankLength = rampLength / rampPlankCount;
    const startY = 0.3;
    const endY = computeHeight(0, 2.0);

    for (let i = 0; i < rampPlankCount; i++) {
      const t = (i * rampPlankLength + rampPlankLength / 2) / rampLength; // fraction along ramp
      const plankY = THREE.MathUtils.lerp(startY, endY, t);
      const plankZ = i * rampPlankLength + rampPlankLength / 2;

      const plankGeo = new THREE.BoxGeometry(dockWidth - 0.1, 0.15, rampPlankLength - 0.08);
      const plank = new THREE.Mesh(plankGeo, woodMat);
      plank.position.set(0, plankY, plankZ);
      plank.rotation.x = Math.atan2(endY - startY, rampLength);
      plank.castShadow = true;
      plank.receiveShadow = true;
      dockGroup.add(plank);
    }

    // Side rails removed for open dock design

    // Support posts underneath
    const postGeo = new THREE.CylinderGeometry(0.12, 0.14, 2.5, 6);
    const postPositions = [
      [-1.5, -3], [1.5, -3],
      [-1.5, -9], [1.5, -9],
      [-1.5, -15], [1.5, -15],
      [-1.5, -21], [1.5, -21],
    ];
    for (const [px, pz] of postPositions) {
      const post = new THREE.Mesh(postGeo, darkWoodMat);
      post.position.set(px, -0.9, pz);
      post.castShadow = true;
      dockGroup.add(post);
    }

    this.scene.add(dockGroup);
  }

  _buildTrees() {
    const treePositions = [
      [-12, 6], [-8, 14], [-18, 10], [-6, 8],
      [10, 12], [11, 5], [20, 14], [8, 18],
      [-20, 18], [22, 8], [-14, 20], [5, 10],
    ];
    this.treePositions = treePositions;

    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.85,
    });

    const birchTrunkMat = new THREE.MeshStandardMaterial({
      color: 0xebebdf,
      roughness: 0.75,
    });

    const birchBandMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.9,
    });

    const lanternPoleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    this.treeLanternGlowMat = new THREE.MeshStandardMaterial({
      color: 0xffd060,
      emissive: 0xffaa00,
      emissiveIntensity: 1.5,
    });

    let treeIndex = 0;

    for (const [tx, tz] of treePositions) {
      const h = computeHeight(tx, tz);
      if (h < WORLD.WATER_LEVEL) continue; // skip if underwater

      const tree = new THREE.Group();
      const scale = 0.8 + Math.random() * 0.5;

      // Determine tree type based on index to distribute evenly
      const treeType = treeIndex % 3; // 0: Deciduous, 1: Cozy Pine, 2: Birch
      treeIndex++;

      if (treeType === 0) {
        // --- TYPE 0: STYLIZED DECIDUOUS (AUTUMN GLOW) ---
        const lowerTrunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16 * scale, 0.22 * scale, 1.2 * scale, 6),
          trunkMat
        );
        lowerTrunk.position.y = 0.6 * scale;
        lowerTrunk.castShadow = true;
        tree.add(lowerTrunk);

        const upperTrunk = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12 * scale, 0.16 * scale, 1.2 * scale, 6),
          trunkMat
        );
        upperTrunk.position.set(0.08 * scale, 1.5 * scale, 0);
        upperTrunk.rotation.z = -0.15;
        upperTrunk.castShadow = true;
        tree.add(upperTrunk);

        const autumnColors = [0xdf6a4f, 0xf29c50, 0xe9c05c, 0xcb5a40];
        const folMat = new THREE.MeshStandardMaterial({
          color: autumnColors[Math.floor(Math.random() * autumnColors.length)],
          roughness: 0.9,
        });

        const foliageOffsets = [
          { x: 0, y: 2.1, z: 0, r: 0.95 },
          { x: -0.4, y: 2.5, z: 0.2, r: 0.75 },
          { x: 0.4, y: 2.4, z: -0.3, r: 0.7 },
          { x: 0.1, y: 2.9, z: 0.1, r: 0.65 },
        ];

        for (const offset of foliageOffsets) {
          const sphereGeo = new THREE.DodecahedronGeometry(offset.r * scale, 1);
          const sphere = new THREE.Mesh(sphereGeo, folMat);
          sphere.position.set(
            (offset.x + 0.08) * scale,
            offset.y * scale,
            offset.z * scale
          );
          sphere.castShadow = true;
          tree.add(sphere);
        }
      } else if (treeType === 1) {
        // --- TYPE 1: DETAILED COZY PINE ---
        const trunkGeo = new THREE.CylinderGeometry(0.14 * scale, 0.22 * scale, 2.4 * scale, 6);
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1.2 * scale;
        trunk.castShadow = true;
        tree.add(trunk);

        let currentY = 1.4 * scale;
        const pineGreens = [0x22442b, 0x2d5c3b, 0x3d7a4f, 0x519e68];
        for (let layer = 0; layer < 4; layer++) {
          const layerScale = (4 - layer) / 4;
          const coneHeight = 1.2 * scale * layerScale;
          const layerGeo = new THREE.ConeGeometry(
            1.3 * scale * layerScale,
            coneHeight,
            6
          );
          const layerMat = new THREE.MeshStandardMaterial({
            color: pineGreens[layer],
            roughness: 0.85,
            flatShading: true,
          });
          const foliageMesh = new THREE.Mesh(layerGeo, layerMat);
          foliageMesh.position.y = currentY + coneHeight / 2;
          foliageMesh.rotation.y = Math.random() * Math.PI;
          foliageMesh.castShadow = true;
          tree.add(foliageMesh);

          currentY += coneHeight * 0.55;
        }

        // Add a branch and a lantern to some pine trees
        if (Math.random() < 0.45) {
          const branchGroup = new THREE.Group();
          branchGroup.position.set(0.2 * scale, 1.1 * scale, 0);

          const woodBranch = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04 * scale, 0.06 * scale, 0.6 * scale, 5),
            trunkMat
          );
          woodBranch.rotation.z = Math.PI / 2.3;
          woodBranch.position.set(0.2 * scale, 0, 0);
          branchGroup.add(woodBranch);

          const lantern = new THREE.Group();
          lantern.position.set(0.45 * scale, -0.2 * scale, 0);

          const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 0.03 * scale, 5), lanternPoleMat);
          cap.position.y = 0.1 * scale;
          lantern.add(cap);

          const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 0.12 * scale, 5), this.treeLanternGlowMat);
          lantern.add(glass);

          const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.01 * scale, 0.01 * scale, 0.12 * scale, 4), lanternPoleMat);
          wire.position.y = 0.18 * scale;
          lantern.add(wire);

          const light = new THREE.PointLight(0xffaa00, 0.55, 5);
          light.position.set(0, 0, 0);
          lantern.add(light);
          if (this.lanternLights) {
            this.lanternLights.push(light);
          }

          branchGroup.add(lantern);
          tree.add(branchGroup);
        }
      } else {
        // --- TYPE 2: COZY BIRCH ---
        const trunkGeo = new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, 2.6 * scale, 6);
        const trunk = new THREE.Mesh(trunkGeo, birchTrunkMat);
        trunk.position.y = 1.3 * scale;
        trunk.castShadow = true;
        tree.add(trunk);

        for (let b = 0; b < 6; b++) {
          const bandGeo = new THREE.CylinderGeometry(0.13 * scale, 0.18 * scale, 0.05 * scale, 6);
          const band = new THREE.Mesh(bandGeo, birchBandMat);
          band.position.y = (0.4 + b * 0.4 + Math.random() * 0.1) * scale;
          band.scale.set(1.03, 1, 1.03);
          tree.add(band);
        }

        const birchColors = [0x5aa86b, 0x6bb87d, 0x8ccf9a];
        const folMat = new THREE.MeshStandardMaterial({
          color: birchColors[Math.floor(Math.random() * birchColors.length)],
          roughness: 0.8,
        });

        const spheres = [
          { x: 0, y: 2.4, z: 0, r: 0.8 },
          { x: -0.3, y: 2.2, z: -0.2, r: 0.65 },
          { x: 0.25, y: 2.7, z: 0.15, r: 0.6 },
        ];
        for (const s of spheres) {
          const sphereGeo = new THREE.DodecahedronGeometry(s.r * scale, 1);
          const mesh = new THREE.Mesh(sphereGeo, folMat);
          mesh.position.set(s.x * scale, s.y * scale, s.z * scale);
          mesh.castShadow = true;
          tree.add(mesh);
        }
      }

      tree.position.set(tx, h, tz);
      tree.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(tree);
    }
  }

  _buildRocks() {
    const rockPositions = [
      [-5, 2], [8, 3], [-15, 5], [18, 4], [-10, -2],
      [12, 1], [-22, 8],
    ];

    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x8a8a7a,
      roughness: 0.9,
      metalness: 0.05,
    });

    for (const [rx, rz] of rockPositions) {
      const h = computeHeight(rx, rz);
      if (h < WORLD.WATER_LEVEL - 0.5) continue;

      const scale = 0.3 + Math.random() * 0.6;
      const rockGeo = new THREE.SphereGeometry(scale, 6, 5);

      // Deform vertices for irregular look
      const pos = rockGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const offset = 0.85 + Math.random() * 0.3;
        pos.setX(i, pos.getX(i) * offset);
        pos.setY(i, pos.getY(i) * (0.6 + Math.random() * 0.4));
        pos.setZ(i, pos.getZ(i) * offset);
      }
      rockGeo.computeVertexNormals();

      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(rx, h + scale * 0.3, rz);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.scene.add(rock);
    }
  }

  _buildShop() {
    const shopGroup = new THREE.Group();

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.95 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B6914, roughness: 0.75 });
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.7 });
    const shingleMat = new THREE.MeshStandardMaterial({ color: 0x8B3A3A, roughness: 0.65 });

    // Stone Foundation (extended deeper into the terrain to prevent floating)
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.2, 4.2), stoneMat);
    foundation.position.y = -0.7;
    foundation.castShadow = true;
    foundation.receiveShadow = true;
    shopGroup.add(foundation);

    // Walls
    const wallGeo = new THREE.BoxGeometry(5.0, 3.2, 4.0);
    const walls = new THREE.Mesh(wallGeo, wallMat);
    walls.position.y = 2.0;
    walls.castShadow = true;
    walls.receiveShadow = true;
    shopGroup.add(walls);

    // Pyramidal Roof (closes all gaps cleanly)
    const roofGeo = new THREE.ConeGeometry(3.6, 2.2, 4);
    roofGeo.rotateY(Math.PI / 4); // align flat sides to walls
    const roof = new THREE.Mesh(roofGeo, shingleMat);
    roof.scale.set(1.5, 1.0, 1.2); // stretch to fit 5.4 x 4.32 rectangular walls
    roof.position.y = 4.7;
    roof.castShadow = true;
    shopGroup.add(roof);

    // Stone Chimney (raised to be visible above the roof line)
    const chimney = new THREE.Group();
    chimney.position.set(-1.8, 4.4, -1.0);
    const chimneyBlock = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), stoneMat);
    chimneyBlock.castShadow = true;
    chimney.add(chimneyBlock);
    const chimneyTop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.7), stoneMat);
    chimneyTop.position.y = 0.9;
    chimney.add(chimneyTop);
    shopGroup.add(chimney);

    // Door
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x6B4226 });
    const doorGeo = new THREE.BoxGeometry(1.0, 2.0, 0.1);
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 1.4, 2.05);
    shopGroup.add(door);

    // Cozy Porch Deck
    const porch = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.15, 1.2), woodMat);
    porch.position.set(0, 0.28, 2.6);
    porch.castShadow = true;
    porch.receiveShadow = true;
    shopGroup.add(porch);

    // Porch support posts under the deck (extending down into the terrain to prevent floating)
    const porchUnderPostGeo = new THREE.BoxGeometry(0.2, 2.2, 0.2);
    const porchUnderPostL = new THREE.Mesh(porchUnderPostGeo, woodMat);
    porchUnderPostL.position.set(-1.8, -0.82, 2.6);
    porchUnderPostL.castShadow = true;
    porchUnderPostL.receiveShadow = true;
    shopGroup.add(porchUnderPostL);

    const porchUnderPostR = new THREE.Mesh(porchUnderPostGeo, woodMat);
    porchUnderPostR.position.set(1.8, -0.82, 2.6);
    porchUnderPostR.castShadow = true;
    porchUnderPostR.receiveShadow = true;
    shopGroup.add(porchUnderPostR);

    // Porch Support Posts
    const porchPostGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.2, 5);
    const porchPostL = new THREE.Mesh(porchPostGeo, woodMat);
    porchPostL.position.set(-1.8, 1.3, 3.1);
    porchPostL.castShadow = true;
    shopGroup.add(porchPostL);

    const porchPostR = new THREE.Mesh(porchPostGeo, woodMat);
    porchPostR.position.set(1.8, 1.3, 3.1);
    porchPostR.castShadow = true;
    shopGroup.add(porchPostR);

    // Porch Eaves (roof extension)
    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.1, 1.3), shingleMat);
    porchRoof.position.set(0, 2.45, 2.65);
    porchRoof.rotation.x = 0.12;
    porchRoof.castShadow = true;
    shopGroup.add(porchRoof);

    // Prop: Wooden Barrel next to door
    const barrelGroup = new THREE.Group();
    barrelGroup.position.set(1.4, 0.65, 2.6);
    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 });
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.7, 8), barrelMat);
    barrel.castShadow = true;
    barrelGroup.add(barrel);
    
    const metalBandMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6 });
    const bBand1 = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.27, 0.03, 8), metalBandMat);
    bBand1.position.y = 0.18;
    barrelGroup.add(bBand1);
    const bBand2 = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.26, 0.03, 8), metalBandMat);
    bBand2.position.y = -0.18;
    barrelGroup.add(bBand2);
    shopGroup.add(barrelGroup);

    // Windows with warm indoor glow
    const windowFrameMat = new THREE.MeshStandardMaterial({ color: 0x422d1b, roughness: 0.8 });
    this.windowGlassMat = new THREE.MeshStandardMaterial({
      color: 0xffdd88,
      emissive: 0xffaa44,
      emissiveIntensity: 0.8,
      roughness: 0.1,
    });

    // Front Window
    const frontWindowGroup = new THREE.Group();
    frontWindowGroup.position.set(-1.4, 2.0, 2.02);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.1), windowFrameMat);
    frontWindowGroup.add(frame);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.11), this.windowGlassMat);
    frontWindowGroup.add(glass);
    shopGroup.add(frontWindowGroup);

    // Side Window
    const sideWindowGroup = new THREE.Group();
    sideWindowGroup.position.set(2.52, 2.0, 0);
    sideWindowGroup.rotation.y = Math.PI / 2;
    const sideFrame = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.1), windowFrameMat);
    sideWindowGroup.add(sideFrame);
    const sideGlass = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.11), this.windowGlassMat);
    sideWindowGroup.add(sideGlass);
    shopGroup.add(sideWindowGroup);

    // Sign above door with "FISH SHOP" text
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5e6c8';
    ctx.fillRect(0, 0, 256, 64);
    ctx.font = 'bold 28px Outfit, sans-serif';
    ctx.fillStyle = '#4a3c2c';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐟 FISH SHOP 🐟', 128, 32);

    const signTexture = new THREE.CanvasTexture(canvas);
    const signMat = new THREE.MeshStandardMaterial({ map: signTexture, roughness: 0.8 });
    const signGeo = new THREE.BoxGeometry(2.5, 0.6, 0.08);
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 3.1, 2.05);
    shopGroup.add(sign);

    // Warm shop light
    this.shopLight = new THREE.PointLight(0xffcc80, 0.8, 8);
    this.shopLight.position.set(0, 2.5, 2.5);
    shopGroup.add(this.shopLight);

    // Place shop on land & Rotate to face the beach (Z < 0)
    const sx = 15, sz = 10;
    const sh = computeHeight(sx, sz);
    shopGroup.position.set(sx, sh, sz);
    shopGroup.rotation.y = Math.PI;
    this.scene.add(shopGroup);
  }

  _buildLanterns() {
    // Lanterns along the dock — warm orange glow
    const lanternPositions = [
      [-1.8, 0.38, -5],
      [1.8, 0.38, -5],
      [-1.8, 0.38, -14],
      [1.8, 0.38, -14],
    ];

    const groundLanternPositions = [
      [1.0, 7.0],
      [5.0, 8.5],
      [9.0, 9.5],
      [-5.0, 2.0],
      [13.5, 13.5]
    ];
    for (const [gx, gz] of groundLanternPositions) {
      const gh = this.getTerrainHeight(gx, gz);
      lanternPositions.push([gx, gh, gz]);
    }

    const poleMat = new THREE.MeshStandardMaterial({ color: 0x4a3b2c });
    this.lampMat = new THREE.MeshStandardMaterial({
      color: 0xffdd66,
      emissive: 0xffaa44,
      emissiveIntensity: 1.2,
    });

    for (const [lx, ly, lz] of lanternPositions) {
      const lanternGroup = new THREE.Group();

      // Pole
      const poleGeo = new THREE.CylinderGeometry(0.04, 0.05, 1.4, 6);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 0.7;
      lanternGroup.add(pole);

      // Lamp housing
      const lampGeo = new THREE.BoxGeometry(0.25, 0.3, 0.25);
      const lamp = new THREE.Mesh(lampGeo, this.lampMat);
      lamp.position.y = 1.55;
      lanternGroup.add(lamp);

      // Point light
      const light = new THREE.PointLight(0xffaa44, 0.75, 8);
      light.position.y = 1.6;
      light.castShadow = true;
      lanternGroup.add(light);
      this.lanternLights.push(light);

      // Glowing lens flare texture sprite
      const glowCanvas = document.createElement('canvas');
      glowCanvas.width = 64;
      glowCanvas.height = 64;
      const ctx = glowCanvas.getContext('2d');
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255, 220, 100, 1.0)');
      grad.addColorStop(0.3, 'rgba(255, 170, 50, 0.45)');
      grad.addColorStop(1.0, 'rgba(255, 170, 50, 0.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);

      const glowTex = new THREE.CanvasTexture(glowCanvas);
      const glowMat = new THREE.SpriteMaterial({
        map: glowTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
      });
      const glowSprite = new THREE.Sprite(glowMat);
      glowSprite.position.y = 1.55;
      glowSprite.scale.setScalar(0.9);
      lanternGroup.add(glowSprite);
      this.lanternGlowSprites.push(glowSprite);

      lanternGroup.position.set(lx, ly, lz);
      this.scene.add(lanternGroup);
    }
  }

  /* ═══════════════════════════════════════════════════════
     PRIVATE — ANIMATION
     ═══════════════════════════════════════════════════════ */

  _animateWater() {
    if (!this.water) return;

    const pos = this.water.geometry.attributes.position;
    const t = this._clock;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      // Gentle sine wave displacement
      const wave =
        Math.sin(x * 0.4 + t * 0.8) * 0.06 +
        Math.sin(z * 0.3 + t * 0.6 + 1.0) * 0.04 +
        Math.sin((x + z) * 0.5 + t * 1.2) * 0.03;

      pos.setY(i, this._waterBaseY[i] + wave);
    }

    pos.needsUpdate = true;
    this.water.geometry.computeVertexNormals();
  }

  /* ═══════════════════════════════════════════════════════
     PRIVATE — HEIGHTMAP QUERY
     ═══════════════════════════════════════════════════════ */

  _sampleHeight(col, row) {
    if (
      row < 0 || row > _SEG ||
      col < 0 || col > _SEG
    ) {
      return 0;
    }
    return this._heightmap[row]?.[col] ?? 0;
  }

  /* ═══════════════════════════════════════════════════════
     RESIZE
     ═══════════════════════════════════════════════════════ */

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /* ═══════════════════════════════════════════════════════
     PRIVATE — ADDED SCENERY METHODS
     ═══════════════════════════════════════════════════════ */

  _buildMountains() {
    const mountainMat = new THREE.MeshStandardMaterial({
      color: 0x222e40, // deep twilight blue-purple hills
      roughness: 0.9,
      metalness: 0.02,
      flatShading: true,
    });
    
    const count = 12;
    const radius = 135;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.25;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      const w = 40 + Math.random() * 30; // base width
      const h = 25 + Math.random() * 30; // height
      
      const geo = new THREE.ConeGeometry(w, h, 5); // 5-sided pyramid
      geo.rotateY(Math.random() * Math.PI);
      const mesh = new THREE.Mesh(geo, mountainMat);
      mesh.position.set(x, h/2 - 6, z); // slightly embedded
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }

  _buildClouds() {
    this.clouds = [];
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffecc2, // warm peachy sunset white
      roughness: 0.85,
      flatShading: true,
    });

    const count = 10;
    for (let i = 0; i < count; i++) {
      const cluster = new THREE.Group();
      const px = -120 + Math.random() * 240;
      const pz = -120 + Math.random() * 240;
      const py = 15 + Math.random() * 8; // high up

      const partsCount = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < partsCount; j++) {
        const bx = 3.0 + Math.random() * 4.0;
        const by = 1.5 + Math.random() * 2.0;
        const bz = 2.0 + Math.random() * 3.0;

        const part = new THREE.Mesh(new THREE.BoxGeometry(bx, by, bz), cloudMat);
        part.position.set(
          (j - partsCount/2) * 1.8 + (Math.random() - 0.5) * 0.7,
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.7
        );
        cluster.add(part);
      }
      cluster.position.set(px, py, pz);
      cluster.userData = { speed: 0.8 + Math.random() * 1.5 };
      this.scene.add(cluster);
      this.clouds.push(cluster);
    }
  }

  _animateClouds(dt) {
    if (!this.clouds) return;
    for (const cloud of this.clouds) {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 180) {
        cloud.position.x = -180;
        cloud.position.z = -120 + Math.random() * 240;
      }
    }
  }

  _buildFireflies() {
    const particleCount = 45;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    this.fireflyData = [];

    const anchors = [
      { x: -1.8, y: 1.9, z: -5 },
      { x: 1.8, y: 1.9, z: -5 },
      { x: -1.8, y: 1.9, z: -14 },
      { x: 1.8, y: 1.9, z: -14 },
      { x: 15, y: 2.5, z: 12.0 }, // shop porch
      { x: 11.5, y: 0.8, z: 12.0 } // campfire
    ];

    for (let i = 0; i < particleCount; i++) {
      const anchor = anchors[i % anchors.length];
      const rx = anchor.x + (Math.random() - 0.5) * 3;
      const ry = anchor.y + (Math.random() - 0.5) * 1.5;
      const rz = anchor.z + (Math.random() - 0.5) * 3;

      positions[i * 3] = rx;
      positions[i * 3 + 1] = ry;
      positions[i * 3 + 2] = rz;

      this.fireflyData.push({
        anchor,
        x: rx,
        y: ry,
        z: rz,
        phaseX: Math.random() * Math.PI * 2,
        phaseY: Math.random() * Math.PI * 2,
        phaseZ: Math.random() * Math.PI * 2,
        speedX: 0.6 + Math.random() * 1.2,
        speedY: 1.2 + Math.random() * 1.8,
        speedZ: 0.6 + Math.random() * 1.2,
      });
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffea55, // soft warm gold glow
      size: 0.2,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });

    this.fireflies = new THREE.Points(geo, mat);
    this.scene.add(this.fireflies);
  }

  _animateFireflies(dt) {
    if (!this.fireflies) return;
    const posAttr = this.fireflies.geometry.attributes.position;
    for (let i = 0; i < this.fireflyData.length; i++) {
      const d = this.fireflyData[i];
      d.phaseX += dt * d.speedX;
      d.phaseY += dt * d.speedY;
      d.phaseZ += dt * d.speedZ;

      const x = d.anchor.x + Math.sin(d.phaseX) * 2.0;
      const y = Math.max(0.2, d.anchor.y + Math.cos(d.phaseY) * 0.85);
      const z = d.anchor.z + Math.sin(d.phaseZ) * 2.0;

      posAttr.setXYZ(i, x, y, z);
    }
    posAttr.needsUpdate = true;
  }

  _buildFallingLeaves() {
    const particleCount = 25;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    this.leafData = [];

    const treePositions = [
      [-12, 6], [-8, 14], [-18, 10], [-6, 8],
      [10, 12], [15, 6], [20, 14], [8, 18],
      [-20, 18], [22, 8], [-14, 20], [5, 10]
    ];

    for (let i = 0; i < particleCount; i++) {
      const tree = treePositions[i % treePositions.length];
      const tx = tree[0] + (Math.random() - 0.5) * 4;
      const tz = tree[1] + (Math.random() - 0.5) * 4;
      const ty = 4.0 + Math.random() * 4.0;

      positions[i * 3] = tx;
      positions[i * 3 + 1] = ty;
      positions[i * 3 + 2] = tz;

      this.leafData.push({
        spawnX: tree[0],
        spawnZ: tree[1],
        x: tx,
        y: ty,
        z: tz,
        fallSpeed: 0.9 + Math.random() * 0.9,
        driftSpeed: 0.35 + Math.random() * 0.35,
        phase: Math.random() * Math.PI * 2,
      });
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0x76b285, // lovely soft green
      size: 0.15,
      transparent: true,
      opacity: 0.9,
    });

    this.fallingLeaves = new THREE.Points(geo, mat);
    this.scene.add(this.fallingLeaves);
  }

  _animateFallingLeaves(dt) {
    if (!this.fallingLeaves) return;
    const posAttr = this.fallingLeaves.geometry.attributes.position;
    for (let i = 0; i < this.leafData.length; i++) {
      const d = this.leafData[i];
      d.y -= d.fallSpeed * dt;
      d.phase += dt * 2.2;
      d.x += Math.sin(d.phase) * d.driftSpeed * dt;

      const landH = this.getTerrainHeight(d.x, d.z);
      if (d.y < landH || d.y < WORLD.WATER_LEVEL) {
        d.y = 4.0 + Math.random() * 4.0;
        d.x = d.spawnX + (Math.random() - 0.5) * 4;
        d.z = d.spawnZ + (Math.random() - 0.5) * 4;
      }

      posAttr.setXYZ(i, d.x, d.y, d.z);
    }
    posAttr.needsUpdate = true;
  }

  _buildGrassAndFlowers() {
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x468256,
      roughness: 0.95,
      metalness: 0.0,
    });
    
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x3d704b,
      roughness: 0.9,
    });

    const flowerColors = [0xf48fb1, 0xffeb3b, 0x81d4fa, 0xe040fb]; // pink, yellow, blue, purple

    const landCoords = [
      [-4, 4], [-8, 6], [-10, 8], [-14, 5],
      [10, 4], [12, 6], [16, 7], [18, 9],
      [5, 8], [8, 10], [13, 9], [17, 12]
    ];

    for (const [lx, lz] of landCoords) {
      const count = 4 + Math.floor(Math.random() * 6);
      for (let i = 0; i < count; i++) {
        const px = lx + (Math.random() - 0.5) * 3.5;
        const pz = lz + (Math.random() - 0.5) * 3.5;
        const py = this.getTerrainHeight(px, pz);
        if (this.isInWater(px, pz)) continue; // skip if water/dock

        const isFlower = Math.random() < 0.35;
        if (isFlower) {
          const flowerGroup = new THREE.Group();
          
          // Stem
          const stemGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.3, 4);
          const stem = new THREE.Mesh(stemGeo, stemMat);
          stem.position.y = 0.15;
          flowerGroup.add(stem);

          // Petals
          const petalColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];
          const petalMat = new THREE.MeshStandardMaterial({ color: petalColor, roughness: 0.85 });
          const petalGeo = new THREE.SphereGeometry(0.05, 5, 4);
          const petals = new THREE.Mesh(petalGeo, petalMat);
          petals.scale.set(1.5, 0.4, 1.5);
          petals.position.y = 0.3;
          flowerGroup.add(petals);

          flowerGroup.position.set(px, py, pz);
          flowerGroup.scale.setScalar(0.7 + Math.random() * 0.5);
          this.scene.add(flowerGroup);
        } else {
          // Grass tuft (simple 3-blade box structures)
          const tuft = new THREE.Group();
          const bladeCount = 2 + Math.floor(Math.random() * 4);
          for (let b = 0; b < bladeCount; b++) {
            const h = 0.18 + Math.random() * 0.18;
            const bladeGeo = new THREE.BoxGeometry(0.03, h, 0.03);
            bladeGeo.translate(0, h/2, 0);
            const blade = new THREE.Mesh(bladeGeo, grassMat);
            blade.rotation.set(
              (Math.random() - 0.5) * 0.35,
              Math.random() * Math.PI,
              (Math.random() - 0.5) * 0.35
            );
            tuft.add(blade);
          }
          tuft.position.set(px, py, pz);
          this.scene.add(tuft);
        }
      }
    }
  }

  _buildCampfire() {
    const fireGroup = new THREE.Group();
    
    // Rocks around campfire
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a5a5a, roughness: 0.95 });
    const rockGeo = new THREE.SphereGeometry(0.12, 6, 5);
    for (let i = 0; i < 7; i++) {
      const angle = (i / 7) * Math.PI * 2;
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(Math.cos(angle) * 0.55, 0.04, Math.sin(angle) * 0.55);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      fireGroup.add(rock);
    }

    // Logs inside
    const logMat = new THREE.MeshStandardMaterial({ color: 0x3d2516, roughness: 0.9 });
    const logGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.55, 5);
    for (let i = 0; i < 3; i++) {
      const logMesh = new THREE.Mesh(logGeo, logMat);
      logMesh.position.set(0, 0.08, 0);
      logMesh.rotation.set(Math.PI / 2, 0, (i / 3) * Math.PI * 2 + 0.4);
      logMesh.rotateX(0.28);
      fireGroup.add(logMesh);
    }

    // Campfire Light
    this.fireLight = new THREE.PointLight(0xff5500, 1.4, 9);
    this.fireLight.position.set(0, 0.4, 0);
    this.fireLight.castShadow = true;
    fireGroup.add(this.fireLight);

    // Fire particles
    const particleCount = 14;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    this.fireParticleData = [];

    for (let i = 0; i < particleCount; i++) {
      const rx = (Math.random() - 0.5) * 0.22;
      const ry = 0.1 + Math.random() * 0.55;
      const rz = (Math.random() - 0.5) * 0.22;

      positions[i * 3] = rx;
      positions[i * 3 + 1] = ry;
      positions[i * 3 + 2] = rz;

      this.fireParticleData.push({
        x: rx,
        y: ry,
        z: rz,
        speedY: 0.65 + Math.random() * 0.65,
        maxHeight: 0.5 + Math.random() * 0.5,
      });
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xff6a00,
      size: 0.26,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });

    this.fireParticles = new THREE.Points(geo, mat);
    fireGroup.add(this.fireParticles);

    // Position campfire at (11.5, 12.0) near shop
    const cx = 11.5, cz = 12.0;
    const ch = this.getTerrainHeight(cx, cz);
    fireGroup.position.set(cx, ch, cz);
    this.scene.add(fireGroup);
  }

  _animateCampfire(dt) {
    if (!this.fireParticles) return;
    const posAttr = this.fireParticles.geometry.attributes.position;
    
    for (let i = 0; i < this.fireParticleData.length; i++) {
      const d = this.fireParticleData[i];
      d.y += d.speedY * dt;
      
      d.x += (Math.random() - 0.5) * 0.06 * dt;
      d.z += (Math.random() - 0.5) * 0.06 * dt;

      if (d.y > d.maxHeight) {
        d.y = 0.08;
        d.x = (Math.random() - 0.5) * 0.18;
        d.z = (Math.random() - 0.5) * 0.18;
      }

      posAttr.setXYZ(i, d.x, d.y, d.z);
    }
    posAttr.needsUpdate = true;

    if (this.fireLight) {
      this.fireLight.intensity = 1.2 + Math.sin(this._clock * 16) * 0.4 + Math.cos(this._clock * 8) * 0.18;
    }
  }

  _buildUnderwaterFish() {
    this.fishMeshes = [];
    const fishMat = new THREE.MeshStandardMaterial({
      color: 0xe0e6ff, // glowing light silver blue
      emissive: 0x223355,
      roughness: 0.2,
      metalness: 0.2,
      transparent: true,
      opacity: 0.35, 
    });

    const count = 5;
    for (let i = 0; i < count; i++) {
      const fishGeo = new THREE.ConeGeometry(0.1, 0.32, 4);
      fishGeo.rotateX(Math.PI / 2);
      const fishMesh = new THREE.Mesh(fishGeo, fishMat);

      const px = -6 + Math.random() * 12;
      const pz = -23 + Math.random() * 10;
      const py = WORLD.WATER_LEVEL - 0.4 - Math.random() * 0.4;

      fishMesh.position.set(px, py, pz);
      
      fishMesh.userData = {
        speed: 0.7 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
        rotSpeed: 0.4 + Math.random() * 0.5,
        swimRadius: 4.5 + Math.random() * 4,
        centerX: px,
        centerZ: pz,
      };

      this.scene.add(fishMesh);
      this.fishMeshes.push(fishMesh);
    }
  }

  _animateUnderwaterFish(dt) {
    if (!this.fishMeshes) return;
    for (const fish of this.fishMeshes) {
      const ud = fish.userData;
      ud.phase += dt * ud.rotSpeed;

      const x = ud.centerX + Math.sin(ud.phase) * ud.swimRadius;
      const z = ud.centerZ + Math.cos(ud.phase) * ud.swimRadius;
      
      const angle = Math.atan2(Math.sin(ud.phase + 0.1) * ud.swimRadius - Math.sin(ud.phase) * ud.swimRadius,
                                Math.cos(ud.phase + 0.1) * ud.swimRadius - Math.cos(ud.phase) * ud.swimRadius);
      
      fish.position.x = x;
      fish.position.z = z;
      fish.rotation.y = angle + Math.PI / 2;
    }
  }

  _buildActiveSpotRipples() {
    this.ripples = [];
    const rippleGeo = new THREE.RingGeometry(0.08, 0.4, 16);
    rippleGeo.rotateX(-Math.PI / 2);

    const rippleMat = new THREE.MeshBasicMaterial({
      color: 0xaaddee,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const spots = [
      { x: 0,    y: WORLD.WATER_LEVEL + 0.015, z: -26.5 },
      { x: -3.5, y: WORLD.WATER_LEVEL + 0.015, z: -16 },
      { x: 3.5,  y: WORLD.WATER_LEVEL + 0.015, z: -16 },
      { x: -14,  y: WORLD.WATER_LEVEL + 0.015, z: -3.5 },
      { x: 14,   y: WORLD.WATER_LEVEL + 0.015, z: -3.5 }
    ];

    for (const spot of spots) {
      const ring = new THREE.Mesh(rippleGeo, rippleMat.clone());
      ring.position.set(spot.x, spot.y, spot.z);
      ring.userData = { scale: 0.1 + Math.random() * 0.9 };
      this.scene.add(ring);
      this.ripples.push(ring);
    }
  }

  _animateActiveSpotRipples(dt) {
    if (!this.ripples) return;
    for (const ring of this.ripples) {
      ring.userData.scale += dt * 0.45;
      if (ring.userData.scale > 1.6) {
        ring.userData.scale = 0.1;
      }
      
      const s = ring.userData.scale;
      ring.scale.set(s, s, 1);
      ring.material.opacity = Math.max(0, 0.5 * (1 - (s / 1.6)));
    }
  }

  _buildSteppingStones() {
    const pathPoints = [
      { x: 0, z: 8 },
      { x: 2, z: 8.5 },
      { x: 4, z: 9.2 },
      { x: 6, z: 9.8 },
      { x: 8, z: 10.5 },
      { x: 10, z: 11.2 }, // splits
      // to campfire
      { x: 11.5, z: 10.8 },
      // to shop
      { x: 12.5, z: 12.0 },
      { x: 14.0, z: 11.8 }
    ];

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x7c7c72,
      roughness: 0.9,
      flatShading: true
    });

    for (const p of pathPoints) {
      const h = this.getTerrainHeight(p.x, p.z);
      if (h < WORLD.WATER_LEVEL) continue;

      const scaleX = 0.5 + Math.random() * 0.25;
      const scaleZ = 0.5 + Math.random() * 0.25;
      const stoneGeo = new THREE.CylinderGeometry(0.4, 0.44, 0.06, 6);
      const stone = new THREE.Mesh(stoneGeo, stoneMat);
      stone.scale.set(scaleX, 1, scaleZ);
      stone.position.set(p.x, h + 0.015, p.z);
      stone.rotation.y = Math.random() * Math.PI;
      stone.receiveShadow = true;
      this.scene.add(stone);
    }
  }

  _buildBenches() {
    const benchLocations = [
      { x: 9.0, z: 13.0, rotY: -Math.PI / 4 }, // near campfire
      { x: -4.0, z: 1.0, rotY: Math.PI / 8 }  // overlooking water
    ];

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 0.75 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

    for (const loc of benchLocations) {
      const h = this.getTerrainHeight(loc.x, loc.z);
      if (h < WORLD.WATER_LEVEL) continue;

      const benchGroup = new THREE.Group();
      benchGroup.position.set(loc.x, h, loc.z);
      benchGroup.rotation.y = loc.rotY;

      // Seat
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.45), woodMat);
      seat.position.set(0, 0.38, 0);
      seat.castShadow = true;
      benchGroup.add(seat);

      // Backrest
      const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 0.08), woodMat);
      backrest.position.set(0, 0.65, -0.2);
      backrest.castShadow = true;
      benchGroup.add(backrest);

      // Iron legs
      const legGeo = new THREE.BoxGeometry(0.08, 0.38, 0.08);
      const legL1 = new THREE.Mesh(legGeo, ironMat);
      legL1.position.set(-0.7, 0.19, 0.16);
      benchGroup.add(legL1);

      const legL2 = new THREE.Mesh(legGeo, ironMat);
      legL2.position.set(-0.7, 0.19, -0.16);
      benchGroup.add(legL2);

      const legR1 = new THREE.Mesh(legGeo, ironMat);
      legR1.position.set(0.7, 0.19, 0.16);
      benchGroup.add(legR1);

      const legR2 = new THREE.Mesh(legGeo, ironMat);
      legR2.position.set(0.7, 0.19, -0.16);
      benchGroup.add(legR2);

      // Backrest brackets
      const bracketL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), ironMat);
      bracketL.position.set(-0.7, 0.52, -0.18);
      bracketL.rotation.x = -0.15;
      benchGroup.add(bracketL);

      const bracketR = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.4, 0.04), ironMat);
      bracketR.position.set(0.7, 0.52, -0.18);
      bracketR.rotation.x = -0.15;
      benchGroup.add(bracketR);

      this.scene.add(benchGroup);
    }
  }

  _buildBeachProps() {
    const blanketLocations = [
      { x: 9, z: 0.2, color1: 0xe07a5f, color2: 0xf4a261 },
      { x: -9, z: 0.3, color1: 0x3d5a80, color2: 0x98c1d9 }
    ];

    for (const loc of blanketLocations) {
      const h = this.getTerrainHeight(loc.x, loc.z);
      const blanketGroup = new THREE.Group();
      blanketGroup.position.set(loc.x, h + 0.005, loc.z);

      const mat1 = new THREE.MeshStandardMaterial({ color: loc.color1, roughness: 0.95 });
      const mat2 = new THREE.MeshStandardMaterial({ color: loc.color2, roughness: 0.95 });

      const stripe1 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.01, 1.4), mat1);
      stripe1.position.x = -0.4;
      blanketGroup.add(stripe1);

      const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.01, 1.4), mat2);
      stripe2.position.x = 0;
      blanketGroup.add(stripe2);

      const stripe3 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.01, 1.4), mat1);
      stripe3.position.x = 0.4;
      blanketGroup.add(stripe3);

      blanketGroup.rotation.y = Math.random() * 0.4 - 0.2;
      this.scene.add(blanketGroup);

      // Beach umbrella
      const umbrella = new THREE.Group();
      umbrella.position.set(loc.x + 0.9, h, loc.z + 0.4);

      const poleMat = new THREE.MeshStandardMaterial({ color: 0xddcbb4, roughness: 0.7 });
      const umbrellaPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 5), poleMat);
      umbrellaPole.position.y = 0.9;
      umbrellaPole.castShadow = true;
      umbrella.add(umbrellaPole);

      const topMat = new THREE.MeshStandardMaterial({
        color: loc.color2,
        roughness: 0.8,
        flatShading: true
      });
      const topMesh = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.45, 8), topMat);
      topMesh.position.y = 1.7;
      topMesh.castShadow = true;
      umbrella.add(topMesh);

      umbrella.rotation.set(0.1, Math.random() * Math.PI, 0.08);
      this.scene.add(umbrella);
    }

    // Add wooden barrels and crates near dock start
    const cargoGroup = new THREE.Group();
    cargoGroup.position.set(2.8, this.getTerrainHeight(2.8, 1), 1.0);

    const barrelMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 });
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x8b6b4c, roughness: 0.85 });

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.65, 8), barrelMat);
    barrel.position.set(0, 0.32, 0);
    barrel.castShadow = true;
    cargoGroup.add(barrel);

    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), crateMat);
    crate.position.set(-0.6, 0.275, 0.25);
    crate.rotation.y = 0.35;
    crate.castShadow = true;
    cargoGroup.add(crate);

    this.scene.add(cargoGroup);
  }

  _buildCampfireLogSeats() {
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1e, roughness: 0.9 });
    const seats = [
      { angle: Math.PI * 0.4 },
      { angle: Math.PI * 1.0 },
      { angle: Math.PI * 1.6 }
    ];
    
    for (const seat of seats) {
      const sx = 11.5 + Math.cos(seat.angle) * 1.1;
      const sz = 12.0 + Math.sin(seat.angle) * 1.1;
      const sh = this.getTerrainHeight(sx, sz);

      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 6), logMat);
      log.rotateX(Math.PI / 2);
      log.rotation.z = seat.angle + Math.PI / 2;
      log.position.set(sx, sh + 0.08, sz);
      log.castShadow = true;
      log.receiveShadow = true;
      this.scene.add(log);
    }
  }

  _animateSmoke(dt) {
    if (!this.smokeParticles) return;
    this.smokeTimer += dt;
    
    if (this.smokeTimer > 0.4) {
      this.smokeTimer = 0;
      
      const pGeo = new THREE.DodecahedronGeometry(0.12 + Math.random() * 0.08, 0);
      const pMat = new THREE.MeshBasicMaterial({
        color: 0xdfdfdf,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const particle = new THREE.Mesh(pGeo, pMat);
      
      const sh = computeHeight(15, 10);
      particle.position.set(
        16.8 + (Math.random() - 0.5) * 0.1,
        sh + 5.4,
        11.0 + (Math.random() - 0.5) * 0.1
      );
      this.smokeParticleGroup.add(particle);
      
      this.smokeParticles.push({
        mesh: particle,
        age: 0,
        maxAge: 2.2 + Math.random() * 0.8,
        vx: (Math.random() - 0.5) * 0.18,
        vy: 0.7 + Math.random() * 0.4,
        vz: (Math.random() - 0.5) * 0.18,
      });
    }

    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.age += dt;
      if (p.age >= p.maxAge) {
        this.smokeParticleGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.smokeParticles.splice(i, 1);
      } else {
        const ratio = p.age / p.maxAge;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        
        const s = 1.0 + ratio * 2.5;
        p.mesh.scale.set(s, s, s);
        
        p.mesh.material.opacity = 0.65 * (1 - ratio);
      }
    }
  }

  // ─── Weather & Ambient Systems ───────────────────────────────────────

  _buildRain() {
    const rainCount = 1200;
    const rainGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(rainCount * 3);
    this.rainData = [];

    for (let i = 0; i < rainCount; i++) {
      const rx = (Math.random() - 0.5) * 60;
      const ry = (Math.random() - 0.5) * 30 + 5; // relative offset between -10 and +20
      const rz = (Math.random() - 0.5) * 60;

      positions[i * 3] = rx;
      positions[i * 3 + 1] = ry;
      positions[i * 3 + 2] = rz;

      this.rainData.push({
        x: rx,
        y: ry,
        z: rz,
        speedY: 18 + Math.random() * 10,
      });
    }

    rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    this.rainMat = new THREE.PointsMaterial({
      color: 0x88ccff,
      size: 0.20, // Premium cozy styling (increased from 0.08)
      transparent: true,
      opacity: 0.0, // starts hidden
      depthWrite: false,
    });

    this.rainParticles = new THREE.Points(rainGeo, this.rainMat);
    this.scene.add(this.rainParticles);
  }

  _animateRain(dt) {
    if (!this.rainParticles) return;

    if (this.weather !== 'rainy') {
      if (this.rainMat.opacity > 0) {
        this.rainMat.opacity = Math.max(0, this.rainMat.opacity - dt * 2.0);
      }
      return;
    }

    if (this.rainMat.opacity < 0.6) {
      this.rainMat.opacity = Math.min(0.6, this.rainMat.opacity + dt * 2.0);
    }

    const posAttr = this.rainParticles.geometry.attributes.position;
    const camX = this.camera.position.x;
    const camY = this.camera.position.y;
    const camZ = this.camera.position.z;

    for (let i = 0; i < this.rainData.length; i++) {
      const d = this.rainData[i];
      d.y -= d.speedY * dt;

      // Reset rain bounds relative to camera
      if (d.y < -12) {
        d.y = 18 + Math.random() * 10;
        d.x = (Math.random() - 0.5) * 60;
        d.z = (Math.random() - 0.5) * 60;
      }

      posAttr.setXYZ(i, camX + d.x, camY + d.y, camZ + d.z);
    }
    posAttr.needsUpdate = true;
  }

  _animateDayNight(dt) {
    // 24 game hours take 1440 seconds (24 minutes) in real life (1 hour = 1 minute)
    this.timeOfDay = (this.timeOfDay + dt * (24 / 1440)) % 24;

    let topColor, midColor, botColor;
    let sunColor, sunIntensity, ambientIntensity, hemiIntensity;
    let fogColor, fogDensity;
    let firefliesOpacity = 0;
    let lightIntensityFactor = 0;

    // Calculate fireflies opacity: only active at night (smooth fade in/out at dusk/dawn)
    if (this.timeOfDay >= 20.0 || this.timeOfDay < 5.0) {
      firefliesOpacity = 0.95; // fully active at night
    } else if (this.timeOfDay >= 18.5 && this.timeOfDay < 20.0) {
      firefliesOpacity = ((this.timeOfDay - 18.5) / 1.5) * 0.95; // fade in at sunset
    } else if (this.timeOfDay >= 5.0 && this.timeOfDay < 6.5) {
      firefliesOpacity = (1.0 - (this.timeOfDay - 5.0) / 1.5) * 0.95; // fade out at sunrise
    } else {
      firefliesOpacity = 0.0; // completely off during daytime
    }

    if (this.timeOfDay >= 5 && this.timeOfDay < 8) {
      // Sunrise
      const t = (this.timeOfDay - 5) / 3;
      topColor = new THREE.Color(0x0a163a).lerp(new THREE.Color(0x87ceeb), t);
      midColor = new THREE.Color(0x182c66).lerp(new THREE.Color(0xf0d090), t);
      botColor = new THREE.Color(0x101f4c).lerp(new THREE.Color(0xffe4c4), t);

      sunColor = new THREE.Color(0x6aa2ff).lerp(new THREE.Color(0xffecd2), t);
      sunIntensity = 0.32 + t * 0.58; // from 0.32 to 0.9
      ambientIntensity = 0.38 + t * 0.02; // from 0.38 to 0.40
      hemiIntensity = 0.22 + t * 0.03; // from 0.22 to 0.25
      fogColor = new THREE.Color(0x0b1330).lerp(new THREE.Color(0xe0cdb4), t);
      fogDensity = 0.016 - t * 0.001; // from 0.016 to 0.015
      lightIntensityFactor = 1 - t;
    } else if (this.timeOfDay >= 8 && this.timeOfDay < 17) {
      // Day
      topColor = new THREE.Color(0x87ceeb);
      midColor = new THREE.Color(0xf0d090);
      botColor = new THREE.Color(0xffe4c4);

      sunColor = new THREE.Color(0xffecd2);
      sunIntensity = 0.9;
      ambientIntensity = 0.4;
      hemiIntensity = 0.25;
      fogColor = new THREE.Color(0xe0cdb4);
      fogDensity = 0.015;
      lightIntensityFactor = 0;
    } else if (this.timeOfDay >= 17 && this.timeOfDay < 20) {
      // Sunset
      const t = (this.timeOfDay - 17) / 3;
      topColor = new THREE.Color(0x87ceeb).lerp(new THREE.Color(0x0a163a), t);
      midColor = new THREE.Color(0xf0d090).lerp(new THREE.Color(0x182c66), t);
      botColor = new THREE.Color(0xffe4c4).lerp(new THREE.Color(0x101f4c), t);

      sunColor = new THREE.Color(0xffecd2).lerp(new THREE.Color(0x6aa2ff), t);
      sunIntensity = 0.9 - t * 0.58; // from 0.9 to 0.32
      ambientIntensity = 0.40 - t * 0.02; // from 0.40 to 0.38
      hemiIntensity = 0.25 - t * 0.03; // from 0.25 to 0.22
      fogColor = new THREE.Color(0xe0cdb4).lerp(new THREE.Color(0x0b1330), t);
      fogDensity = 0.015 + t * 0.001; // from 0.015 to 0.016
      lightIntensityFactor = t;
    } else {
      // Cozy Blue Night
      topColor = new THREE.Color(0x0a163a); // Brighter midnight blue
      midColor = new THREE.Color(0x182c66); // Deep glowing blue
      botColor = new THREE.Color(0x101f4c); // Indigo blue

      sunColor = new THREE.Color(0x6aa2ff); // Moonlight warm blue-indigo
      sunIntensity = 0.32;                  // Brighter moonlight
      ambientIntensity = 0.38;              // Cozy night ambiance (not pitch black!)
      hemiIntensity = 0.22;                 // Cozy blue hemisphere light
      fogColor = new THREE.Color(0x0b1330); // Dark cozy blue fog
      fogDensity = 0.016;                   // Slightly less thick fog for a cleaner look
      lightIntensityFactor = 1.0;
    }

    // Weather Factor (rainy/overcast)
    if (this.weather === 'rainy') {
      const greyColor = new THREE.Color(0x333344);
      topColor.lerp(greyColor, 0.65);
      midColor.lerp(greyColor, 0.55);
      botColor.lerp(greyColor, 0.45);
      sunColor.lerp(greyColor, 0.85);
      sunIntensity *= 0.2;
      ambientIntensity *= 0.65;
      hemiIntensity *= 0.65;
      fogColor.lerp(greyColor, 0.7);
      fogDensity = Math.max(fogDensity, 0.026);
    }

    // Apply uniforms
    if (this.skyMat) {
      this.skyMat.uniforms.uTopColor.value.copy(topColor);
      this.skyMat.uniforms.uMiddleColor.value.copy(midColor);
      this.skyMat.uniforms.uBottomColor.value.copy(botColor);
    }

    if (this.ambient) {
      this.ambient.color.copy(sunColor);
      this.ambient.intensity = ambientIntensity;
    }
    if (this.hemi) {
      this.hemi.color.copy(topColor);
      this.hemi.groundColor.copy(botColor);
      this.hemi.intensity = hemiIntensity;
    }
    if (this.sun) {
      const angle = (this.timeOfDay / 24) * Math.PI * 2 - Math.PI / 2;
      this.sun.position.set(Math.cos(angle) * 35, Math.sin(angle) * 35, 10);
      this.sun.color.copy(sunColor);
      this.sun.intensity = sunIntensity;
    }

    if (this.scene.fog) {
      this.scene.fog.color.copy(fogColor);
      this.scene.fog.density = fogDensity;
    }
    if (this.renderer) {
      this.renderer.setClearColor(fogColor);
    }

    // Fireflies opacity
    if (this.fireflies && this.fireflies.material) {
      this.fireflies.material.opacity = firefliesOpacity;
    }

    // Tree hanging lanterns glass glow animation
    if (this.treeLanternGlowMat) {
      this.treeLanternGlowMat.emissiveIntensity = lightIntensityFactor * 1.5;
    }

    // Lanterns & Details
    if (this.lanternLights) {
      this.lanternLights.forEach(light => {
        light.intensity = lightIntensityFactor * 0.75;
      });
    }
    if (this.lanternGlowSprites) {
      this.lanternGlowSprites.forEach(sprite => {
        sprite.visible = lightIntensityFactor > 0.15;
        sprite.material.opacity = lightIntensityFactor;
      });
    }
    if (this.windowGlassMat) {
      this.windowGlassMat.emissiveIntensity = lightIntensityFactor * 0.85;
    }
    if (this.shopLight) {
      this.shopLight.intensity = lightIntensityFactor * 0.8;
    }

    // Campfire Pointlight
    if (this.fireLight) {
      if (lightIntensityFactor > 0.1) {
        this.fireLight.intensity = (1.2 + Math.sin(this._clock * 16) * 0.4 + Math.cos(this._clock * 8) * 0.18) * lightIntensityFactor;
      } else {
        this.fireLight.intensity = 0;
      }
    }
  }

  setWeather(weather) {
    this.weather = weather;
  }
}
