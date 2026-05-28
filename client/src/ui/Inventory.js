/**
 * Inventory — Modal overlay with RPG character sheet (Avatar, slots) and tabbed grid (Fish) / list (Equipment, Cosmetics),
 * item detail panel, and Sell/Equip/Unequip actions via socket events.
 */
import * as THREE from 'three';
import { EVENTS } from '@shared/events.js';
import { getFishById, getRodById, getBaitById, getTackleById, getCosmeticById, RARITIES } from '@shared/fishCatalog.js';

const TABS = [
  { key: 'fish',       label: '🐟 Fish' },
  { key: 'equipment',  label: '🎣 Equipment' },
  { key: 'cosmetics',  label: '✨ Cosmetics' },
];

// Rarity color mapping for the small dot indicator
const RARITY_COLORS = {
  COMMON:    'var(--rarity-common)',
  UNCOMMON:  'var(--rarity-uncommon)',
  RARE:      'var(--rarity-rare)',
  EPIC:      'var(--rarity-epic)',
  LEGENDARY: 'var(--rarity-legendary)',
};

// Deduplicates inventory lists to merge identical item entries (e.g. duplicates from db rows)
function deduplicateItems(items) {
  const map = new Map();
  for (const item of items) {
    if (map.has(item.id)) {
      const existing = map.get(item.id);
      existing.quantity = (existing.quantity || 1) + (item.quantity || 1);
      existing.equipped = existing.equipped || item.equipped;
    } else {
      map.set(item.id, { ...item });
    }
  }
  return Array.from(map.values());
}

function getEquipmentStatsHtml(catalogItem, type) {
  const stats = [];
  if (type === 'rod') {
    if (catalogItem.barSizeMultiplier && catalogItem.barSizeMultiplier !== 1.0) {
      stats.push(`📏 Bar Size: +${Math.round((catalogItem.barSizeMultiplier - 1.0) * 100)}%`);
    }
    if (catalogItem.drainMultiplier && catalogItem.drainMultiplier !== 1.0) {
      stats.push(`💧 Drain: -${Math.round((1.0 - catalogItem.drainMultiplier) * 100)}%`);
    }
    if (catalogItem.castDistance && catalogItem.castDistance !== 1.0) {
      stats.push(`🎣 Cast: +${Math.round((catalogItem.castDistance - 1.0) * 100)}%`);
    }
    if (catalogItem.tackleSlots !== undefined) {
      stats.push(`⚙️ Slots: ${catalogItem.tackleSlots}`);
    }
  } else if (type === 'bait') {
    if (catalogItem.waitReduction && catalogItem.waitReduction !== 1.0) {
      stats.push(`⏱️ Wait Time: -${Math.round((1.0 - catalogItem.waitReduction) * 100)}%`);
    }
    if (catalogItem.rarityBoost && catalogItem.rarityBoost > 0) {
      stats.push(`✨ Rarity Boost: +${Math.round(catalogItem.rarityBoost * 100)}%`);
    }
  }
  return stats.join(' | ');
}

// ─── 3D Avatar Preview Helper ──────────────────────────────────────────
class AvatarPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    
    // Camera framing the chibi character closely
    this.camera = new THREE.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
    this.camera.position.set(0, 0.72, 1.8);
    this.camera.lookAt(0, 0.62, 0);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    
    const ambient = new THREE.AmbientLight(0xffffff, 0.95);
    this.scene.add(ambient);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.55);
    dirLight.position.set(1.5, 3.5, 2);
    this.scene.add(dirLight);

    this.characterGroup = new THREE.Group();
    this.scene.add(this.characterGroup);
    
    this._hatMeshes = [];
    this._accessoryMeshes = [];
    this.animationFrameId = null;
    this.isRunning = false;
  }
  
  init(appearance) {
    this.update(appearance);
    this.start();
  }
  
  update(appearance) {
    // Clear old meshes
    while (this.characterGroup.children.length > 0) {
      const child = this.characterGroup.children[0];
      this.characterGroup.remove(child);
      child.traverse((subchild) => {
        if (subchild.geometry) subchild.geometry.dispose();
        if (subchild.material) subchild.material.dispose();
      });
    }
    
    this._hatMeshes = [];
    this._accessoryMeshes = [];
    
    if (!appearance) return;
    
    const color = new THREE.Color(appearance.bodyColor || '#76d7c4');
    const bodyMat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.65,
      metalness: 0.05,
    });
    
    const sweaterMat = new THREE.MeshStandardMaterial({
      color: 0xf5f5e8,
      roughness: 0.8,
    });

    const buttonMat = new THREE.MeshStandardMaterial({
      color: 0x5c4033,
      roughness: 0.9,
    });
    
    // ─── Body (solid cream sweater capsule, matching Player.js) ───
    const bodyGeo = new THREE.CapsuleGeometry(0.22, 0.3, 8, 12);
    this._body = new THREE.Mesh(bodyGeo, sweaterMat);
    this._body.position.y = 0.5;
    this.characterGroup.add(this._body);

    // Front buttons on sweater
    const buttonGeo = new THREE.SphereGeometry(0.02, 6, 6);
    const button1 = new THREE.Mesh(buttonGeo, buttonMat);
    button1.position.set(0, 0.52, 0.22);
    this.characterGroup.add(button1);

    const button2 = new THREE.Mesh(buttonGeo, buttonMat);
    button2.position.set(0, 0.42, 0.22);
    this.characterGroup.add(button2);

    // Small V-neck cutout at the collar showing the skin/body color
    const neckCutoutGeo = new THREE.ConeGeometry(0.07, 0.1, 4);
    neckCutoutGeo.rotateX(Math.PI); // point down
    const neckCutout = new THREE.Mesh(neckCutoutGeo, bodyMat);
    neckCutout.position.set(0, 0.64, 0.18);
    this.characterGroup.add(neckCutout);
    
    // Left Arm Group
    this._leftArm = new THREE.Group();
    this._leftArm.position.set(-0.3, 0.55, 0);
    
    const sleeveGeo = new THREE.CylinderGeometry(0.07, 0.065, 0.18, 6);
    sleeveGeo.translate(0, -0.09, 0);
    const sleeveL = new THREE.Mesh(sleeveGeo, sweaterMat);
    this._leftArm.add(sleeveL);

    const handGeo = new THREE.SphereGeometry(0.06, 8, 8);
    this._leftHand = new THREE.Mesh(handGeo, bodyMat);
    this._leftHand.position.set(0, -0.21, 0);
    this._leftArm.add(this._leftHand);
    this.characterGroup.add(this._leftArm);

    // Right Arm Group
    this._rightArm = new THREE.Group();
    this._rightArm.position.set(0.3, 0.55, 0);
    
    const sleeveR = new THREE.Mesh(sleeveGeo, sweaterMat);
    this._rightArm.add(sleeveR);

    this._rightHand = new THREE.Mesh(handGeo, bodyMat);
    this._rightHand.position.set(0, -0.21, 0);
    this._rightArm.add(this._rightHand);
    this.characterGroup.add(this._rightArm);
    
    // Legs
    // Left Leg Group
    this._leftLeg = new THREE.Group();
    this._leftLeg.position.set(-0.14, 0.12, 0);

    const sockGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6);
    sockGeo.translate(0, -0.05, 0);
    const sockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const leftSock = new THREE.Mesh(sockGeo, sockMat);
    this._leftLeg.add(leftSock);

    const shoeGeo = new THREE.SphereGeometry(0.06, 8, 8);
    shoeGeo.scale(1, 0.7, 1.35);
    shoeGeo.translate(0, -0.11, 0.035);
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x4a2f13, roughness: 0.75 });
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    this._leftLeg.add(leftShoe);
    this.characterGroup.add(this._leftLeg);

    // Right Leg Group
    this._rightLeg = new THREE.Group();
    this._rightLeg.position.set(0.14, 0.12, 0);

    const rightSock = new THREE.Mesh(sockGeo, sockMat);
    this._rightLeg.add(rightSock);

    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    this._rightLeg.add(rightShoe);
    this.characterGroup.add(this._rightLeg);
    
    // Head & facial features
    this._buildHead(appearance, bodyMat);
    
    // Hat
    this._buildHat(appearance);
    
    // Accessory
    this._buildAccessory(appearance);
    
    this.render();
  }
  
  _buildHead(appearance, bodyMat) {
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      roughness: 0.5,
    });
    
    const headGeo = new THREE.SphereGeometry(0.28, 12, 10);
    this._head = new THREE.Mesh(headGeo, bodyMat);
    this._head.position.y = 0.95;
    this.characterGroup.add(this._head);

    // Ears (Cat Ears Geometry)
    const earGeo = new THREE.ConeGeometry(0.09, 0.18, 4);
    earGeo.rotateY(Math.PI * 0.25); // Rotate so flat face is front/outward
    earGeo.scale(1, 1, 0.7); // Flatten slightly along Z
    earGeo.translate(0, 0.09, 0); // Center pivot at base
    
    this._leftEar = new THREE.Mesh(earGeo, bodyMat);
    this.characterGroup.add(this._leftEar);

    this._rightEar = new THREE.Mesh(earGeo, bodyMat);
    this.characterGroup.add(this._rightEar);
    
    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.045, 6, 6);
    this._leftEye = new THREE.Mesh(eyeGeo, darkMat);
    this._leftEye.position.set(-0.09, 0.98, 0.23);
    this.characterGroup.add(this._leftEye);

    this._rightEye = new THREE.Mesh(eyeGeo, darkMat);
    this._rightEye.position.set(0.09, 0.98, 0.23);
    this.characterGroup.add(this._rightEye);
    
    // Highlights
    const highlightGeo = new THREE.SphereGeometry(0.013, 6, 6);
    const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    const highlightL = new THREE.Mesh(highlightGeo, highlightMat);
    highlightL.position.set(-0.075, 1.00, 0.255);
    this.characterGroup.add(highlightL);

    const highlightR = new THREE.Mesh(highlightGeo, highlightMat);
    highlightR.position.set(0.105, 1.00, 0.255);
    this.characterGroup.add(highlightR);
    
    // Blush
    const blushMat = new THREE.MeshStandardMaterial({ color: 0xffa0a0, roughness: 0.9 });
    const blushGeo = new THREE.SphereGeometry(0.035, 6, 6);
    blushGeo.scale(1, 0.5, 0.2);

    const leftBlush = new THREE.Mesh(blushGeo, blushMat);
    leftBlush.position.set(-0.15, 0.90, 0.24);
    leftBlush.rotation.set(0, -0.2, 0);
    this.characterGroup.add(leftBlush);

    const rightBlush = new THREE.Mesh(blushGeo, blushMat);
    rightBlush.position.set(0.15, 0.90, 0.24);
    rightBlush.rotation.set(0, 0.2, 0);
    this.characterGroup.add(rightBlush);

    // Mouth
    const mouthGeo = new THREE.SphereGeometry(0.025, 4, 4);
    const mouth = new THREE.Mesh(mouthGeo, darkMat);
    mouth.position.set(0, 0.87, 0.25);
    mouth.scale.set(1.5, 0.6, 0.6);
    this.characterGroup.add(mouth);
  }
  
  _buildHat(appearance) {
    const hatId = appearance.hat;
    if (!hatId || hatId === 'none') {
      this._updateEars(appearance);
      return;
    }
    
    const hatMat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    
    switch (hatId) {
      case 'beanie': {
        hatMat.color = new THREE.Color(0xe57373);
        const geo = new THREE.SphereGeometry(0.28, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
        const mesh = new THREE.Mesh(geo, hatMat);
        mesh.position.y = 1.15;
        this.characterGroup.add(mesh);
        this._hatMeshes.push(mesh);
        
        const pomGeo = new THREE.SphereGeometry(0.08, 6, 6);
        const pom = new THREE.Mesh(pomGeo, hatMat);
        pom.position.y = 1.33;
        this.characterGroup.add(pom);
        this._hatMeshes.push(pom);
        break;
      }
      case 'bucket_hat': {
        hatMat.color = new THREE.Color(0xf4a460);
        const brimGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.05, 14);
        const brim = new THREE.Mesh(brimGeo, hatMat);
        brim.position.y = 1.18;
        this.characterGroup.add(brim);
        this._hatMeshes.push(brim);
        
        const topGeo = new THREE.CylinderGeometry(0.25, 0.3, 0.2, 14);
        const top = new THREE.Mesh(topGeo, hatMat);
        top.position.y = 1.28;
        this.characterGroup.add(top);
        this._hatMeshes.push(top);
        break;
      }
      case 'cowboy_hat': {
        hatMat.color = new THREE.Color(0x8B6914);
        const brimGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.04, 14);
        const brim = new THREE.Mesh(brimGeo, hatMat);
        brim.position.y = 1.18;
        this.characterGroup.add(brim);
        this._hatMeshes.push(brim);
        
        const topGeo = new THREE.CylinderGeometry(0.19, 0.26, 0.23, 8);
        const top = new THREE.Mesh(topGeo, hatMat);
        top.position.y = 1.30;
        this.characterGroup.add(top);
        this._hatMeshes.push(top);
        break;
      }
      case 'witch_hat': {
        hatMat.color = new THREE.Color(0x2d1b4e);
        const brimGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14);
        const brim = new THREE.Mesh(brimGeo, hatMat);
        brim.position.y = 1.18;
        this.characterGroup.add(brim);
        this._hatMeshes.push(brim);
        
        const coneGeo = new THREE.ConeGeometry(0.2, 0.55, 8);
        const cone = new THREE.Mesh(coneGeo, hatMat);
        cone.position.y = 1.47;
        cone.rotation.z = 0.12;
        this.characterGroup.add(cone);
        this._hatMeshes.push(cone);
        break;
      }
      case 'crown': {
        hatMat.color = new THREE.Color(0xfbbf24);
        hatMat.metalness = 0.6;
        hatMat.roughness = 0.3;
        const geo = new THREE.CylinderGeometry(0.23, 0.26, 0.18, 5);
        const mesh = new THREE.Mesh(geo, hatMat);
        mesh.position.y = 1.23;
        this.characterGroup.add(mesh);
        this._hatMeshes.push(mesh);
        break;
      }
      case 'party_hat': {
        hatMat.color = new THREE.Color(0xe8a0bf);
        const geo = new THREE.ConeGeometry(0.18, 0.4, 8);
        const mesh = new THREE.Mesh(geo, hatMat);
        mesh.position.y = 1.33;
        this.characterGroup.add(mesh);
        this._hatMeshes.push(mesh);
        break;
      }
    }
    this._updateEars(appearance);
  }

  _updateEars(appearance) {
    if (!this._leftEar || !this._rightEar) return;

    const hatId = appearance.hat;
    const hasHat = hatId && hatId !== 'none';

    if (hasHat) {
      // Ears pushed down to the sides under the hat
      this._leftEar.position.set(-0.24, 1.01, -0.02);
      this._leftEar.rotation.set(0.1, 0.15, Math.PI * 0.53); // tilted down to sides (like 95 degrees)

      this._rightEar.position.set(0.24, 1.01, -0.02);
      this._rightEar.rotation.set(0.1, -0.15, -Math.PI * 0.53);
    } else {
      // Ears perked up at ~50 degrees (40 degrees from vertical = ~0.22 * PI)
      this._leftEar.position.set(-0.15, 1.16, -0.02);
      this._leftEar.rotation.set(0.15, 0.25, Math.PI * 0.22); // perked up 50 deg from horiz

      this._rightEar.position.set(0.15, 1.16, -0.02);
      this._rightEar.rotation.set(0.15, -0.25, -Math.PI * 0.22);
    }
  }
  
  _buildAccessory(appearance) {
    const accId = appearance.accessory;
    if (!accId || accId === 'none') return;
    
    switch (accId) {
      case 'round_glasses': {
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
        
        const glL = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.055, 12), frameMat);
        glL.position.set(-0.09, 0.98, 0.255);
        this.characterGroup.add(glL);
        this._accessoryMeshes.push(glL);

        const glR = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.055, 12), frameMat);
        glR.position.set(0.09, 0.98, 0.255);
        this.characterGroup.add(glR);
        this._accessoryMeshes.push(glR);

        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.015, 0.01), frameMat);
        bridge.position.set(0, 0.98, 0.254);
        this.characterGroup.add(bridge);
        this._accessoryMeshes.push(bridge);
        break;
      }
      case 'sunglasses': {
        const frameMat = new THREE.MeshStandardMaterial({ color: 0xfbcb24, roughness: 0.4, metalness: 0.8 });
        const shadesMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 });

        const lensL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.01), shadesMat);
        lensL.position.set(-0.09, 0.99, 0.255);
        this.characterGroup.add(lensL);
        this._accessoryMeshes.push(lensL);

        const lensR = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.01), shadesMat);
        lensR.position.set(0.09, 0.99, 0.255);
        this.characterGroup.add(lensR);
        this._accessoryMeshes.push(lensR);

        const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.015), frameMat);
        bridge.position.set(0, 1.01, 0.254);
        this.characterGroup.add(bridge);
        this._accessoryMeshes.push(bridge);
        break;
      }
      case 'scarf': {
        const scarfMat = new THREE.MeshStandardMaterial({ color: 0xd63031, roughness: 0.9 });
        
        const scarfWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.1, 8), scarfMat);
        scarfWrap.position.y = 0.8;
        this.characterGroup.add(scarfWrap);
        this._accessoryMeshes.push(scarfWrap);

        const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.22, 0.04), scarfMat);
        scarfTail.position.set(0.07, 0.71, 0.23);
        scarfTail.rotation.set(0.08, 0, -0.12);
        this.characterGroup.add(scarfTail);
        this._accessoryMeshes.push(scarfTail);
        break;
      }
      case 'backpack': {
        const packMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.8 });
        const strapMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1e, roughness: 0.9 });

        const pack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.35, 0.14), packMat);
        pack.position.set(0, 0.5, -0.26);
        this.characterGroup.add(pack);
        this._accessoryMeshes.push(pack);

        const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.08), packMat);
        pocket.position.set(0, 0.42, -0.34);
        this.characterGroup.add(pocket);
        this._accessoryMeshes.push(pocket);

        const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.15), strapMat);
        strapL.position.set(-0.15, 0.52, -0.13);
        this.characterGroup.add(strapL);
        this._accessoryMeshes.push(strapL);

        const strapR = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.15), strapMat);
        strapR.position.set(0.15, 0.52, -0.13);
        this.characterGroup.add(strapR);
        this._accessoryMeshes.push(strapR);
        break;
      }
    }
  }
  
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    const animate = () => {
      if (!this.isRunning) return;
      this.animationFrameId = requestAnimationFrame(animate);
      this.characterGroup.rotation.y += 0.012;
      this.render();
    };
    
    animate();
  }
  
  stop() {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }
  
  render() {
    this.renderer.render(this.scene, this.camera);
  }
  
  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width > 0 && height > 0) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height, false);
    }
  }
  
  destroy() {
    this.stop();
    this.renderer.dispose();
    while (this.characterGroup.children.length > 0) {
      const child = this.characterGroup.children[0];
      this.characterGroup.remove(child);
      child.traverse((subchild) => {
        if (subchild.geometry) subchild.geometry.dispose();
        if (subchild.material) subchild.material.dispose();
      });
    }
  }
}

// ─── Main Inventory Class ──────────────────────────────────────────────
export class Inventory {
  /**
   * @param {HTMLElement} container — #ui-container
   * @param {object} playerData
   * @param {object} socketManager — SocketManager instance
   */
  constructor(container, playerData, socketManager) {
    this.container = container;
    this.playerData = playerData;
    this.socket = socketManager;
    this._listeners = [];

    this._open = false;
    this._activeTab = 'fish';
    this._activeSlotFilter = null;
    this._selectedItem = null;
    this._inventoryData = { fish: [], equipment: [], cosmetics: [] };
    this._isNearShop = false;
    
    this.avatarPreview = null;

    this._build();
  }

  setNearShop(near) {
    this._isNearShop = near;
    if (this._open && this._selectedItem) {
      this._renderDetail(this._selectedItem);
    }
  }

  // ─── DOM Construction ──────────────────────────────────
  _build() {
    // Overlay (captures clicks to close)
    this.el = document.createElement('div');
    this.el.className = 'inventory-overlay';
    this._on(this.el, 'click', (e) => {
      if (e.target === this.el) this._close();
    });

    // Panel
    this.panel = document.createElement('div');
    this.panel.className = 'inventory-panel rpg-layout glass-elevated';
    this._on(this.panel, 'click', (e) => e.stopPropagation());

    // Header
    const header = document.createElement('div');
    header.className = 'inventory-header';

    const headerLeft = document.createElement('div');
    headerLeft.style.cssText = 'display: flex; align-items: center; gap: var(--sp-md);';

    const title = document.createElement('h2');
    title.className = 'inventory-title';
    title.textContent = '🎒 Inventory';
    headerLeft.appendChild(title);

    // Coins Display in Inventory (Windows safe using 💰)
    this.coinsDisplay = document.createElement('div');
    this.coinsDisplay.className = 'shop-coins-display';
    this.coinsDisplay.innerHTML = `💰 <span class="inventory-coins-val">${this.playerData?.coins || 0}</span>`;
    headerLeft.appendChild(this.coinsDisplay);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'inventory-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close (Esc)';
    this._on(closeBtn, 'click', () => this._close());

    header.appendChild(headerLeft);
    header.appendChild(closeBtn);
    this.panel.appendChild(header);

    // RPG Character Section (Top)
    const charSection = document.createElement('div');
    charSection.className = 'inventory-character-section';
    this.panel.appendChild(charSection);

    // Left Column (Equipment slots)
    this.leftSlotsEl = document.createElement('div');
    this.leftSlotsEl.className = 'inventory-slots-left';
    charSection.appendChild(this.leftSlotsEl);

    // Center Column (Avatar 3D canvas)
    const previewContainer = document.createElement('div');
    previewContainer.className = 'avatar-preview-container';
    
    this.previewCanvas = document.createElement('canvas');
    this.previewCanvas.id = 'avatar-preview-canvas';
    previewContainer.appendChild(this.previewCanvas);
    charSection.appendChild(previewContainer);

    // Right Column (Cosmetics slots)
    this.rightSlotsEl = document.createElement('div');
    this.rightSlotsEl.className = 'inventory-slots-right';
    charSection.appendChild(this.rightSlotsEl);

    // Bottom Section (Tabs, Filter description, Grid, Details)
    const bottomSection = document.createElement('div');
    bottomSection.className = 'inventory-bottom-section';
    this.panel.appendChild(bottomSection);

    // Active Filter Banner (shows active filter name and a "clear" button)
    this.filterBarEl = document.createElement('div');
    this.filterBarEl.className = 'inventory-filter-bar';
    this.filterBarEl.style.display = 'none';
    bottomSection.appendChild(this.filterBarEl);

    // Tabs
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'inventory-tabs';

    this.tabEls = {};
    for (const tab of TABS) {
      const tabBtn = document.createElement('button');
      tabBtn.className = 'inventory-tab';
      if (tab.key === this._activeTab) tabBtn.classList.add('active');
      tabBtn.textContent = tab.label;
      this._on(tabBtn, 'click', () => this._switchTab(tab.key));
      this.tabEls[tab.key] = tabBtn;
      tabsContainer.appendChild(tabBtn);
    }
    bottomSection.appendChild(tabsContainer);

    // Grid
    this.gridEl = document.createElement('div');
    this.gridEl.className = 'inventory-grid';
    bottomSection.appendChild(this.gridEl);

    // Detail panel
    this.detailEl = document.createElement('div');
    this.detailEl.className = 'inventory-detail';
    this.detailEl.style.display = 'none';
    bottomSection.appendChild(this.detailEl);

    this.el.appendChild(this.panel);

    // Global keydown handler
    this._keyHandler = (e) => {
      if (!this._open) return;
      if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        e.stopPropagation();
        this._close();
      }
    };
    document.addEventListener('keydown', this._keyHandler);

    // Window resize handler
    this._resizeHandler = () => {
      if (this._open && this.avatarPreview) {
        this.avatarPreview.resize();
      }
    };
    window.addEventListener('resize', this._resizeHandler);
  }

  // ─── Tab Switching ─────────────────────────────────────
  _switchTab(key) {
    this._activeTab = key;
    this._activeSlotFilter = null; // Reset slot filter
    this._selectedItem = null;
    this.filterBarEl.style.display = 'none';
    this._updateSlotHighlight();

    // Update tab button styles
    for (const [k, el] of Object.entries(this.tabEls)) {
      el.classList.toggle('active', k === key);
    }

    this._renderGrid();
    this._renderEquippedDashboard();
  }

  // ─── Slot Filter Select ────────────────────────────────
  _selectSlotFilter(slotType) {
    this._activeSlotFilter = slotType;
    
    // Switch active tab logically based on slot type
    if (slotType === 'rod' || slotType === 'bait' || slotType === 'tackle') {
      this._activeTab = 'equipment';
    } else if (slotType === 'hat' || slotType === 'accessory') {
      this._activeTab = 'cosmetics';
    }
    
    // Update tab button active styles
    for (const [k, el] of Object.entries(this.tabEls)) {
      el.classList.toggle('active', k === this._activeTab);
    }
    
    this._updateSlotHighlight();
    this._renderFilterBar();
    this._renderGrid();
  }

  _clearSlotFilter() {
    this._activeSlotFilter = null;
    this._updateSlotHighlight();
    this.filterBarEl.style.display = 'none';
    this._renderGrid();
  }

  _updateSlotHighlight() {
    const slots = this.panel.querySelectorAll('.rpg-slot');
    slots.forEach(slot => {
      const type = slot.getAttribute('data-type');
      if (this._activeSlotFilter === type) {
        slot.classList.add('selected');
      } else {
        slot.classList.remove('selected');
      }
    });
  }

  _renderFilterBar() {
    this.filterBarEl.innerHTML = '';
    this.filterBarEl.style.display = '';
    
    const text = document.createElement('span');
    text.className = 'inventory-filter-text';
    
    let filterName = '';
    switch (this._activeSlotFilter) {
      case 'rod': filterName = 'Rods'; break;
      case 'bait': filterName = 'Baits'; break;
      case 'tackle': filterName = 'Tackles'; break;
      case 'hat': filterName = 'Hats'; break;
      case 'accessory': filterName = 'Accessories'; break;
      default: filterName = 'Filtered';
    }
    text.textContent = `🔍 Filtering: ${filterName}`;
    this.filterBarEl.appendChild(text);
    
    const clearBtn = document.createElement('button');
    clearBtn.className = 'inventory-filter-clear';
    clearBtn.textContent = 'Show All';
    this._on(clearBtn, 'click', () => this._clearSlotFilter());
    this.filterBarEl.appendChild(clearBtn);
  }

  // ─── Grid/List Rendering ───────────────────────────────
  _renderGrid() {
    this.gridEl.innerHTML = '';

    const items = this._getTabItems();

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'grid-column: 1 / -1; text-align: center; padding: var(--sp-xl); color: var(--text-muted); font-size: var(--text-sm);';
      
      if (this._activeSlotFilter) {
        let name = this._activeSlotFilter;
        if (name === 'hat') name = 'hat cosmetic';
        if (name === 'accessory') name = 'accessory cosmetic';
        empty.textContent = `No owned items fit in the ${name} slot.`;
      } else {
        empty.textContent = this._activeTab === 'fish'
          ? 'No fish caught yet. Try casting your line! 🎣'
          : 'Nothing here yet.';
      }
      
      this.gridEl.appendChild(empty);
      return;
    }

    const isListView = this._activeTab === 'equipment' || this._activeTab === 'cosmetics' ||
                       this._activeSlotFilter === 'rod' || this._activeSlotFilter === 'bait' || 
                       this._activeSlotFilter === 'tackle' || this._activeSlotFilter === 'hat' || 
                       this._activeSlotFilter === 'accessory';
    
    if (isListView) {
      this.gridEl.classList.add('list-view');
      this.detailEl.style.display = 'none'; // Hide detail panel since rows have action buttons and details!
      
      for (const item of items) {
        const catalog = item.catalogData || {};
        const row = document.createElement('div');
        row.className = 'inventory-list-row glass-elevated';
        if (item.equipped) {
          row.classList.add('equipped-row');
        }

        // Icon
        const icon = document.createElement('div');
        icon.className = 'inventory-row-icon';
        icon.textContent = item.emoji || catalog.emoji || '📦';
        row.appendChild(icon);

        // Details
        const details = document.createElement('div');
        details.className = 'inventory-row-details';

        const nameBar = document.createElement('div');
        nameBar.className = 'inventory-row-name-bar';

        const name = document.createElement('span');
        name.className = 'inventory-row-name';
        name.textContent = item.name || catalog.name || 'Unknown';
        nameBar.appendChild(name);

        const qty = item.quantity || item.count || 1;
        if (qty > 1) {
          const count = document.createElement('span');
          count.className = 'inventory-row-count';
          count.textContent = `x${qty}`;
          nameBar.appendChild(count);
        }
        details.appendChild(nameBar);

        const desc = document.createElement('span');
        desc.className = 'inventory-row-desc';
        desc.textContent = item.description || catalog.description || '';
        details.appendChild(desc);

        // Stats
        const statsStr = getEquipmentStatsHtml(catalog, item._type);
        if (statsStr) {
          const stats = document.createElement('span');
          stats.className = 'inventory-row-stats';
          stats.textContent = statsStr;
          details.appendChild(stats);
        }

        row.appendChild(details);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'inventory-row-actions';

        // Sell Button (only rods, baits, tackles can be sold)
        if (item.id !== 'bamboo_rod' && item._type !== 'cosmetic') {
          const sellBtn = document.createElement('button');
          sellBtn.className = 'btn btn-xs btn-danger';
          sellBtn.textContent = '💰 Sell';
          if (!this._isNearShop) {
            sellBtn.disabled = true;
            sellBtn.style.opacity = '0.5';
          }
          this._on(sellBtn, 'click', (e) => {
            e.stopPropagation();
            this.socket.emit(EVENTS.SHOP_SELL, {
              itemId: item.id,
              type: item._type,
              slotIndex: item._slotKey,
            });
            this._selectedItem = null;
          });
          actions.appendChild(sellBtn);
        }

        // Equip/Unequip Button
        const equipBtn = document.createElement('button');
        equipBtn.className = 'btn btn-xs';
        
        let text = '⬆️ Equip';
        let targetId = item.id;
        const isCosmetic = item._type === 'cosmetic' || (item.catalogData && (item.catalogData.type === 'hat' || item.catalogData.type === 'accessory'));
        const itemTypeForEquip = isCosmetic ? 'cosmetic' : item._type;
        
        if (item.equipped) {
          if (itemTypeForEquip === 'bait' || itemTypeForEquip === 'tackle' || itemTypeForEquip === 'cosmetic') {
            text = '❌ Unequip';
            targetId = 'none';
            equipBtn.className += ' btn-danger';
          } else {
            text = '✅ Equipped';
            equipBtn.disabled = true;
            equipBtn.className += ' btn-secondary';
          }
        }
        
        equipBtn.textContent = text;
        this._on(equipBtn, 'click', (e) => {
          e.stopPropagation();
          this.socket.emit(EVENTS.INVENTORY_EQUIP, {
            itemId: targetId,
            type: itemTypeForEquip,
            cosmeticType: isCosmetic ? item.catalogData?.type : undefined
          });
        });
        actions.appendChild(equipBtn);

        row.appendChild(actions);
        this.gridEl.appendChild(row);
      }
      return;
    }

    // Grid View (default for fish)
    this.gridEl.classList.remove('list-view');
    if (this._selectedItem && this._selectedItem._type === 'fish') {
      this._renderDetail(this._selectedItem);
    } else {
      this.detailEl.style.display = 'none';
    }

    for (const item of items) {
      const slot = document.createElement('div');
      slot.className = 'inventory-slot';
      if (this._selectedItem?.id === item.id && this._selectedItem?._slotKey === item._slotKey) {
        slot.classList.add('selected');
      }

      // Emoji
      const emoji = document.createElement('span');
      emoji.className = 'inventory-slot-emoji';
      emoji.textContent = item.emoji || item.catalogData?.emoji || '📦';
      slot.appendChild(emoji);

      // Count badge (if > 1)
      if (item.quantity && item.quantity > 1) {
        const count = document.createElement('span');
        count.className = 'inventory-slot-count';
        count.textContent = `×${item.quantity}`;
        slot.appendChild(count);
      } else if (item.count && item.count > 1) {
        const count = document.createElement('span');
        count.className = 'inventory-slot-count';
        count.textContent = `×${item.count}`;
        slot.appendChild(count);
      }

      // Rarity dot
      const itemRarity = item.rarity || item.catalogData?.rarity;
      if (itemRarity) {
        const rarityDot = document.createElement('span');
        rarityDot.className = 'inventory-slot-rarity';
        rarityDot.style.backgroundColor = RARITY_COLORS[itemRarity] || RARITY_COLORS.COMMON;
        slot.appendChild(rarityDot);
      }

      // Equipped banner check
      if (item.equipped) {
        const eqBadge = document.createElement('span');
        eqBadge.style.cssText = 'position: absolute; top: 3px; left: 4px; font-size: 8px; background: var(--primary); color: #0d1222; font-weight: 800; padding: 1px 4px; border-radius: 3px; line-height: 1;';
        eqBadge.textContent = 'E';
        slot.appendChild(eqBadge);
      }

      this._on(slot, 'click', () => {
        this._selectedItem = item;
        this._renderGrid(); // Re-render to update selection highlight
        this._renderDetail(item);
      });

      this.gridEl.appendChild(slot);
    }
  }

  _getTabItems() {
    const data = this._inventoryData;
    
    // If a slot filter is active, filter inventory data specifically
    if (this._activeSlotFilter) {
      const filter = this._activeSlotFilter;
      
      if (filter === 'rod') {
        return (data.equipment || []).map((e, i) => {
          const rodDef = getRodById(e.id);
          if (!rodDef) return null;
          return {
            ...e,
            _slotKey: `equip-${i}`,
            _type: 'rod',
            catalogData: rodDef
          };
        }).filter(Boolean);
      }
      
      if (filter === 'bait') {
        return (data.equipment || []).map((e, i) => {
          const baitDef = getBaitById(e.id);
          if (!baitDef) return null;
          return {
            ...e,
            _slotKey: `equip-${i}`,
            _type: 'bait',
            catalogData: baitDef
          };
        }).filter(Boolean);
      }
      
      if (filter === 'tackle') {
        return (data.equipment || []).map((e, i) => {
          const tackleDef = getTackleById(e.id);
          if (!tackleDef) return null;
          return {
            ...e,
            _slotKey: `equip-${i}`,
            _type: 'tackle',
            catalogData: tackleDef
          };
        }).filter(Boolean);
      }
      
      if (filter === 'hat') {
        return (data.cosmetics || []).map((c, i) => {
          const cosDef = getCosmeticById(c.id);
          if (!cosDef || cosDef.type !== 'hat') return null;
          return {
            ...c,
            _slotKey: `cosmetic-${i}`,
            _type: 'cosmetic',
            catalogData: cosDef
          };
        }).filter(Boolean);
      }
      
      if (filter === 'accessory') {
        return (data.cosmetics || []).map((c, i) => {
          const cosDef = getCosmeticById(c.id);
          if (!cosDef || cosDef.type !== 'accessory') return null;
          return {
            ...c,
            _slotKey: `cosmetic-${i}`,
            _type: 'cosmetic',
            catalogData: cosDef
          };
        }).filter(Boolean);
      }
    }

    // Default tab-based views
    switch (this._activeTab) {
      case 'fish':
        return (data.fish || []).map((f, i) => ({
          ...f,
          _slotKey: `fish-${i}`,
          _type: 'fish',
          catalogData: getFishById(f.id),
        }));
      case 'equipment':
        return (data.equipment || []).map((e, i) => {
          const isRod = getRodById(e.id);
          const isBait = getBaitById(e.id);
          const isTackle = getTackleById(e.id);
          return {
            ...e,
            _slotKey: `equip-${i}`,
            _type: isRod ? 'rod' : isBait ? 'bait' : isTackle ? 'tackle' : 'equipment',
            catalogData: isRod || isBait || isTackle,
          };
        });
      case 'cosmetics':
        return (data.cosmetics || []).map((c, i) => ({
          ...c,
          _slotKey: `cosmetic-${i}`,
          _type: 'cosmetic',
          catalogData: getCosmeticById(c.id),
        }));
      default:
        return [];
    }
  }

  // ─── Detail Panel (Mainly for fish grid selection) ──────
  _renderDetail(item) {
    this.detailEl.style.display = '';
    this.detailEl.innerHTML = '';

    const catalog = item.catalogData || {};

    // Emoji
    const emojiEl = document.createElement('span');
    emojiEl.className = 'inventory-detail-emoji';
    emojiEl.textContent = item.emoji || catalog.emoji || '📦';
    this.detailEl.appendChild(emojiEl);

    // Info column
    const info = document.createElement('div');
    info.className = 'inventory-detail-info';

    // Name + rarity tag
    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display: flex; align-items: center; gap: 8px; flex-wrap: wrap;';

    const nameEl = document.createElement('span');
    nameEl.className = 'inventory-detail-name';
    nameEl.textContent = item.name || catalog.name || 'Unknown';
    nameRow.appendChild(nameEl);

    const itemRarity = item.rarity || catalog.rarity;
    if (itemRarity) {
      const tag = document.createElement('span');
      tag.className = `tag tag-${itemRarity.toLowerCase()}`;
      const rarityDef = RARITIES[itemRarity];
      tag.textContent = rarityDef ? rarityDef.name : itemRarity;
      nameRow.appendChild(tag);
    }

    info.appendChild(nameRow);

    // Description
    const desc = document.createElement('p');
    desc.className = 'inventory-detail-desc';
    desc.textContent = item.description || catalog.description || '';
    info.appendChild(desc);

    // Stats
    const stats = document.createElement('div');
    stats.className = 'inventory-detail-stats';

    if (item.size) {
      const size = document.createElement('span');
      size.textContent = `📏 ${item.size}cm`;
      stats.appendChild(size);
    }
    if (item.value || catalog.baseValue) {
      const val = document.createElement('span');
      val.textContent = `💰 ${item.value || catalog.baseValue}🪙`;
      stats.appendChild(val);
    }
    if (item.quantity && item.quantity > 0) {
      const cnt = document.createElement('span');
      cnt.textContent = `📦 ×${item.quantity}`;
      stats.appendChild(cnt);
    } else if (item.count && item.count > 0) {
      const cnt = document.createElement('span');
      cnt.textContent = `📦 ×${item.count}`;
      stats.appendChild(cnt);
    }

    info.appendChild(stats);

    // Action buttons (Sell only for fish, since Equipment/Cosmetics have list buttons)
    if (item._type === 'fish') {
      const actions = document.createElement('div');
      actions.className = 'inventory-detail-actions';

      const sellBtn = document.createElement('button');
      sellBtn.className = 'btn btn-sm btn-danger';
      sellBtn.textContent = '💰 Sell';
      
      if (!this._isNearShop) {
        sellBtn.disabled = true;
        sellBtn.title = 'You must be at the shop (house) to sell items.';
        sellBtn.style.opacity = '0.5';
      }
      
      this._on(sellBtn, 'click', () => {
        this.socket.emit(EVENTS.SHOP_SELL, {
          itemId: item.id,
          type: item._type,
          slotIndex: item._slotKey,
        });
        this._selectedItem = null;
        this._clearSlotFilter();
      });
      actions.appendChild(sellBtn);

      // Hold in Hands / Put Away
      const isHoldingThis = window.game?.player?.heldFish && window.game.player.heldFish.id === item.id;
      const holdBtn = document.createElement('button');
      holdBtn.className = isHoldingThis ? 'btn btn-sm btn-danger' : 'btn btn-sm btn-primary';
      holdBtn.textContent = isHoldingThis ? '❌ Put Away' : '⬆️ Hold in Hands';
      holdBtn.style.marginLeft = '8px';
      
      this._on(holdBtn, 'click', () => {
        if (window.game?.player) {
          if (isHoldingThis) {
            window.game.player.setHeldFish(null);
          } else {
            window.game.player.setHeldFish({ id: item.id, rarity: item.rarity || catalog.rarity });
          }
        }
        this._close();
      });
      actions.appendChild(holdBtn);

      info.appendChild(actions);
    }

    this.detailEl.appendChild(info);
  }

  // ─── Equipped Side Dashboard ──────────────────────────
  _renderEquippedDashboard() {
    this.leftSlotsEl.innerHTML = '';
    this.rightSlotsEl.innerHTML = '';

    const appearance = this.playerData.appearance || {};
    
    // Left Slots: Equipment
    const leftSlots = [
      {
        label: 'Rod',
        id: this.playerData.equippedRod || 'bamboo_rod',
        type: 'rod',
        getDef: getRodById,
        defaultEmoji: '🎣',
        defaultName: 'Bamboo Rod'
      },
      {
        label: 'Bait',
        id: this._inventoryData.equippedBait || 'none',
        type: 'bait',
        getDef: getBaitById,
        defaultEmoji: '🐛',
        defaultName: 'None'
      },
      {
        label: 'Tackle',
        id: (this._inventoryData.equippedTackles && this._inventoryData.equippedTackles.length > 0) 
            ? this._inventoryData.equippedTackles[0] 
            : 'none',
        type: 'tackle',
        getDef: getTackleById,
        defaultEmoji: '⚙️',
        defaultName: 'None'
      }
    ];

    // Right Slots: Vanity Cosmetics
    const rightSlots = [
      {
        label: 'Head',
        id: appearance.hat || 'none',
        type: 'hat',
        filterType: 'hat',
        getDef: getCosmeticById,
        defaultEmoji: '👒',
        defaultName: 'None'
      },
      {
        label: 'Accessory',
        id: appearance.accessory || 'none',
        type: 'accessory',
        filterType: 'accessory',
        getDef: getCosmeticById,
        defaultEmoji: '👓',
        defaultName: 'None'
      }
    ];

    leftSlots.forEach(slot => this._renderSlot(slot, this.leftSlotsEl));
    rightSlots.forEach(slot => this._renderSlot(slot, this.rightSlotsEl));
  }

  _renderSlot(slot, parent) {
    const slotEl = document.createElement('div');
    slotEl.className = 'rpg-slot';
    slotEl.setAttribute('data-type', slot.filterType || slot.type);
    if (slot.id === 'none') slotEl.classList.add('empty');
    if (this._activeSlotFilter === (slot.filterType || slot.type)) {
      slotEl.classList.add('selected');
    }

    const iconBox = document.createElement('div');
    iconBox.className = 'rpg-slot-icon-box';
    
    const def = slot.id !== 'none' ? slot.getDef(slot.id) : null;
    iconBox.textContent = def ? (def.emoji || slot.defaultEmoji) : slot.defaultEmoji;
    slotEl.appendChild(iconBox);

    const info = document.createElement('div');
    info.className = 'rpg-slot-info';

    const label = document.createElement('span');
    label.className = 'rpg-slot-label';
    label.textContent = slot.label;
    info.appendChild(label);

    const name = document.createElement('span');
    name.className = 'rpg-slot-name';
    
    if (slot.type === 'bait' && def && this._inventoryData) {
      // Find bait quantity owned alongside name
      const owned = (this._inventoryData.equipment || []).find(e => e.id === slot.id);
      const count = owned ? owned.quantity || 1 : 1;
      name.textContent = `${def.name} (x${count})`;
    } else {
      name.textContent = def ? def.name : slot.defaultName;
    }
    info.appendChild(name);

    slotEl.appendChild(info);

    this._on(slotEl, 'click', () => {
      this._selectSlotFilter(slot.filterType || slot.type);
    });

    parent.appendChild(slotEl);
  }

  // ─── Open / Close ──────────────────────────────────────
  _open_panel() {
    if (this._open) return;
    this._open = true;
    this._selectedItem = null;
    this._activeSlotFilter = null;
    this.filterBarEl.style.display = 'none';
    
    this.container.appendChild(this.el);

    this._renderGrid();
    this._renderEquippedDashboard();

    // Instantiate 3D preview scene
    if (this.previewCanvas) {
      this.avatarPreview = new AvatarPreview(this.previewCanvas);
      this.avatarPreview.init(this.playerData.appearance);
      
      // Let dimensions compute before resizing
      requestAnimationFrame(() => {
        if (this.avatarPreview) {
          this.avatarPreview.resize();
        }
      });
    }
  }

  _close() {
    if (!this._open) return;
    this._open = false;
    this._selectedItem = null;
    this._activeSlotFilter = null;
    
    if (this.avatarPreview) {
      this.avatarPreview.destroy();
      this.avatarPreview = null;
    }
    
    this.el.remove();
  }

  // ─── Helpers ───────────────────────────────────────────
  _on(el, event, handler) {
    el.addEventListener(event, handler);
    this._listeners.push({ el, event, handler });
  }

  // ─── Public API ────────────────────────────────────────
  /**
   * Update the coins display dynamically.
   * @param {number} coins
   */
  updateCoins(coins) {
    if (this.playerData) {
      this.playerData.coins = coins;
    }
    const valSpan = this.coinsDisplay?.querySelector('.inventory-coins-val');
    if (valSpan) {
      valSpan.textContent = coins;
    }
  }

  /** Toggle inventory open/closed. */
  toggle() {
    if (this._open) {
      this._close();
    } else {
      this._open_panel();
    }
  }

  /** @returns {boolean} Whether the inventory is currently visible. */
  isOpen() {
    return this._open;
  }

  /**
   * Refresh inventory data and re-render the current tab.
   * @param {{ fish?: Array, equipment?: Array, cosmetics?: Array }} inventoryData
   */
  refresh(inventoryData) {
    if (inventoryData) {
      this._inventoryData = {
        fish: inventoryData.fish || this._inventoryData.fish || [],
        equipment: deduplicateItems(inventoryData.equipment || this._inventoryData.equipment || []),
        cosmetics: deduplicateItems(inventoryData.cosmetics || this._inventoryData.cosmetics || []),
        equippedBait: inventoryData.equippedBait !== undefined ? inventoryData.equippedBait : (this._inventoryData.equippedBait || 'none'),
        equippedTackles: inventoryData.equippedTackles !== undefined ? inventoryData.equippedTackles : (this._inventoryData.equippedTackles || []),
      };
    }
    
    if (this._open) {
      this._renderGrid();
      
      // Update coins display in inventory
      const valSpan = this.coinsDisplay?.querySelector('.inventory-coins-val');
      if (valSpan && this.playerData) {
        valSpan.textContent = this.playerData.coins || 0;
      }

      // Update avatar preview scene real-time
      if (this.avatarPreview && this.playerData.appearance) {
        this.avatarPreview.update(this.playerData.appearance);
      }

      this._renderEquippedDashboard();
    }
  }

  destroy() {
    document.removeEventListener('keydown', this._keyHandler);
    window.removeEventListener('resize', this._resizeHandler);
    for (const { el, event, handler } of this._listeners) {
      el.removeEventListener(event, handler);
    }
    this._listeners = [];
    if (this.avatarPreview) {
      this.avatarPreview.destroy();
      this.avatarPreview = null;
    }
    if (this.el.parentNode) this.el.remove();
  }
}
