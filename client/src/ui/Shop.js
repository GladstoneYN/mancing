/**
 * Shop — Modal overlay with Buy/Sell tabs.
 * Buy tab allows category selection (Rods, Bait, Tackle, Cosmetics) and purchase.
 * Sell tab allows selling fish and stackable items from the inventory.
 */
import { EVENTS } from '@shared/events.js';
import {
  RODS,
  TACKLES,
  BAITS,
  COSMETICS,
  getFishById,
  getRodById,
  getBaitById,
  getTackleById,
  getCosmeticById,
  RARITIES
} from '@shared/fishCatalog.js';

// Rarity color mapping matching Inventory
const RARITY_COLORS = {
  COMMON:    'var(--rarity-common)',
  UNCOMMON:  'var(--rarity-uncommon)',
  RARE:      'var(--rarity-rare)',
  EPIC:      'var(--rarity-epic)',
  LEGENDARY: 'var(--rarity-legendary)',
};

export class Shop {
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
    this._activeTab = 'buy'; // buy | sell
    this._activeCategory = 'rod'; // rod | bait | tackle | cosmetic (for buy tab)
    this._inventoryData = { fish: [], equipment: [], cosmetics: [] };
    this._selectedSellItem = null;
    this._buyQuantities = {}; // itemId -> number
    this._sellQuantities = {}; // slotKey -> number

    this._build();
  }

  // ─── DOM Construction ──────────────────────────────────
  _build() {
    // Overlay
    this.el = document.createElement('div');
    this.el.className = 'shop-overlay';
    this._on(this.el, 'click', (e) => {
      if (e.target === this.el) this.close();
    });

    // Panel
    this.panel = document.createElement('div');
    this.panel.className = 'shop-panel glass-elevated';
    this._on(this.panel, 'click', (e) => e.stopPropagation());

    // Header
    const header = document.createElement('div');
    header.className = 'shop-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'shop-header-left';

    const title = document.createElement('h2');
    title.className = 'shop-title';
    title.textContent = '🛒 Fish Shop';
    headerLeft.appendChild(title);

    // Coins Display
    this.coinsDisplay = document.createElement('div');
    this.coinsDisplay.className = 'shop-coins-display';
    this.coinsDisplay.innerHTML = `💰 <span class="shop-coins-val">${this.playerData?.coins || 0}</span>`;
    headerLeft.appendChild(this.coinsDisplay);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'inventory-close'; // Reuse style
    closeBtn.textContent = '×';
    closeBtn.title = 'Close (Esc)';
    this._on(closeBtn, 'click', () => this.close());

    header.appendChild(headerLeft);
    header.appendChild(closeBtn);
    this.panel.appendChild(header);

    // Top Tabs (Buy / Sell)
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'inventory-tabs'; // Reuse style

    this.buyTabBtn = document.createElement('button');
    this.buyTabBtn.className = 'inventory-tab active';
    this.buyTabBtn.textContent = '🛍️ Buy Upgrades';
    this._on(this.buyTabBtn, 'click', () => this._switchTab('buy'));

    this.sellTabBtn = document.createElement('button');
    this.sellTabBtn.className = 'inventory-tab';
    this.sellTabBtn.textContent = '💰 Sell Items';
    this._on(this.sellTabBtn, 'click', () => this._switchTab('sell'));

    tabsContainer.appendChild(this.buyTabBtn);
    tabsContainer.appendChild(this.sellTabBtn);
    this.panel.appendChild(tabsContainer);

    // Body
    this.bodyEl = document.createElement('div');
    this.bodyEl.className = 'shop-body';
    this.panel.appendChild(this.bodyEl);

    this.el.appendChild(this.panel);

    // Key handler
    this._keyHandler = (e) => {
      if (!this._open) return;
      if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  // ─── Tab Switching ─────────────────────────────────────
  _switchTab(tab) {
    this._activeTab = tab;
    this._selectedSellItem = null;
    this._buyQuantities = {};
    this._sellQuantities = {};

    this.buyTabBtn.classList.toggle('active', tab === 'buy');
    this.sellTabBtn.classList.toggle('active', tab === 'sell');

    this._renderBody();
  }

  // ─── Render Content ────────────────────────────────────
  _renderBody() {
    this.bodyEl.innerHTML = '';

    if (this._activeTab === 'buy') {
      this._renderBuyTab();
    } else {
      this._renderSellTab();
    }
  }

  _renderBuyTab() {
    this.bodyEl.innerHTML = '';
    // Left Sidebar for Categories
    const sidebar = document.createElement('div');
    sidebar.className = 'shop-sidebar';

    const categories = [
      { key: 'rod', label: '🎣 Rods' },
      { key: 'bait', label: '🪱 Bait' },
      { key: 'tackle', label: '⚙️ Tackles' },
      { key: 'cosmetic', label: '✨ Cosmetics' },
    ];

    for (const cat of categories) {
      const btn = document.createElement('button');
      btn.className = 'shop-sidebar-btn';
      if (cat.key === this._activeCategory) btn.classList.add('active');
      btn.textContent = cat.label;
      this._on(btn, 'click', () => {
        this._activeCategory = cat.key;
        this._renderBuyTab();
      });
      sidebar.appendChild(btn);
    }
    this.bodyEl.appendChild(sidebar);

    // Right Content viewport for products
    const catalogEl = document.createElement('div');
    catalogEl.className = 'shop-catalog';

    const items = this._getBuyItems();

    if (items.length === 0) {
      catalogEl.innerHTML = '<div style="text-align:center; padding: var(--sp-xl); color: var(--text-muted);">No upgrades available in this category.</div>';
    } else {
      for (const item of items) {
        const card = this._buildBuyCard(item);
        catalogEl.appendChild(card);
      }
    }

    this.bodyEl.appendChild(catalogEl);
  }

  _getBuyItems() {
    switch (this._activeCategory) {
      case 'rod':
        // Show all rods except bamboo (starter)
        return RODS.filter(r => r.id !== 'bamboo_rod');
      case 'bait':
        return BAITS;
      case 'tackle':
        return TACKLES;
      case 'cosmetic':
        return COSMETICS;
      default:
        return [];
    }
  }

  _buildBuyCard(item) {
    const card = document.createElement('div');
    card.className = 'shop-item-card';

    // Emoji/Icon
    const emojiWrapper = document.createElement('div');
    emojiWrapper.className = 'shop-item-emoji-wrapper';
    
    // Custom emojis for items
    let emoji = '📦';
    if (this._activeCategory === 'rod') emoji = '🎣';
    else if (this._activeCategory === 'bait') emoji = '🐛';
    else if (this._activeCategory === 'tackle') emoji = '⚙️';
    else if (this._activeCategory === 'cosmetic') emoji = '✨';

    emojiWrapper.textContent = item.emoji || emoji;
    card.appendChild(emojiWrapper);

    // Details (Name, Description)
    const details = document.createElement('div');
    details.className = 'shop-item-details';

    const name = document.createElement('div');
    name.className = 'shop-item-name';
    name.textContent = item.name;
    details.appendChild(name);

    const desc = document.createElement('div');
    desc.className = 'shop-item-desc';
    desc.textContent = item.description;
    details.appendChild(desc);

    card.appendChild(details);

    // Action Area (Price, quantity, buy button)
    const actionArea = document.createElement('div');
    actionArea.className = 'shop-item-action-area';

    const isStackable = this._activeCategory === 'bait' || this._activeCategory === 'tackle';
    const isAlreadyOwned = !isStackable && this._checkOwnership(item.id);

    // Initial Quantity
    if (!this._buyQuantities[item.id]) {
      this._buyQuantities[item.id] = 1;
    }

    // Price Display
    const priceDisplay = document.createElement('div');
    priceDisplay.className = 'shop-item-price';
    const updatePrice = () => {
      const qty = this._buyQuantities[item.id];
      priceDisplay.innerHTML = `💰 ${item.cost * qty}`;
    };
    updatePrice();
    actionArea.appendChild(priceDisplay);

    // Quantity spinner if stackable
    if (isStackable) {
      const qtyWrapper = document.createElement('div');
      qtyWrapper.className = 'shop-quantity-wrapper';

      const decBtn = document.createElement('button');
      decBtn.className = 'shop-quantity-btn';
      decBtn.textContent = '-';
      this._on(decBtn, 'click', () => {
        if (this._buyQuantities[item.id] > 1) {
          this._buyQuantities[item.id]--;
          qtyInput.value = this._buyQuantities[item.id];
          updatePrice();
          updateBuyBtnState();
        }
      });

      const qtyInput = document.createElement('input');
      qtyInput.type = 'text';
      qtyInput.className = 'shop-quantity-input';
      qtyInput.value = this._buyQuantities[item.id];
      this._on(qtyInput, 'input', (e) => {
        let val = parseInt(e.target.value) || 1;
        val = Math.max(1, Math.min(99, val));
        this._buyQuantities[item.id] = val;
        e.target.value = val;
        updatePrice();
        updateBuyBtnState();
      });

      const incBtn = document.createElement('button');
      incBtn.className = 'shop-quantity-btn';
      incBtn.textContent = '+';
      this._on(incBtn, 'click', () => {
        if (this._buyQuantities[item.id] < 99) {
          this._buyQuantities[item.id]++;
          qtyInput.value = this._buyQuantities[item.id];
          updatePrice();
          updateBuyBtnState();
        }
      });

      qtyWrapper.appendChild(decBtn);
      qtyWrapper.appendChild(qtyInput);
      qtyWrapper.appendChild(incBtn);
      actionArea.appendChild(qtyWrapper);
    }

    // Buy Button
    const buyBtn = document.createElement('button');
    buyBtn.className = 'btn btn-sm';
    buyBtn.textContent = '🛍️ Buy';

    const updateBuyBtnState = () => {
      if (isAlreadyOwned) {
        buyBtn.textContent = '✅ Owned';
        buyBtn.disabled = true;
        buyBtn.className = 'btn btn-sm btn-disabled';
      } else {
        const total = item.cost * this._buyQuantities[item.id];
        const hasEnough = (this.playerData?.coins || 0) >= total;
        if (!hasEnough) {
          buyBtn.textContent = 'No Coins';
          buyBtn.disabled = true;
          buyBtn.className = 'btn btn-sm btn-danger';
          buyBtn.style.opacity = '0.7';
        } else {
          buyBtn.textContent = '🛍️ Buy';
          buyBtn.disabled = false;
          buyBtn.className = 'btn btn-sm btn-primary';
          buyBtn.style.opacity = '1';
        }
      }
    };

    updateBuyBtnState();

    this._on(buyBtn, 'click', () => {
      const qty = this._buyQuantities[item.id];
      this.socket.emit(EVENTS.SHOP_BUY, {
        itemType: this._activeCategory,
        itemId: item.id,
        quantity: qty
      });
    });

    actionArea.appendChild(buyBtn);
    card.appendChild(actionArea);

    return card;
  }

  _checkOwnership(itemId) {
    if (this._activeCategory === 'rod') {
      const list = this._inventoryData.equipment || [];
      return list.some(e => e.id === itemId);
    } else if (this._activeCategory === 'cosmetic') {
      const list = this._inventoryData.cosmetics || [];
      return list.some(c => c.id === itemId);
    }
    return false;
  }

  // ─── Render Sell Tab ────────────────────────────────────
  _renderSellTab() {
    this.bodyEl.innerHTML = '';

    const sellable = this._getSellableItems();

    const sellContainer = document.createElement('div');
    sellContainer.className = 'shop-sell-container';
    sellContainer.style.cssText = 'display: flex; flex-direction: column; width: 100%; gap: 16px; padding: 4px;';

    // 1. Header with Bulk Action
    const headerRow = document.createElement('div');
    headerRow.className = 'shop-sell-header-row';
    headerRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.08);';

    const headerText = document.createElement('span');
    headerText.style.cssText = 'font-size: var(--text-xs); color: var(--text-muted);';
    headerText.textContent = 'Sell items individually or empty your fish bucket instantly:';
    headerRow.appendChild(headerText);

    const sellAllBtn = document.createElement('button');
    sellAllBtn.className = 'btn btn-sm btn-primary shop-sell-all-btn';
    sellAllBtn.style.cssText = 'background: linear-gradient(135deg, #d4af37, #aa7c11); border: none; font-weight: bold; box-shadow: 0 4px 10px rgba(212,175,55,0.2); transition: transform 0.1s ease;';
    sellAllBtn.textContent = '💰 Sell All Fish';

    const hasFish = sellable.some(item => item._type === 'fish');
    if (!hasFish) {
      sellAllBtn.disabled = true;
      sellAllBtn.style.opacity = '0.5';
      sellAllBtn.style.cursor = 'not-allowed';
    }

    this._on(sellAllBtn, 'click', () => {
      this.socket.emit(EVENTS.SHOP_SELL_ALL);
    });
    headerRow.appendChild(sellAllBtn);
    sellContainer.appendChild(headerRow);

    if (sellable.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'text-align: center; padding: var(--sp-xl); color: var(--text-muted); font-size: var(--text-sm);';
      empty.textContent = 'No sellable items in your inventory. Go catch some fish! 🎣';
      sellContainer.appendChild(empty);
      this.bodyEl.appendChild(sellContainer);
      return;
    }

    // 2. List viewport
    const listViewport = document.createElement('div');
    listViewport.className = 'shop-sell-list';
    listViewport.style.cssText = 'display: flex; flex-direction: column; gap: 10px; max-height: 380px; overflow-y: auto; padding-right: 4px;';

    for (const item of sellable) {
      const row = document.createElement('div');
      row.className = 'shop-sell-row glass-elevated';
      row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 10px; background: rgba(28, 38, 62, 0.45); border: 1px solid rgba(255,255,255,0.06); gap: 16px;';

      // Left details column
      const leftCol = document.createElement('div');
      leftCol.style.cssText = 'display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;';

      const emoji = document.createElement('span');
      emoji.style.cssText = 'font-size: 26px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));';
      emoji.textContent = item.emoji || '🐟';
      leftCol.appendChild(emoji);

      const textDetails = document.createElement('div');
      textDetails.style.cssText = 'display: flex; flex-direction: column; gap: 2px; min-width: 0;';

      const nameRow = document.createElement('div');
      nameRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';
      
      const name = document.createElement('span');
      name.style.cssText = 'font-weight: bold; font-size: var(--text-sm); color: var(--text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
      name.textContent = item.name;
      nameRow.appendChild(name);

      if (item.rarity && item._type === 'fish') {
        const tag = document.createElement('span');
        tag.className = `tag tag-${item.rarity.toLowerCase()}`;
        tag.style.cssText = 'font-size: 9px; padding: 1px 5px;';
        const rarityDef = RARITIES[item.rarity];
        tag.textContent = rarityDef ? rarityDef.name : item.rarity;
        nameRow.appendChild(tag);
      }
      textDetails.appendChild(nameRow);

      const statsRow = document.createElement('div');
      statsRow.style.cssText = 'font-size: var(--text-xs); color: var(--text-muted); display: flex; gap: 12px;';
      if (item.size) {
        const sizeSpan = document.createElement('span');
        sizeSpan.textContent = `📏 ${item.size}cm`;
        statsRow.appendChild(sizeSpan);
      }
      textDetails.appendChild(statsRow);
      leftCol.appendChild(textDetails);
      row.appendChild(leftCol);

      // Middle status column (Quantity / Price)
      const midCol = document.createElement('div');
      midCol.style.cssText = 'display: flex; flex-direction: column; align-items: flex-end; gap: 1px; min-width: 80px;';

      const qtySpan = document.createElement('span');
      qtySpan.style.cssText = 'font-size: var(--text-xs); font-weight: 500; color: #a0c8f0;';
      qtySpan.textContent = `x${item.count} owned`;
      midCol.appendChild(qtySpan);

      let unitValue = 0;
      if (item._type === 'fish') {
        unitValue = Math.max(1, Math.round(item.baseValue * 0.75));
      } else {
        unitValue = item.baseValue;
      }

      const valSpan = document.createElement('span');
      valSpan.style.cssText = 'font-size: var(--text-xs); color: #ffd89b;';
      valSpan.textContent = `💰 ${unitValue}`;
      midCol.appendChild(valSpan);
      row.appendChild(midCol);

      // Right action buttons column
      const rightCol = document.createElement('div');
      rightCol.style.cssText = 'display: flex; gap: 8px;';

      const sellOneBtn = document.createElement('button');
      sellOneBtn.className = 'btn btn-xs btn-danger';
      sellOneBtn.style.cssText = 'padding: 4px 10px; font-weight: bold; font-size: 11px;';
      sellOneBtn.textContent = 'Sell 1';
      this._on(sellOneBtn, 'click', () => {
        this.socket.emit(EVENTS.SHOP_SELL, {
          itemId: item.id,
          type: item._type,
          quantity: 1
        });
      });
      rightCol.appendChild(sellOneBtn);

      if (item.count > 1) {
        const sellAllStackBtn = document.createElement('button');
        sellAllStackBtn.className = 'btn btn-xs btn-danger';
        sellAllStackBtn.style.cssText = 'padding: 4px 10px; font-weight: bold; font-size: 11px; background: linear-gradient(135deg, #f44336, #d32f2f);';
        sellAllStackBtn.textContent = 'Sell All';
        this._on(sellAllStackBtn, 'click', () => {
          this.socket.emit(EVENTS.SHOP_SELL, {
            itemId: item.id,
            type: item._type,
            quantity: item.count
          });
        });
        rightCol.appendChild(sellAllStackBtn);
      }

      row.appendChild(rightCol);
      listViewport.appendChild(row);
    }
    sellContainer.appendChild(listViewport);

    this.bodyEl.appendChild(sellContainer);
  }

  _getSellableItems() {
    // Only fish, bait, and tackles are sellable
    const fish = (this._inventoryData.fish || []).map((f, i) => ({
      ...f,
      _slotKey: `fish-${i}`,
      _type: 'fish',
      emoji: getFishById(f.id)?.emoji || '🐟',
      rarity: getFishById(f.id)?.rarity || 'COMMON',
      name: getFishById(f.id)?.name || 'Unknown Fish',
      description: getFishById(f.id)?.description || '',
      baseValue: getFishById(f.id)?.baseValue || 10,
      count: f.quantity || 1
    }));

    const equipment = (this._inventoryData.equipment || []).filter(e => e.id !== 'bamboo_rod').map((e, i) => {
      const isBait = getBaitById(e.id);
      const isTackle = getTackleById(e.id);
      let catData = isBait || isTackle;
      
      return {
        ...e,
        _slotKey: `equip-${i}`,
        _type: isBait ? 'bait' : isTackle ? 'tackle' : 'equipment',
        emoji: catData?.emoji || (isBait ? '🐛' : '⚙️'),
        rarity: 'COMMON',
        name: catData?.name || e.id,
        description: catData?.description || '',
        baseValue: catData ? Math.round(catData.cost * 0.5) : 0,
        count: e.quantity || 1
      };
    }).filter(e => e._type === 'bait' || e._type === 'tackle'); // Filter out rods

    return [...fish, ...equipment];
  }

  // ─── Open / Close / Toggle ─────────────────────────────
  open() {
    if (this._open) return;
    this._open = true;
    this._selectedSellItem = null;
    this._buyQuantities = {};
    this._sellQuantities = {};
    this._renderBody();
    this.container.appendChild(this.el);
  }

  close() {
    if (!this._open) return;
    this._open = false;
    this._selectedSellItem = null;
    this.el.remove();
  }

  toggle() {
    if (this._open) {
      this.close();
    } else {
      this.open();
    }
  }

  isOpen() {
    return this._open;
  }

  // ─── Public Updates ────────────────────────────────────
  refresh(inventoryData) {
    if (inventoryData) {
      this._inventoryData = {
        fish: inventoryData.fish || this._inventoryData.fish || [],
        equipment: inventoryData.equipment || this._inventoryData.equipment || [],
        cosmetics: inventoryData.cosmetics || this._inventoryData.cosmetics || [],
      };
    }
    if (this._open) {
      this._renderBody();
    }
  }

  updateCoins(coins) {
    if (this.playerData) {
      this.playerData.coins = coins;
    }
    const valSpan = this.coinsDisplay?.querySelector('.shop-coins-val');
    if (valSpan) {
      valSpan.textContent = coins;
    }
    if (this._open) {
      // Re-evaluate button disabled states for buy items
      if (this._activeTab === 'buy') {
        this._renderBuyTab();
      }
    }
  }

  // ─── Helper Listener Cleanup ───────────────────────────
  _on(el, event, handler) {
    el.addEventListener(event, handler);
    this._listeners.push({ el, event, handler });
  }

  destroy() {
    document.removeEventListener('keydown', this._keyHandler);
    for (const { el, event, handler } of this._listeners) {
      el.removeEventListener(event, handler);
    }
    this._listeners = [];
    if (this.el.parentNode) this.el.remove();
  }
}
