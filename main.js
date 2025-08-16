// main.js — 2048 (JS puro, accesible y con persistencia)

(() => {
  // ----- DOM -----
  const tileContainer = document.getElementById('tile-container');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const newGameBtn = document.getElementById('new-game-btn');
  const undoBtn = document.getElementById('undo-btn');
  const overlay = document.getElementById('overlay');
  const overlayMsg = document.getElementById('overlay-message');
  const overlayRestart = document.getElementById('overlay-restart');

  // ----- Estado -----
  const SIZE = 4;
  const STORAGE_KEY = '2048:state';
  const STORAGE_BEST = '2048:best';

  let state = createInitialState();
  let prevState = null; // para undo (un paso)

  function createInitialState() {
    return {
      size: SIZE,
      grid: makeEmptyGrid(SIZE),
      score: 0,
      best: Number(localStorage.getItem(STORAGE_BEST) || 0),
      won: false,
      over: false,
      moved: false,
    };
  }

  function makeEmptyGrid(n) {
    return Array.from({ length: n }, () => Array(n).fill(0));
  }

  // ----- Persistencia -----
  function saveState() {
    try {
      const toSave = {
        grid: state.grid,
        score: state.score,
        best: state.best,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
      localStorage.setItem(STORAGE_BEST, String(state.best));
    } catch {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (!data || !data.grid) return false;
      state.grid = data.grid;
      state.score = data.score || 0;
      state.best = Number(localStorage.getItem(STORAGE_BEST) || data.best || 0);
      return true;
    } catch {
      return false;
    }
  }

  // ----- Inicialización -----
  function startNewGame() {
    prevState = null;
    state = createInitialState();
    spawnRandomTile();
    spawnRandomTile();
    update();
  }

  function restoreOrStart() {
    if (!loadState()) startNewGame();
    else update(); // si había una partida guardada
  }

  // ----- Utilidades -----
  function getEmptyCells(grid = state.grid) {
    const cells = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] === 0) cells.push([r, c]);
      }
    }
    return cells;
  }

  function spawnRandomTile() {
    const empties = getEmptyCells();
    if (empties.length === 0) return false;
    const [r, c] = empties[Math.floor(Math.random() * empties.length)];
    // 90% un 2, 10% un 4
    state.grid[r][c] = Math.random() < 0.9 ? 2 : 4;
    return true;
  }

  function cloneGrid(g) {
    return g.map(row => row.slice());
  }

  function gridsEqual(a, b) {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) if (a[r][c] !== b[r][c]) return false;
    }
    return true;
  }

  // ----- Movimiento -----
  // Normalizamos todo el movimiento a "izquierda".
  // Para las otras direcciones, rotamos o espejamos y reutilizamos la misma lógica.
  function move(direction) {
    if (state.over || state.won) return;

    // Guardamos estado para UNDO
    prevState = {
      grid: cloneGrid(state.grid),
      score: state.score,
      best: state.best,
      won: state.won,
      over: state.over,
    };

    let grid = cloneGrid(state.grid);

    if (direction === 'up') grid = rotateLeft(grid);
    if (direction === 'down') grid = rotateRight(grid);
    if (direction === 'right') grid = mirror(grid);

    const { newGrid, scoreGained, moved } = moveLeftMerge(grid);

    let resultGrid = newGrid;
    if (direction === 'up') resultGrid = rotateRight(newGrid);
    if (direction === 'down') resultGrid = rotateLeft(newGrid);
    if (direction === 'right') resultGrid = mirror(newGrid);

    if (!moved) {
      state.moved = false;
      // No hubo cambios: no spawneamos ni actualizamos score
      return;
    }

    state.grid = resultGrid;
    state.score += scoreGained;
    if (state.score > state.best) state.best = state.score;

    // Spawn de nueva ficha
    spawnRandomTile();

    // Chequear estado de juego
    state.won = state.won || has2048(state.grid);
    state.over = isGameOver(state.grid);

    state.moved = true;

    update();
  }

  // Empuja/merge a la izquierda
  function moveLeftMerge(grid) {
    let moved = false;
    let scoreGained = 0;
    const out = grid.map(row => row.slice());

    for (let r = 0; r < SIZE; r++) {
      const row = out[r].slice();

      // 1) comprimir (quitar ceros)
      const compressed = row.filter(v => v !== 0);

      // 2) fusionar adyacentes iguales (una vez)
      const merged = [];
      for (let i = 0; i < compressed.length; i++) {
        if (i < compressed.length - 1 && compressed[i] === compressed[i + 1]) {
          const val = compressed[i] * 2;
          merged.push(val);
          scoreGained += val;
          i++; // saltar el siguiente (fusionado)
        } else {
          merged.push(compressed[i]);
        }
      }

      // 3) rellenar con ceros a la derecha
      while (merged.length < SIZE) merged.push(0);

      // ¿cambió la fila?
      if (!arraysEqual(row, merged)) moved = true;
      out[r] = merged;
    }

    return { newGrid: out, scoreGained, moved };
  }

  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // Transformaciones
  function mirror(g) {
    return g.map(row => row.slice().reverse());
  }
  function rotateLeft(g) {
    const n = g.length;
    const res = makeEmptyGrid(n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) res[n - c - 1][r] = g[r][c];
    return res;
  }
  function rotateRight(g) {
    const n = g.length;
    const res = makeEmptyGrid(n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) res[c][n - r - 1] = g[r][c];
    return res;
  }

  // Comprobaciones
  function has2048(g) {
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (g[r][c] === 2048) return true;
    return false;
  }

  function isGameOver(g) {
    // Si hay huecos, no ha terminado
    if (getEmptyCells(g).length > 0) return false;
    // Si cualquier movimiento cambia algo, no ha terminado
    const dirs = ['left', 'right', 'up', 'down'];
    for (const d of dirs) {
      let temp = cloneGrid(g);
      if (d === 'up') temp = rotateLeft(temp);
      if (d === 'down') temp = rotateRight(temp);
      if (d === 'right') temp = mirror(temp);
      const { moved } = moveLeftMerge(temp);
      if (moved) return false;
    }
    return true;
  }

  // ----- Render -----
  function update() {
    renderGrid();
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(state.best);
    undoBtn.disabled = !prevState;
    // Overlay
    if (state.won) showOverlay('🎉 ¡Has llegado a 2048!');
    else if (state.over) showOverlay('💥 ¡Game Over!');
    else hideOverlay();
    saveState();
  }

  function renderGrid() {
    // Limpia contenedor
    tileContainer.innerHTML = '';
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = state.grid[r][c];
        if (v === 0) continue;
        const tile = document.createElement('div');
        tile.className = `tile tile--${v} ${wasMergedLastMove(r, c) ? 'tile--merged' : ''}`;
        tile.style.gridColumn = String(c + 1);
        tile.style.gridRow = String(r + 1);
        tile.textContent = v;
        tile.setAttribute('role', 'gridcell');
        tile.setAttribute('aria-label', String(v));
        tileContainer.appendChild(tile);
      }
    }
  }

  // Marca de fusión (opcional simple):
  // Para animaciones básicas, marcaremos como "merged" los valores pares > 2 que
  // acaban de aparecer por fusión. Aquí simplificamos: si el valor no existía
  // en la misma celda del prevState, lo consideramos "nuevo/merge".
  function wasMergedLastMove(r, c) {
    if (!prevState) return false;
    const before = prevState.grid?.[r]?.[c] || 0;
    const after = state.grid?.[r]?.[c] || 0;
    return after > 2 && before !== after;
  }

  // ----- Overlay -----
  function showOverlay(msg) {
    overlayMsg.textContent = msg;
    overlay.hidden = false;
  }
  function hideOverlay() {
    overlay.hidden = true;
  }

  // ----- Inputs (teclado) -----
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); move('left'); }
    if (e.key === 'ArrowRight') { e.preventDefault(); move('right'); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); move('up'); }
    if (e.key === 'ArrowDown')  { e.preventDefault(); move('down'); }
    if (e.key.toLowerCase() === 'r') { e.preventDefault(); startNewGame(); }
    if (e.key.toLowerCase() === 'u') { e.preventDefault(); undo(); }
  });

  // ----- Inputs (gestos táctiles básicos) -----
  (() => {
    let startX = 0, startY = 0, tracking = false;

    tileContainer.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      tracking = true;
    }, { passive: true });

    tileContainer.addEventListener('touchmove', (e) => {
      // evitar el scroll dentro del tablero
      if (tracking) e.preventDefault();
    }, { passive: false });

    tileContainer.addEventListener('touchend', (e) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const absX = Math.abs(dx), absY = Math.abs(dy);
      const threshold = 24; // px mínimos

      if (absX < threshold && absY < threshold) return;

      if (absX > absY) {
        move(dx > 0 ? 'right' : 'left');
      } else {
        move(dy > 0 ? 'down' : 'up');
      }
    }, { passive: false });
  })();

  // ----- Botones -----
  newGameBtn.addEventListener('click', startNewGame);
  overlayRestart.addEventListener('click', startNewGame);
  undoBtn.addEventListener('click', undo);

  function undo() {
    if (!prevState) return;
    // Restauramos
    state.grid = cloneGrid(prevState.grid);
    state.score = prevState.score;
    state.best = prevState.best;
    state.won = prevState.won;
    state.over = prevState.over;
    // Solo permitimos 1 undo: al usarlo, se borra
    prevState = null;
    update();
  }

  // ----- Arranque -----
  restoreOrStart();

})();