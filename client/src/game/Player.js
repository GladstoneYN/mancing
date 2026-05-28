/**
 * Player — local player controller with movement, terrain collision,
 * walking animation, and fishing state.
 */
import * as THREE from 'three';
import { PLAYER, WORLD } from '@/utils/Constants.js';
import { COSMETICS } from '@shared/fishCatalog.js';
import { getRarityColor } from '@/fishing/FishData.js';

export class Player {
  /**
   * @param {THREE.Scene} scene
   * @param {object} playerData — { id, username, appearance: { bodyColor, hat, accessory } }
   */
  constructor(scene, playerData) {
    this.scene = scene;
    this.playerData = playerData;
    this.appearance = playerData.appearance || {
      bodyColor: '#76d7c4',
      hat: 'none',
      accessory: 'none',
    };

    let posX = playerData.last_position_x !== undefined ? playerData.last_position_x : WORLD.SPAWN_X;
    let posY = playerData.last_position_y !== undefined ? playerData.last_position_y : 0;
    let posZ = playerData.last_position_z !== undefined ? playerData.last_position_z : WORLD.SPAWN_Z;

    posX = Math.max(WORLD.BOUNDS_MIN_X, Math.min(WORLD.BOUNDS_MAX_X, posX));
    posZ = Math.max(WORLD.BOUNDS_MIN_Z, Math.min(WORLD.BOUNDS_MAX_Z, posZ));

    this.position = new THREE.Vector3(posX, posY, posZ);
    this.rotation = 0; // Y-axis angle in radians
    this._targetRotation = 0;

    this.state = 'idle'; // 'idle' | 'walking' | 'fishing'
    this.velocityY = 0;
    this.isGrounded = true;
    this._castThrowTimer = 0;

    // Walk bob animation
    this._bobPhase = 0;
    this._bobOffset = 0;
    this._blinkTimer = 2 + Math.random() * 2;

    // Build mesh hierarchy
    this._hatMeshes = [];
    this._accessoryMeshes = [];
    this.group = new THREE.Group();
    this._buildBody();
    this._buildHead();
    this._buildHat();
    this._buildAccessory();
    this.group.position.copy(this.position);
    scene.add(this.group);
  }

  // ─── Mesh Construction ───────────────────────────────

  _buildBody() {
    const color = new THREE.Color(this.appearance.bodyColor);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.65,
      metalness: 0.05,
    });
    
    // Cozy cream sweater/vest material
    const sweaterMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5e8,
      roughness: 0.8,
    });

    const buttonMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.9,
    });

    // Base body capsule is now the solid cream sweater itself!
    const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.3, 8, 12);
    this._body = new THREE.Mesh(bodyGeo, sweaterMat);
    this._body.position.y = 0.5;
    this._body.castShadow = true;
    this.group.add(this._body);

    // Front buttons on sweater (parented directly to this._body mesh!)
    const buttonGeo = new THREE.SphereGeometry(0.02, 6, 6);
    const button1 = new THREE.Mesh(buttonGeo, buttonMat);
    button1.position.set(0, 0.02, 0.22);
    this._body.add(button1);

    const button2 = new THREE.Mesh(buttonGeo, buttonMat);
    button2.position.set(0, -0.08, 0.22);
    this._body.add(button2);

    // Small V-neck cutout at the collar showing the skin/body color (parented directly to this._body mesh!)
    const neckCutoutGeo = new THREE.ConeGeometry(0.07, 0.1, 4);
    neckCutoutGeo.rotateX(Math.PI); // point down
    const neckCutout = new THREE.Mesh(neckCutoutGeo, this.bodyMat);
    // Put at the front top of the capsule relative to body mesh
    neckCutout.position.set(0, 0.14, 0.18);
    this._body.add(neckCutout);

    // Left Arm Group (pivot at shoulder)
    this._leftArm = new THREE.Group();
    this._leftArm.position.set(-0.3, 0.55, 0);
    
    // Sleeve (cream)
    const sleeveGeo = new THREE.CylinderGeometry(0.07, 0.065, 0.18, 6);
    sleeveGeo.translate(0, -0.09, 0);
    const sleeve = new THREE.Mesh(sleeveGeo, sweaterMat);
    sleeve.castShadow = true;
    this._leftArm.add(sleeve);

    // Hand (body color)
    const handGeo = new THREE.SphereGeometry(0.06, 8, 8);
    this._leftHand = new THREE.Mesh(handGeo, this.bodyMat);
    this._leftHand.position.set(0, -0.21, 0);
    this._leftHand.castShadow = true;
    this._leftArm.add(this._leftHand);
    this.group.add(this._leftArm);

    // Right Arm Group (pivot at shoulder)
    this._rightArm = new THREE.Group();
    this._rightArm.position.set(0.3, 0.55, 0);
    
    // Sleeve
    const sleeveRight = new THREE.Mesh(sleeveGeo, sweaterMat);
    sleeveRight.castShadow = true;
    this._rightArm.add(sleeveRight);

    // Hand
    this._rightHand = new THREE.Mesh(handGeo, this.bodyMat);
    this._rightHand.position.set(0, -0.21, 0);
    this._rightHand.castShadow = true;
    this._rightArm.add(this._rightHand);
    this.group.add(this._rightArm);

    // Legs
    // Left Leg Group
    this._leftLeg = new THREE.Group();
    this._leftLeg.position.set(-0.14, 0.12, 0);

    // White socks
    const sockGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6);
    sockGeo.translate(0, -0.05, 0);
    const sockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const leftSock = new THREE.Mesh(sockGeo, sockMat);
    this._leftLeg.add(leftSock);

    // Leather boots
    const shoeGeo = new THREE.SphereGeometry(0.06, 8, 8);
    shoeGeo.scale(1, 0.7, 1.35);
    shoeGeo.translate(0, -0.11, 0.035);
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x4a2f13, roughness: 0.75 });
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.castShadow = true;
    this._leftLeg.add(leftShoe);
    this.group.add(this._leftLeg);

    // Right Leg Group
    this._rightLeg = new THREE.Group();
    this._rightLeg.position.set(0.14, 0.12, 0);

    const rightSock = new THREE.Mesh(sockGeo, sockMat);
    this._rightLeg.add(rightSock);

    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.castShadow = true;
    this._rightLeg.add(rightShoe);
    this.group.add(this._rightLeg);
  }

  _buildHead() {
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.5,
    });

    // Head sphere (smaller to match new body)
    const headGeo = new THREE.SphereGeometry(0.28, 12, 10);
    this._head = new THREE.Mesh(headGeo, this.bodyMat);
    this._head.position.y = 0.95;
    this._head.castShadow = true;
    this.group.add(this._head);

    // Ears (Cat Ears Geometry) Added directly to Head!
    const earGeo = new THREE.ConeGeometry(0.09, 0.18, 4);
    earGeo.rotateY(Math.PI * 0.25); // Rotate so flat face is front/outward
    earGeo.scale(1, 1, 0.7); // Flatten slightly along Z
    earGeo.translate(0, 0.09, 0); // Center pivot at base
    
    this._leftEar = new THREE.Mesh(earGeo, this.bodyMat);
    this._leftEar.castShadow = true;
    this._head.add(this._leftEar);

    this._rightEar = new THREE.Mesh(earGeo, this.bodyMat);
    this._rightEar.castShadow = true;
    this._head.add(this._rightEar);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.045, 6, 6);
    this._leftEye = new THREE.Mesh(eyeGeo, darkMat);
    this._leftEye.position.set(-0.09, 0.03, 0.23);
    this._head.add(this._leftEye);

    this._rightEye = new THREE.Mesh(eyeGeo, darkMat);
    this._rightEye.position.set(0.09, 0.03, 0.23);
    this._head.add(this._rightEye);

    // Shiny eye highlights
    const highlightGeo = new THREE.SphereGeometry(0.013, 6, 6);
    const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    const highlightL = new THREE.Mesh(highlightGeo, highlightMat);
    highlightL.position.set(-0.075, 0.05, 0.255);
    this._head.add(highlightL);

    const highlightR = new THREE.Mesh(highlightGeo, highlightMat);
    highlightR.position.set(0.105, 0.05, 0.255);
    this._head.add(highlightR);

    // Blush cheeks
    const blushMat = new THREE.MeshStandardMaterial({ color: 0xffa0a0, roughness: 0.9 });
    const blushGeo = new THREE.SphereGeometry(0.035, 6, 6);
    blushGeo.scale(1, 0.5, 0.2);

    const leftBlush = new THREE.Mesh(blushGeo, blushMat);
    leftBlush.position.set(-0.15, -0.05, 0.24);
    leftBlush.rotation.set(0, -0.2, 0);
    this._head.add(leftBlush);

    const rightBlush = new THREE.Mesh(blushGeo, blushMat);
    rightBlush.position.set(0.15, -0.05, 0.24);
    rightBlush.rotation.set(0, 0.2, 0);
    this._head.add(rightBlush);

    // Mouth — small curved line
    const mouthGeo = new THREE.SphereGeometry(0.025, 4, 4);
    const mouth = new THREE.Mesh(mouthGeo, darkMat);
    mouth.position.set(0, -0.08, 0.25);
    mouth.scale.set(1.5, 0.6, 0.6);
    this._head.add(mouth);
  }

  _buildHat() {
    if (this._hatMeshes) {
      for (const mesh of this._hatMeshes) {
        this._head.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
      }
    }
    this._hatMeshes = [];

    const hatId = this.appearance.hat;
    if (!hatId || hatId === 'none') {
      this._updateEars();
      return;
    }

    const hatMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });

    switch (hatId) {
      case 'beanie': {
        hatMat.color = new THREE.Color(0xe57373);
        const geo = new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
        const mesh = new THREE.Mesh(geo, hatMat);
        mesh.position.y = 0.20;
        this._head.add(mesh);
        this._hatMeshes.push(mesh);
        // Pompom
        const pomGeo = new THREE.SphereGeometry(0.08, 6, 6);
        const pom = new THREE.Mesh(pomGeo, hatMat);
        pom.position.y = 0.38;
        this._head.add(pom);
        this._hatMeshes.push(pom);
        break;
      }
      case 'bucket_hat': {
        hatMat.color = new THREE.Color(0xf4a460);
        const brimGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 14);
        const brim = new THREE.Mesh(brimGeo, hatMat);
        brim.position.y = 0.23;
        this._head.add(brim);
        this._hatMeshes.push(brim);
        const topGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.2, 14);
        const top = new THREE.Mesh(topGeo, hatMat);
        top.position.y = 0.33;
        this._head.add(top);
        this._hatMeshes.push(top);
        break;
      }
      case 'cowboy_hat': {
        hatMat.color = new THREE.Color(0x8B6914);
        const brimGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.04, 14);
        const brim = new THREE.Mesh(brimGeo, hatMat);
        brim.position.y = 0.23;
        this._head.add(brim);
        this._hatMeshes.push(brim);
        const topGeo = new THREE.CylinderGeometry(0.19, 0.26, 0.23, 8);
        const top = new THREE.Mesh(topGeo, hatMat);
        top.position.y = 0.35;
        this._head.add(top);
        this._hatMeshes.push(top);
        break;
      }
      case 'witch_hat': {
        hatMat.color = new THREE.Color(0x2d1b4e);
        const brimGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14);
        const brim = new THREE.Mesh(brimGeo, hatMat);
        brim.position.y = 0.23;
        this._head.add(brim);
        this._hatMeshes.push(brim);
        const coneGeo = new THREE.ConeGeometry(0.2, 0.55, 8);
        const cone = new THREE.Mesh(coneGeo, hatMat);
        cone.position.y = 0.52;
        cone.rotation.z = 0.12;
        this._head.add(cone);
        this._hatMeshes.push(cone);
        break;
      }
      case 'crown': {
        hatMat.color = new THREE.Color(0xfbbf24);
        hatMat.metalness = 0.6;
        hatMat.roughness = 0.3;
        const geo = new THREE.CylinderGeometry(0.23, 0.26, 0.18, 5);
        const mesh = new THREE.Mesh(geo, hatMat);
        mesh.position.y = 0.28;
        this._head.add(mesh);
        this._hatMeshes.push(mesh);
        break;
      }
      case 'party_hat': {
        hatMat.color = new THREE.Color(0xe8a0bf);
        const geo = new THREE.ConeGeometry(0.18, 0.4, 8);
        const mesh = new THREE.Mesh(geo, hatMat);
        mesh.position.y = 0.38;
        this._head.add(mesh);
        this._hatMeshes.push(mesh);
        break;
      }
    }
    this._updateEars();
  }

  _updateEars() {
    if (!this._leftEar || !this._rightEar) return;

    const hatId = this.appearance.hat;
    const hasHat = hatId && hatId !== 'none';

    if (hasHat) {
      // Ears pushed down to the sides under the hat
      this._leftEar.position.set(-0.24, 0.06, -0.02);
      this._leftEar.rotation.set(0.1, 0.15, Math.PI * 0.53); // tilted down to sides (like 95 degrees)

      this._rightEar.position.set(0.24, 0.06, -0.02);
      this._rightEar.rotation.set(0.1, -0.15, -Math.PI * 0.53);
    } else {
      // Ears perked up at ~50 degrees (40 degrees from vertical = ~0.22 * PI)
      this._leftEar.position.set(-0.15, 0.21, -0.02);
      this._leftEar.rotation.set(0.15, 0.25, Math.PI * 0.22); // perked up 50 deg from horiz

      this._rightEar.position.set(0.15, 0.21, -0.02);
      this._rightEar.rotation.set(0.15, -0.25, -Math.PI * 0.22);
    }
  }

  _buildAccessory() {
    if (this._accessoryMeshes) {
      for (const mesh of this._accessoryMeshes) {
        this.group.remove(mesh);
        this._head.remove(mesh);
        this._body.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) mesh.material.dispose();
      }
    }
    this._accessoryMeshes = [];

    const accId = this.appearance.accessory;
    if (!accId || accId === 'none') return;

    switch (accId) {
      case 'round_glasses': {
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
        
        const glL = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.055, 12), frameMat);
        glL.position.set(-0.09, 0.03, 0.255);
        this._head.add(glL);
        this._accessoryMeshes.push(glL);

        const glR = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.055, 12), frameMat);
        glR.position.set(0.09, 0.03, 0.255);
        this._head.add(glR);
        this._accessoryMeshes.push(glR);

        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.01), frameMat);
        bridge.position.set(0, 0.03, 0.254);
        this._head.add(bridge);
        this._accessoryMeshes.push(bridge);
        break;
      }
      case 'sunglasses': {
        const frameMat = new THREE.MeshStandardMaterial({ color: 0xfbcb24, roughness: 0.4, metalness: 0.8 });
        const shadesMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 });

        const lensL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.01), shadesMat);
        lensL.position.set(-0.09, 0.04, 0.255);
        this._head.add(lensL);
        this._accessoryMeshes.push(lensL);

        const lensR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.01), shadesMat);
        lensR.position.set(0.09, 0.04, 0.255);
        this._head.add(lensR);
        this._accessoryMeshes.push(lensR);

        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.015), frameMat);
        bridge.position.set(0, 0.06, 0.254);
        this._head.add(bridge);
        this._accessoryMeshes.push(bridge);
        break;
      }
      case 'scarf': {
        const scarfMat = new THREE.MeshStandardMaterial({ color: 0xd63031, roughness: 0.9 });
        
        const scarfWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 8), scarfMat);
        scarfWrap.position.y = -0.15;
        this._head.add(scarfWrap);
        this._accessoryMeshes.push(scarfWrap);

        const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.04), scarfMat);
        scarfTail.position.set(0.07, -0.24, 0.23);
        scarfTail.rotation.set(0.08, 0, -0.12);
        this._head.add(scarfTail);
        this._accessoryMeshes.push(scarfTail);
        break;
      }
      case 'backpack': {
        const packMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
        const strapMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1e, roughness: 0.9 });

        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, 0.14), packMat);
        pack.position.set(0, 0, -0.26);
        pack.castShadow = true;
        this._body.add(pack);
        this._accessoryMeshes.push(pack);

        const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.08), packMat);
        pocket.position.set(0, -0.08, -0.34);
        pocket.castShadow = true;
        this._body.add(pocket);
        this._accessoryMeshes.push(pocket);

        const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.15), strapMat);
        strapL.position.set(-0.15, 0.02, -0.13);
        this._body.add(strapL);
        this._accessoryMeshes.push(strapL);

        const strapR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.15), strapMat);
        strapR.position.set(0.15, 0.02, -0.13);
        this._body.add(strapR);
        this._accessoryMeshes.push(strapR);
        break;
      }
    }
  }

  // ─── Update (called each frame) ──────────────────────

  /**
   * @param {number} dt — delta time in seconds
   * @param {InputManager} input
   * @param {World} world
   * @param {CameraController} [cameraController]
   */
  update(dt, input, world, cameraController) {
    if (this._castThrowTimer > 0) {
      this._castThrowTimer -= dt;
      if (this._castThrowTimer < 0) this._castThrowTimer = 0;
    }

    if (this.emote) {
      this.emote.timer -= dt;
      if (this.emote.timer <= 0) {
        this._clearEmoteSprite();
        this.emote = null;
      }
    }

    const inWater = world.isInWater(this.position.x, this.position.z);
    const isCharging = this.state === 'charging_cast';
    const isFishingOrCharging = this.state === 'fishing' || this.state === 'reeling' || this.state === 'charging_cast';
    const moveInput = isFishingOrCharging ? { x: 0, z: 0 } : input.getMovementVector();
    let moveX = 0;
    let moveZ = 0;

    if (moveInput.x !== 0 || moveInput.z !== 0) {
      if (cameraController) {
        const camera = cameraController.getCamera();
        const cameraDirection = new THREE.Vector3();
        camera.getWorldDirection(cameraDirection);

        // Project onto X-Z plane and normalize
        cameraDirection.y = 0;
        cameraDirection.normalize();

        const cameraRight = new THREE.Vector3();
        cameraRight.crossVectors(cameraDirection, new THREE.Vector3(0, 1, 0)).normalize();

        // Calculate combined movement direction relative to camera
        const targetDirection = new THREE.Vector3();
        // moveInput.z is negative for forward (W), positive for backward (S)
        targetDirection.addScaledVector(cameraDirection, -moveInput.z);
        // moveInput.x is negative for left (A), positive for right (D)
        targetDirection.addScaledVector(cameraRight, moveInput.x);

        targetDirection.normalize();
        moveX = targetDirection.x;
        moveZ = targetDirection.z;
      } else {
        moveX = moveInput.x;
        moveZ = moveInput.z;
      }

      if (!isFishingOrCharging) {
        this.state = inWater ? 'swimming' : 'walking';
      }

      // Movement checks: not colliding with shop, trees, or new props (water is allowed!)
      const canMove = (x, z) => {
        return !world.collidesWithShop(x, z, PLAYER.BODY_RADIUS) &&
               !world.collidesWithTrees(x, z, PLAYER.BODY_RADIUS) &&
               !world.collidesWithNewProps(x, z, PLAYER.BODY_RADIUS);
      };

      const isSprinting = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
      const speedMultiplier = (isSprinting ? PLAYER.SPRINT_MULTIPLIER : 1.0) * (inWater ? 0.5 : 1.0);
      const speed = PLAYER.MOVE_SPEED * speedMultiplier * dt;
      let newX = this.position.x + moveX * speed;
      let newZ = this.position.z + moveZ * speed;


      // Clamp to world bounds
      newX = Math.max(WORLD.BOUNDS_MIN_X, Math.min(WORLD.BOUNDS_MAX_X, newX));
      newZ = Math.max(WORLD.BOUNDS_MIN_Z, Math.min(WORLD.BOUNDS_MAX_Z, newZ));

      if (canMove(newX, newZ)) {
        this.position.x = newX;
        this.position.z = newZ;
      } else {
        // Slide along edges: try X only
        if (canMove(newX, this.position.z)) {
          this.position.x = newX;
        }
        // Try Z only
        if (canMove(this.position.x, newZ)) {
          this.position.z = newZ;
        }
      }

      // Face movement direction
      this._targetRotation = Math.atan2(moveX, moveZ);

      // Walk bob
      const bobMultiplier = isSprinting ? 1.5 : 1.0;
      this._bobPhase += dt * PLAYER.BOB_SPEED * bobMultiplier;
      this._bobOffset = Math.sin(this._bobPhase) * PLAYER.BOB_AMOUNT;
    } else {
      if (!isFishingOrCharging) {
        this.state = inWater ? 'swimming' : 'idle';
      }
      this._bobPhase = 0;
      this._bobOffset *= 0.85; // ease out
    }

    // Jump mechanics (cannot jump if charging/fishing or swimming/in water)
    if (this.isGrounded && !isFishingOrCharging && !inWater) {
      if (input.wasPressed('Space')) {
        this.velocityY = PLAYER.JUMP_FORCE;
        this.isGrounded = false;
      }
    }

    const terrainY = world.getTerrainHeight(this.position.x, this.position.z);
    
    // Swimming floating height override
    let targetGroundedY = terrainY;
    if (inWater) {
      targetGroundedY = WORLD.WATER_LEVEL - 0.22;
    }

    if (this.isGrounded && this.position.y > targetGroundedY + 0.05) {
      this.isGrounded = false;
      this.velocityY = 0; // fall off ledge
    }

    if (!this.isGrounded) {
      this.velocityY -= PLAYER.GRAVITY * dt;
      this.position.y += this.velocityY * dt;

      if (this.position.y <= targetGroundedY) {
        this.position.y = targetGroundedY;
        this.velocityY = 0;
        this.isGrounded = true;
      }
    } else {
      this.position.y = targetGroundedY;
    }

    // Smooth rotation
    let rotDiff = this._targetRotation - this.rotation;
    // Wrap to [-PI, PI]
    while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
    while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
    this.rotation += rotDiff * Math.min(1, PLAYER.ROTATION_SPEED * dt);

    // Apply to mesh
    this.group.position.set(
      this.position.x,
      this.position.y + this._bobOffset,
      this.position.z
    );
    this.group.rotation.y = this.rotation;

    // --- Eye Blinking Animation ---
    this._blinkTimer -= dt;
    if (this._blinkTimer <= 0) {
      const phase = -this._blinkTimer;
      if (phase < 0.15) {
        this._leftEye.scale.y = 0.05;
        this._rightEye.scale.y = 0.05;
      } else {
        this._leftEye.scale.y = 1;
        this._rightEye.scale.y = 1;
        this._blinkTimer = 3 + Math.random() * 4;
      }
    } else {
      this._leftEye.scale.y = 1;
      this._rightEye.scale.y = 1;
    }

    // Reset body/head defaults (so they don't remain tilted after swimming!)
    if (this.state !== 'swimming') {
      this._body.position.set(0, 0.5, 0);
      this._body.rotation.set(0, 0, 0);
      this._head.position.set(0, 0.95, 0);
      this._head.rotation.set(0, 0, 0);
    }

    // --- Limb & Waddle Walking Animation ---
    if (this.emote) {
      const type = this.emote.type;
      if (type === 'wave') {
        const waveAngle = -Math.PI * 0.7 + Math.sin(Date.now() * 0.018) * 0.35;
        this._rightArm.position.set(0.3, 0.6, 0);
        this._rightArm.rotation.set(0, 0, waveAngle);
        this._leftArm.position.set(-0.3, 0.55, 0);
        this._leftArm.rotation.set(0, 0, 0);
        this._leftLeg.position.set(-0.14, 0.12, 0);
        this._rightLeg.position.set(0.14, 0.12, 0);
        this._leftLeg.position.z = 0;
        this._rightLeg.position.z = 0;
        this._body.rotation.z = 0;
        this._head.rotation.z = 0;
      } else if (type === 'jump') {
        const hop = Math.abs(Math.sin(Date.now() * 0.018)) * 0.45;
        this._bobOffset = hop;
        this._leftArm.position.set(-0.3, 0.65, 0);
        this._rightArm.position.set(0.3, 0.65, 0);
        this._leftArm.rotation.set(0, 0, Math.PI * 0.6);
        this._rightArm.rotation.set(0, 0, -Math.PI * 0.6);
        this._leftLeg.position.set(-0.18, 0.12, 0);
        this._rightLeg.position.set(0.18, 0.12, 0);
        this._leftLeg.position.z = 0;
        this._rightLeg.position.z = 0;
        this._body.rotation.z = 0;
        this._head.rotation.z = 0;
      } else if (type === 'spin') {
        this.rotation += dt * 16.0;
        this._leftArm.position.set(-0.3, 0.65, 0);
        this._rightArm.position.set(0.3, 0.65, 0);
        this._leftArm.rotation.set(0, 0, Math.PI * 0.45);
        this._rightArm.rotation.set(0, 0, -Math.PI * 0.45);
        this._leftLeg.position.set(-0.14, 0.12, 0);
        this._rightLeg.position.set(0.14, 0.12, 0);
        this._leftLeg.position.z = 0;
        this._rightLeg.position.z = 0;
        this._body.rotation.z = 0;
        this._head.rotation.z = 0;
      } else if (type === 'heart') {
        const tilt = Math.sin(Date.now() * 0.008) * 0.15;
        this._body.rotation.z = tilt;
        this._head.rotation.z = tilt * 0.5;
        this._leftArm.position.set(-0.25, 0.6, 0.15);
        this._rightArm.position.set(0.25, 0.6, 0.15);
        this._leftArm.rotation.set(-0.2, 0, 0.25);
        this._rightArm.rotation.set(-0.2, 0, -0.25);
        this._leftLeg.position.set(-0.14, 0.12, 0);
        this._rightLeg.position.set(0.14, 0.12, 0);
        this._leftLeg.position.z = 0;
        this._rightLeg.position.z = 0;
        if (this._emoteSprite) {
          const s = 0.85 + Math.sin(Date.now() * 0.015) * 0.15;
          this._emoteSprite.scale.set(s, s, 1);
        }
      } else if (type === 'laugh') {
        const shake = Math.sin(Date.now() * 0.02) * 0.18;
        this._head.rotation.x = -0.15 + shake * 0.5;
        this._body.rotation.z = shake * 0.2;
        this._leftArm.position.set(-0.28, 0.48, 0.1);
        this._rightArm.position.set(0.28, 0.48, 0.1);
        this._leftArm.rotation.set(-0.1, 0, 0.35);
        this._rightArm.rotation.set(-0.1, 0, -0.35);
        this._leftLeg.position.set(-0.14, 0.12, 0);
        this._rightLeg.position.set(0.14, 0.12, 0);
        this._leftLeg.position.z = 0;
        this._rightLeg.position.z = 0;
      } else if (type === 'cry') {
        this._head.rotation.x = 0.26;
        const tremble = Math.sin(Date.now() * 0.12) * 0.015;
        this.group.position.x += tremble;
        this._leftArm.position.set(-0.22, 0.62, 0.2);
        this._rightArm.position.set(0.22, 0.62, 0.2);
        this._leftArm.rotation.set(-0.4, 0.2, 0.1);
        this._rightArm.rotation.set(-0.4, -0.2, -0.1);
        this._leftLeg.position.set(-0.14, 0.12, 0);
        this._rightLeg.position.set(0.14, 0.12, 0);
        this._leftLeg.position.z = 0;
        this._rightLeg.position.z = 0;
      }
    } else if (!this.isGrounded) {
      // Airborne/jumping pose
      this._leftLeg.position.set(-0.14, 0.12, 0);
      this._rightLeg.position.set(0.14, 0.12, 0);
      this._leftLeg.position.z = 0.05;
      this._rightLeg.position.z = -0.05;

      if (this._heldFishGroup || this._caughtFishGroup) {
        this._leftArm.position.set(-0.18, 0.6, 0.2);
        this._rightArm.position.set(0.18, 0.6, 0.2);
        this._leftArm.rotation.set(-Math.PI * 0.2, 0, 0.1);
        this._rightArm.rotation.set(-Math.PI * 0.2, 0, -0.1);
      } else {
        this._leftArm.position.set(-0.3, 0.65, 0);
        this._rightArm.position.set(0.3, 0.65, 0);
        this._leftArm.rotation.set(0, 0, Math.PI * 0.3);
        this._rightArm.rotation.set(0, 0, -Math.PI * 0.3);
      }

      this._body.rotation.z = 0;
      this._head.rotation.z = 0;
    } else if (this.state === 'swimming') {
      const swimTime = Date.now() * 0.007;
      const isMoving = moveInput.x !== 0 || moveInput.z !== 0;

      if (isMoving) {
        // Lay flat in water (torso/body pitched forward)
        this._body.position.set(0, 0.25, -0.1);
        this._body.rotation.set(Math.PI * 0.42, 0, Math.sin(swimTime) * 0.05);

        // Head raised looking forward
        this._head.position.set(0, 0.45, 0.4);
        this._head.rotation.set(-Math.PI * 0.35, 0, 0);

        // Doggy paddle arms: reach forward and pull down alternately!
        this._leftArm.position.set(-0.28, 0.3, 0.2 + Math.sin(swimTime) * 0.1);
        this._rightArm.position.set(0.28, 0.3, 0.2 - Math.sin(swimTime) * 0.1);
        this._leftArm.rotation.set(-Math.PI * 0.3 + Math.cos(swimTime) * 0.4, 0, Math.PI * 0.05);
        this._rightArm.rotation.set(-Math.PI * 0.3 - Math.cos(swimTime) * 0.4, 0, -Math.PI * 0.05);
        
        // Legs trailing behind and scissor kicking
        this._leftLeg.position.set(-0.14, 0.18, -0.45 + Math.sin(swimTime * 1.5) * 0.1);
        this._rightLeg.position.set(0.14, 0.18, -0.45 - Math.sin(swimTime * 1.5) * 0.1);
        this._leftLeg.rotation.set(Math.PI * 0.45 + Math.sin(swimTime * 1.5) * 0.25, 0, 0);
        this._rightLeg.rotation.set(Math.PI * 0.45 - Math.sin(swimTime * 1.5) * 0.25, 0, 0);
      } else {
        // Treading water: slightly tilted torso forward
        const treadTime = Date.now() * 0.003;
        this._body.position.set(0, 0.42, -0.05);
        this._body.rotation.set(Math.PI * 0.15, 0, 0);

        this._head.position.set(0, 0.88, 0.08);
        this._head.rotation.set(-Math.PI * 0.12, 0, 0);

        // Treading arms
        this._leftArm.position.set(-0.28, 0.4, 0.05);
        this._rightArm.position.set(0.28, 0.4, 0.05);
        this._leftArm.rotation.set(-Math.PI * 0.1, 0, Math.PI * 0.25 + Math.sin(treadTime) * 0.15);
        this._rightArm.rotation.set(-Math.PI * 0.1, 0, -Math.PI * 0.25 - Math.sin(treadTime) * 0.15);
        
        // Legs treading water below
        this._leftLeg.position.set(-0.14, 0.12, -0.05);
        this._rightLeg.position.set(0.14, 0.12, -0.05);
        this._leftLeg.rotation.set(Math.PI * 0.1 + Math.sin(treadTime * 2) * 0.15, 0, 0);
        this._rightLeg.rotation.set(Math.PI * 0.1 - Math.sin(treadTime * 2) * 0.15, 0, 0);
      }
    } else if (this.state === 'charging_cast') {
      if (!this._rodGroup) {
        // Fallback target: 3 units in front
        const spotPos = new THREE.Vector3(0, -0.3, 3);
        spotPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotation);
        spotPos.add(this.position);
        this._buildFishingRodMesh(spotPos);
      }
      if (this._fishingLine) this._fishingLine.visible = false;
      if (this._bobberGroup) this._bobberGroup.visible = false;

      // Raise arms back/high preparing for throw!
      this._leftArm.position.set(-0.22, 0.65, -0.1);
      this._rightArm.position.set(0.22, 0.65, -0.1);
      this._leftArm.rotation.set(Math.PI * 0.75, 0, 0.1);
      this._rightArm.rotation.set(Math.PI * 0.75, 0, -0.1);
      
      this._rodGroup.rotation.x = -Math.PI * 0.25; // Rod held high and back!
      this._rodSeg1.rotation.x = 0;
      this._rodSeg2.rotation.x = 0;
      this._rodSeg3.rotation.x = 0;

      this._leftLeg.position.set(-0.14, 0.12, 0);
      this._rightLeg.position.set(0.14, 0.12, 0);
      this._leftLeg.position.z = 0;
      this._rightLeg.position.z = 0;

      this._body.rotation.z = 0;
      this._head.rotation.z = 0;
    } else if (this.state === 'walking') {
      const swing = this._bobPhase * 1.5;
      
      // Scissor leg swing
      this._leftLeg.position.x = -0.14;
      this._rightLeg.position.x = 0.14;
      this._leftLeg.position.z = Math.sin(swing) * 0.22;
      this._rightLeg.position.z = -Math.sin(swing) * 0.22;
      this._leftLeg.position.y = 0.12 + Math.max(0, Math.cos(swing) * 0.06);
      this._rightLeg.position.y = 0.12 + Math.max(0, -Math.cos(swing) * 0.06);

      // Scissor arm swing (ONLY IF NOT HOLDING A FISH!)
      if (this._heldFishGroup || this._caughtFishGroup) {
        this._leftArm.position.set(-0.18, 0.6, 0.2);
        this._rightArm.position.set(0.18, 0.6, 0.2);
        this._leftArm.rotation.set(-Math.PI * 0.2, 0, 0.1);
        this._rightArm.rotation.set(-Math.PI * 0.2, 0, -0.1);
      } else {
        this._leftArm.position.x = -0.3;
        this._leftArm.position.y = 0.55;
        this._leftArm.position.z = -Math.sin(swing) * 0.18;
        
        this._rightArm.position.x = 0.3;
        this._rightArm.position.y = 0.55;
        this._rightArm.position.z = Math.sin(swing) * 0.18;
        
        this._leftArm.rotation.set(Math.sin(swing) * 0.25, 0, 0);
        this._rightArm.rotation.set(-Math.sin(swing) * 0.25, 0, 0);
      }

      // Cute body tilt (waddle)
      this._body.rotation.z = Math.sin(this._bobPhase) * 0.08;
      this._head.rotation.z = Math.sin(this._bobPhase) * 0.04;
    } else if (this.state === 'fishing' || this.state === 'reeling') {
      if (this.state === 'reeling') {
        // Struggle lean-back pose with dynamic high-frequency tremble!
        const struggleTremble = Math.sin(Date.now() * 0.065) * 0.02;
        this._body.position.set(struggleTremble * 0.5, 0.48, -0.08);
        this._body.rotation.set(-Math.PI * 0.15, 0, struggleTremble * 0.3);
        this._head.position.set(struggleTremble * 0.5, 0.90, -0.04);
        this._head.rotation.set(Math.PI * 0.12, struggleTremble * 0.2, 0);

        // Braced legs offset
        this._leftLeg.position.set(-0.14, 0.12, 0.08);
        this._rightLeg.position.set(0.14, 0.12, 0.02);
        this._leftLeg.position.z = 0.08;
        this._rightLeg.position.z = 0.02;

        // Pull arms up and shake them!
        this._leftArm.position.set(-0.18, 0.63 + struggleTremble * 0.8, 0.12);
        this._rightArm.position.set(0.18, 0.63 + struggleTremble * 0.8, 0.12);
        this._leftArm.rotation.set(-Math.PI * 0.45, 0, 0.18 + struggleTremble * 0.5);
        this._rightArm.rotation.set(-Math.PI * 0.45, 0, -0.18 - struggleTremble * 0.5);
      } else {
        // Calm waiting pose with gentle breathing bob
        const breathe = Math.sin(Date.now() * 0.0035) * 0.015;
        this._body.position.set(0, 0.5 + breathe, 0);
        this._head.position.set(0, 0.95 + breathe * 1.5, 0);
        
        this._leftLeg.position.set(-0.14, 0.12, 0);
        this._rightLeg.position.set(0.14, 0.12, 0);
        this._leftLeg.position.z = 0;
        this._rightLeg.position.z = 0;

        this._leftArm.position.set(-0.18, 0.6 + breathe * 0.5, 0.2);
        this._rightArm.position.set(0.18, 0.6 + breathe * 0.5, 0.2);
        this._leftArm.rotation.set(-Math.PI * 0.2, 0, 0.1);
        this._rightArm.rotation.set(-Math.PI * 0.2, 0, -0.1);

        this._body.rotation.set(0, 0, 0);
        this._head.rotation.set(0, 0, 0);
      }
    } else {
      // Reset limbs to idle
      this._leftLeg.position.set(-0.14, 0.12, 0);
      this._rightLeg.position.set(0.14, 0.12, 0);
      this._leftLeg.position.z = 0;
      this._rightLeg.position.z = 0;

      if (this._heldFishGroup || this._caughtFishGroup) {
        this._leftArm.position.set(-0.18, 0.6, 0.2);
        this._rightArm.position.set(0.18, 0.6, 0.2);
        this._leftArm.rotation.set(-Math.PI * 0.2, 0, 0.1);
        this._rightArm.rotation.set(-Math.PI * 0.2, 0, -0.1);
      } else {
        this._leftArm.position.set(-0.3, 0.55, 0);
        this._rightArm.position.set(0.3, 0.55, 0);
        this._leftArm.rotation.set(0, 0, 0);
        this._rightArm.rotation.set(0, 0, 0);
      }

      this._body.rotation.z = 0;
      this._head.rotation.z = 0;
    }

    // Update rod animation and line positions if fishing, reeling, or throwing
    if (this._rodGroup && this.state !== 'charging_cast') {
      if (this._castThrowTimer > 0) {
        const t = 1 - (this._castThrowTimer / 0.35);
        
        // Whip arm throw rotation
        const armRot = THREE.MathUtils.lerp(Math.PI * 0.75, -Math.PI * 0.2, t);
        const armY = THREE.MathUtils.lerp(0.65, 0.6, t);
        this._leftArm.position.set(-0.18, armY, 0.2);
        this._rightArm.position.set(0.18, armY, 0.2);
        this._leftArm.rotation.set(armRot, 0, 0.1);
        this._rightArm.rotation.set(armRot, 0, -0.1);

        // Whip rod rotation
        this._rodGroup.rotation.x = THREE.MathUtils.lerp(-Math.PI * 0.25, Math.PI * 0.38, t);
        
        // Rod whip bending
        const bend = Math.sin(t * Math.PI) * 0.45;
        this._rodSeg1.rotation.x = bend * 0.5;
        this._rodSeg2.rotation.x = bend * 0.8;
        this._rodSeg3.rotation.x = bend;

        // Line and bobber visibility progression
        if (this._fishingLine) this._fishingLine.visible = t > 0.45;
        if (this._bobberGroup) this._bobberGroup.visible = t > 0.65;
      } else {
        // Restore visibility
        if (this._fishingLine) this._fishingLine.visible = true;
        if (this._bobberGroup) this._bobberGroup.visible = true;

        if (this.state === 'reeling') {
          const time = Date.now() * 0.065;
          const jitter = Math.sin(time) * 0.08;

          this._rodGroup.rotation.x = Math.PI * 0.12; // raised higher
          this._rodSeg1.rotation.x = 0.32 + jitter * 0.5;
          this._rodSeg2.rotation.x = 0.48 + jitter * 0.8;
          this._rodSeg3.rotation.x = 0.65 + jitter;
        } else {
          const sway = Math.sin(Date.now() * 0.0025) * 0.02;
          this._rodGroup.rotation.x = Math.PI * 0.38 + sway;
          this._rodSeg1.rotation.x = 0;
          this._rodSeg2.rotation.x = 0;
          this._rodSeg3.rotation.x = 0;
        }
      }

      this._updateLinePosition();
    }

    // Gentle bobber floating animation
    if (this._bobberGroup) {
      const time = Date.now() * 0.003;
      this._bobberGroup.position.y = WORLD.WATER_LEVEL + 0.05 + Math.sin(time) * 0.02;
      this._bobberGroup.rotation.z = Math.sin(time * 0.7) * 0.05;
      this._bobberGroup.rotation.x = Math.cos(time * 0.8) * 0.05;
      this._updateLinePosition();
    }
  }

  // ─── Fishing ─────────────────────────────────────────

  startFishing(spotPosition) {
    this.state = 'fishing';
    this.setHeldFish(null); // Clear held fish when starting to fish!
    // Face toward the fishing spot
    const dx = spotPosition.x - this.position.x;
    const dz = spotPosition.z - this.position.z;
    this._targetRotation = Math.atan2(dx, dz);
    this.rotation = this._targetRotation;
    this.group.rotation.y = this.rotation;

    // Build rod mesh
    this._buildFishingRodMesh(spotPosition);

    // Trigger the throw animation!
    this._castThrowTimer = 0.35;
  }

  stopFishing() {
    this.state = 'idle';
    this._destroyFishingRodMesh();
  }

  _buildFishingRodMesh(spotPosition) {
    this._destroyFishingRodMesh();

    this._fishingSpotPosition = spotPosition;

    // Rod group (will contain the segments)
    this._rodGroup = new THREE.Group();
    this._rodGroup.position.set(0.18, 0.55, 0.28);
    this._rodGroup.rotation.x = Math.PI * 0.38; // hold low by default

    const rodColor = 0x8b5a2b;
    const rodMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(rodColor),
      roughness: 0.8,
      metalness: 0.1
    });

    // Segment 1 (base)
    const seg1Geo = new THREE.CylinderGeometry(0.02, 0.03, 0.8, 6);
    seg1Geo.translate(0, 0.4, 0);
    this._rodSeg1 = new THREE.Mesh(seg1Geo, rodMat);
    this._rodGroup.add(this._rodSeg1);

    // Segment 2 (middle)
    const seg2Geo = new THREE.CylinderGeometry(0.012, 0.02, 0.8, 6);
    seg2Geo.translate(0, 0.4, 0);
    this._rodSeg2 = new THREE.Mesh(seg2Geo, rodMat);
    this._rodSeg2.position.set(0, 0.8, 0);
    this._rodSeg1.add(this._rodSeg2);

    // Segment 3 (tip)
    const seg3Geo = new THREE.CylinderGeometry(0.006, 0.012, 0.8, 6);
    seg3Geo.translate(0, 0.4, 0);
    this._rodSeg3 = new THREE.Mesh(seg3Geo, rodMat);
    this._rodSeg3.position.set(0, 0.8, 0);
    this._rodSeg2.add(this._rodSeg3);

    this.group.add(this._rodGroup);

    // Fishing line in scene
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6
    });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3()
    ]);
    this._fishingLine = new THREE.Line(lineGeo, lineMat);
    this.scene.add(this._fishingLine);

    // 3D Red and White Bobber
    this._bobberGroup = new THREE.Group();
    this._bobberGroup.position.copy(spotPosition);
    this._bobberGroup.position.y = WORLD.WATER_LEVEL + 0.05;

    // Top half (red)
    const bobberTopGeo = new THREE.SphereGeometry(0.08, 8, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const bobberTopMat = new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.4 });
    const bobberTop = new THREE.Mesh(bobberTopGeo, bobberTopMat);
    this._bobberGroup.add(bobberTop);

    // Bottom half (white)
    const bobberBottomGeo = new THREE.SphereGeometry(0.08, 8, 8, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5);
    const bobberBottomMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const bobberBottom = new THREE.Mesh(bobberBottomGeo, bobberBottomMat);
    this._bobberGroup.add(bobberBottom);

    this.scene.add(this._bobberGroup);

    // Setup throw timer default if not defined
    if (this._castThrowTimer === undefined) this._castThrowTimer = 0;
    
    // Hide line/bobber if in charging state
    if (this.state === 'charging_cast') {
      this._fishingLine.visible = false;
      this._bobberGroup.visible = false;
    }

    this._updateLinePosition();
  }

  _destroyFishingRodMesh() {
    if (this._rodGroup) {
      this.group.remove(this._rodGroup);
      this._rodGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this._rodGroup = null;
      this._rodSeg1 = null;
      this._rodSeg2 = null;
      this._rodSeg3 = null;
    }
    if (this._rodHand) {
      this.group.remove(this._rodHand);
      if (this._rodHand.geometry) this._rodHand.geometry.dispose();
      if (this._rodHand.material) this._rodHand.material.dispose();
      this._rodHand = null;
    }
    if (this._fishingLine) {
      this.scene.remove(this._fishingLine);
      if (this._fishingLine.geometry) this._fishingLine.geometry.dispose();
      if (this._fishingLine.material) this._fishingLine.material.dispose();
      this._fishingLine = null;
    }
    if (this._bobberGroup) {
      this.scene.remove(this._bobberGroup);
      this._bobberGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this._bobberGroup = null;
    }
  }

  _updateLinePosition() {
    if (!this._fishingLine || !this._rodSeg3 || !this._fishingSpotPosition) return;
    const tipWorldPos = new THREE.Vector3(0, 0.8, 0);
    this._rodSeg3.localToWorld(tipWorldPos);
    const bobberPos = this._bobberGroup ? this._bobberGroup.position : this._fishingSpotPosition;
    this._fishingLine.geometry.setFromPoints([tipWorldPos, bobberPos]);
    this._fishingLine.geometry.attributes.position.needsUpdate = true;
  }

  showCaughtFish(fishData) {
    this.hideCaughtFish();

    this._caughtFishGroup = new THREE.Group();

    const colorHex = getRarityColor(fishData.rarity);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness: 0.4,
      metalness: 0.1,
    });

    const bodyGeo = new THREE.SphereGeometry(0.18, 12, 8);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.scale.set(1.5, 0.8, 0.4);
    this._caughtFishGroup.add(body);

    const tailGeo = new THREE.ConeGeometry(0.08, 0.22, 3);
    const tail = new THREE.Mesh(tailGeo, mat);
    tail.position.set(-0.3, 0, 0);
    tail.rotation.z = Math.PI / 2;
    this._caughtFishGroup.add(tail);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eyeGeo = new THREE.SphereGeometry(0.025, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(0.18, 0.05, 0.08);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.18, 0.05, -0.08);
    this._caughtFishGroup.add(eyeL);
    this._caughtFishGroup.add(eyeR);

    this._caughtFishGroup.position.set(0, 0.6, 0.4);
    this._caughtFishGroup.rotation.set(0.2, 0.4, 0.1);

    this.group.add(this._caughtFishGroup);
  }

  hideCaughtFish() {
    if (this._caughtFishGroup) {
      this.group.remove(this._caughtFishGroup);
      this._caughtFishGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this._caughtFishGroup = null;
    }
  }

  setHeldFish(fishData) {
    this.heldFish = fishData;
    if (fishData) {
      this.showHeldFish(fishData);
    } else {
      this.hideHeldFish();
    }
  }

  showHeldFish(fishData) {
    this.hideHeldFish();
    this._heldFishGroup = new THREE.Group();

    const colorHex = getRarityColor(fishData.rarity);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(colorHex),
      roughness: 0.4,
      metalness: 0.1,
    });

    const bodyGeo = new THREE.SphereGeometry(0.18, 12, 8);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.scale.set(1.5, 0.8, 0.4);
    this._heldFishGroup.add(body);

    const tailGeo = new THREE.ConeGeometry(0.08, 0.22, 3);
    const tail = new THREE.Mesh(tailGeo, mat);
    tail.position.set(-0.3, 0, 0);
    tail.rotation.z = Math.PI / 2;
    this._heldFishGroup.add(tail);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const eyeGeo = new THREE.SphereGeometry(0.025, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(0.18, 0.05, 0.08);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.18, 0.05, -0.08);
    this._heldFishGroup.add(eyeL);
    this._heldFishGroup.add(eyeR);

    this._heldFishGroup.position.set(0, 0.58, 0.35);
    this._heldFishGroup.rotation.set(0.1, 0.3, 0.05);

    this.group.add(this._heldFishGroup);
  }

  hideHeldFish() {
    if (this._heldFishGroup) {
      this.group.remove(this._heldFishGroup);
      this._heldFishGroup.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      this._heldFishGroup = null;
    }
  }

  // ─── Accessors ───────────────────────────────────────

  getPosition() {
    return { x: this.position.x, y: this.position.y, z: this.position.z };
  }

  getRotation() {
    return this.rotation;
  }

  getState() {
    return this.state;
  }

  updateAppearance(appearance) {
    this.appearance = appearance || this.appearance;

    // Update body colors
    const color = new THREE.Color(this.appearance.bodyColor);
    if (this.bodyMat) this.bodyMat.color.copy(color);

    // Rebuild hat & accessory
    this._buildHat();
    this._buildAccessory();
  }

  playEmote(type) {
    this.emote = { type, timer: 2.2 };
    this._clearEmoteSprite();

    const emojis = { heart: '❤️', laugh: '😂', cry: '😭' };
    if (emojis[type]) {
      this._showFloatingEmoteSprite(emojis[type]);
    }
  }

  _showFloatingEmoteSprite(emoji) {
    this._clearEmoteSprite();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 128;
    canvas.height = 128;

    ctx.font = '72px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 64);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
    });
    
    this._emoteSprite = new THREE.Sprite(mat);
    this._emoteSprite.position.y = 2.0;
    this._emoteSprite.scale.set(0.9, 0.9, 1);
    this.group.add(this._emoteSprite);
  }

  _clearEmoteSprite() {
    if (this._emoteSprite) {
      this.group.remove(this._emoteSprite);
      this._emoteSprite.material.map?.dispose();
      this._emoteSprite.material.dispose();
      this._emoteSprite = null;
    }
  }

  isByWater(world) {
    if (world.isInWater(this.position.x, this.position.z) || !this.isGrounded) {
      return false;
    }
    const dx = Math.sin(this.rotation);
    const dz = Math.cos(this.rotation);
    for (let d = 1.5; d <= 5.0; d += 0.5) {
      const cx = this.position.x + dx * d;
      const cz = this.position.z + dz * d;
      if (world.isInWater(cx, cz)) {
        return true;
      }
    }
    return false;
  }
}
