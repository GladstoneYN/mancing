/**
 * Constants — client-side configuration values.
 */

// Server URL — uses Vite env var in production, localhost in dev
export const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

// ─── World ─────────────────────────────────────────────────
export const WORLD = {
  // Terrain
  TERRAIN_SIZE: 300,          // width/depth of terrain plane
  TERRAIN_SEGMENTS: 200,      // vertex resolution
  WATER_LEVEL: -0.3,          // Y position of water plane

  // Boundaries
  BOUNDS_MIN_X: -28,
  BOUNDS_MAX_X: 28,
  BOUNDS_MIN_Z: -28,
  BOUNDS_MAX_Z: 28,

  // Spawn
  SPAWN_X: 0,
  SPAWN_Y: 0,
  SPAWN_Z: 8,
};

// ─── Player ────────────────────────────────────────────────
export const PLAYER = {
  MOVE_SPEED: 6,              // units per second
  ROTATION_SPEED: 8,          // lerp factor for turning
  HEIGHT: 1.8,                // total player height
  BODY_RADIUS: 0.35,         // collision radius
  BOB_SPEED: 8,               // walk bob frequency
  BOB_AMOUNT: 0.08,           // walk bob amplitude
  JUMP_FORCE: 7.5,
  GRAVITY: 22,
  SPRINT_MULTIPLIER: 1.6,
};

// ─── Camera ────────────────────────────────────────────────
export const CAMERA = {
  FOV: 55,
  NEAR: 0.1,
  FAR: 200,
  DISTANCE: 10,              // distance behind player
  HEIGHT: 5,                  // height above player
  LERP_SPEED: 4,             // follow smoothness
  MIN_DISTANCE: 5,
  MAX_DISTANCE: 20,
  MIN_POLAR: 0.3,            // radians — min vertical angle
  MAX_POLAR: 1.3,            // radians — max vertical angle
  MOUSE_SENSITIVITY: 0.003,
  ZOOM_SPEED: 1.5,
};

// ─── Networking ────────────────────────────────────────────
export const NET = {
  POSITION_SEND_RATE: 100,    // ms between position updates (10Hz)
  INTERPOLATION_DELAY: 100,   // ms buffer for smooth interpolation
};

// ─── Fishing ───────────────────────────────────────────────
export const FISHING = {
  INTERACT_DISTANCE: 3.5,     // max distance from fishing spot to interact
  WAIT_TIME_MIN: 2000,        // min ms before fish bites
  WAIT_TIME_MAX: 8000,        // max ms before fish bites
  HOOK_WINDOW: 2000,          // ms to press E after bite alert

  // Mini-game physics
  BAR_HEIGHT: 400,            // px — total height of fishing bar
  BASE_ZONE_HEIGHT: 100,      // px — base green zone height (before rod multiplier)
  GRAVITY: 600,               // px/s² — downward pull on green zone
  THRUST: 900,                // px/s² — upward force when holding space
  MAX_VELOCITY: 500,          // px/s — terminal velocity
  BOUNCE_FACTOR: 0.35,        // velocity retained on bottom bounce
  PROGRESS_FILL_RATE: 0.4,    // % per second when fish is in zone
  PROGRESS_DRAIN_RATE: 0.25,  // % per second when fish is outside zone
};
