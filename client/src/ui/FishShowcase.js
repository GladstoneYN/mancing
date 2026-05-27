/**
 * FishShowcase — Procedural 3D speech bubble sprites for other players to see catching info.
 */
import * as THREE from 'three';
import { getRarityColor } from '@/fishing/FishData.js';

export class FishShowcase {
  /**
   * Generates a 3D Sprite showing off the caught fish details.
   * @param {object} fish — { name, emoji, rarity }
   * @param {number} size — size in cm
   * @returns {THREE.Sprite}
   */
  static createShowcaseSprite(fish, size) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 256;

    const rarityColor = getRarityColor(fish.rarity) || '#b8b8b8';

    // 1. Draw bubble background shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;

    // 2. Draw bubble body
    ctx.fillStyle = 'rgba(28, 38, 62, 0.95)';
    ctx.beginPath();
    ctx.roundRect(20, 20, canvas.width - 40, canvas.height - 75, 24);
    ctx.fill();

    // Reset shadow for border/text
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Border
    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 3. Draw bubble pointer tail
    ctx.fillStyle = 'rgba(28, 38, 62, 0.95)';
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 18, canvas.height - 55);
    ctx.lineTo(canvas.width / 2, canvas.height - 25);
    ctx.lineTo(canvas.width / 2 + 18, canvas.height - 55);
    ctx.closePath();
    ctx.fill();

    // Border on tail
    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(canvas.width / 2 - 18, canvas.height - 55);
    ctx.lineTo(canvas.width / 2, canvas.height - 25);
    ctx.lineTo(canvas.width / 2 + 18, canvas.height - 55);
    ctx.stroke();

    // Clean overlap
    ctx.fillStyle = 'rgba(28, 38, 62, 0.95)';
    ctx.beginPath();
    ctx.arc(canvas.width / 2 - 18, canvas.height - 56, 2, 0, Math.PI * 2);
    ctx.arc(canvas.width / 2 + 18, canvas.height - 56, 2, 0, Math.PI * 2);
    ctx.fill();

    // 4. Render details
    // Subtitle (Rarity catch)
    ctx.font = 'bold 18px Outfit, sans-serif';
    ctx.fillStyle = rarityColor;
    ctx.textAlign = 'center';
    ctx.letterSpacing = '1px';
    ctx.fillText(`${fish.rarity} CATCH!`, canvas.width / 2, 60);

    // Emoji + Name
    ctx.font = 'bold 38px Outfit, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${fish.emoji} ${fish.name}`, canvas.width / 2, 110);

    // Size
    ctx.font = '600 24px Outfit, sans-serif';
    ctx.fillStyle = '#a0aec0';
    ctx.fillText(`${size.toFixed(1)} cm`, canvas.width / 2, 155);

    // 5. Create Sprite
    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(3.8, 1.9, 1);
    return sprite;
  }
}
