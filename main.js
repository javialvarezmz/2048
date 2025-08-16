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

  // Contenedor de celdas fijas para calcular posiciones
  const gridBg = document.querySelector('#game-container .grid');
  const gridCells = Array.from(gridBg.querySelectorAll('.cell'));

  // ----- Estado -----
  const SIZE = 4;
  const STORAGE_KEY = '2048:state';
  const STORAGE_BEST = '2048:best';

  let state = createInitialState();
  let prevState = null; // para undo (un paso)

  // Animación: bloqueo de input mientras desliza
  let isAnimating = false;
  const SLIDE_MS = 140; // duración del deslizamiento en ms

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
    if (navigator.vibrate) try { navigator.vibrate(6); } catch {}
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
    if (state.over || state.won || isAnimating) return;

    // Guardamos estado para UNDO
    prevState = {
      grid: cloneGrid(state.grid),
      score: state.score,
      best: state.best,
      won: state.won,
      over: state.over,
    };

    // Orientamos la grilla según dirección (normalizamos a izquierda)
    let oriented = cloneGrid(state.grid);
    if (direction === 'up') oriented = rotateLeft(oriented);
    if (direction === 'down') oriented = rotateRight(oriented);
    if (direction === 'right') oriented = mirror(oriented);

    const { newGrid, scoreGained, moved, moves } = moveLeftMergeWithMoves(oriented);

    // Volvemos a des-orientar
    let resultGrid = newGrid;
    let backMoves = moves.map(m => ({ from: m.from.slice(), from2: m.from2 ? m.from2.slice() : null, to: m.to.slice(), value: m.value, merged: m.merged }));

    if (direction === 'up') {
      resultGrid = rotateRight(newGrid);
      backMoves = backMoves.map(m => ({
        from: rotRight(m.from),
        from2: m.from2 ? rotRight(m.from2) : null,
        to: rotRight(m.to),
        value: m.value,
        merged: m.merged,
      }));
    }
    if (direction === 'down') {
      resultGrid = rotateLeft(newGrid);
      backMoves = backMoves.map(m => ({
        from: rotLeft(m.from),
        from2: m.from2 ? rotLeft(m.from2) : null,
        to: rotLeft(m.to),
        value: m.value,
        merged: m.merged,
      }));
    }
    if (direction === 'right') {
      resultGrid = mirror(newGrid);
      backMoves = backMoves.map(m => ({
        from: mir(m.from),
        from2: m.from2 ? mir(m.from2) : null,
        to: mir(m.to),
        value: m.value,
        merged: m.merged,
      }));
    }

    if (!moved) {
      state.moved = false;
      return;
    }

    state.grid = resultGrid;
    state.score += scoreGained;
    if (state.score > state.best) state.best = state.score;

    // Spawn tras movimiento (en el estado ya actualizado)
    spawnRandomTile();

    // Flags de juego
    state.won = state.won || has2048(state.grid);
    state.over = isGameOver(state.grid);
    state.moved = true;

    // Animar y luego actualizar DOM (render)
    animateMoves(backMoves, () => {
      if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
      update();
    });
  }

  // Empuja/merge a la izquierda con moves para animación
  function moveLeftMergeWithMoves(grid) {
    let moved = false;
    let scoreGained = 0;
    const out = grid.map(row => row.slice());
    const moves = [];

    for (let r = 0; r < SIZE; r++) {
      const row = out[r].slice();

      // Construimos lista comprimida con posiciones originales
      const items = [];
      for (let c = 0; c < SIZE; c++) if (row[c] !== 0) items.push({ c, v: row[c] });

      const mergedRow = [];
      let writeC = 0;
      for (let i = 0; i < items.length; i++) {
        const cur = items[i];
        if (i < items.length - 1 && cur.v === items[i + 1].v) {
          // Fusión: dos elementos van a writeC
          const val = cur.v * 2;
          mergedRow.push(val);
          scoreGained += val;
          moves.push({ from: [r, cur.c], from2: [r, items[i + 1].c], to: [r, writeC], value: val, merged: true });
          i++; // saltamos el siguiente
        } else {
          // Desplazamiento simple
          mergedRow.push(cur.v);
          moves.push({ from: [r, cur.c], from2: null, to: [r, writeC], value: cur.v, merged: false });
        }
        writeC++;
      }

      while (mergedRow.length < SIZE) mergedRow.push(0);

      if (!arraysEqual(row, mergedRow)) moved = true;
      out[r] = mergedRow;
    }

    return { newGrid: out, scoreGained, moved, moves };
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

  // Mapas de coordenadas inversos para animación
  function mir(coord){ return [coord[0], SIZE - coord[1] - 1]; }
  function rotLeft(coord){ return [SIZE - coord[1] - 1, coord[0]]; }
  function rotRight(coord){ return [coord[1], SIZE - coord[0] - 1]; }

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
      const { moved } = moveLeftMergeWithMoves(temp);
      if (moved) return false;
    }
    return true;
  }

  // ----- Animación de deslizamiento -----
  function animateMoves(moves, onDone){
    try {
      if (!moves || moves.length === 0) { onDone?.(); return; }
      isAnimating = true;

      const rootRect = gridBg.getBoundingClientRect();
      const getRect = (r,c) => {
        const idx = r * SIZE + c;
        const cell = gridCells[idx];
        const rect = cell.getBoundingClientRect();
        return { left: rect.left - rootRect.left, top: rect.top - rootRect.top, width: rect.width, height: rect.height };
      };

      // Capa temporal para las "ghost tiles"
      const layer = document.createElement('div');
      layer.style.position = 'absolute';
      layer.style.inset = '0';
      layer.style.pointerEvents = 'none';
      gridBg.appendChild(layer);

      let remaining = 0;
      const done = () => {
        remaining--;
        if (remaining === 0) {
          // limpiar capa y finalizar
          layer.remove();
          setTimeout(() => { // colchón pequeño para no cortar la animación
            isAnimating = false;
            onDone?.();
          }, 0);
        }
      };

      // Creamos una ficha fantasma por cada origen (dos si fue merge)
      moves.forEach(m => {
        const sources = m.from2 ? [m.from, m.from2] : [m.from];
        sources.forEach(src => {
          const from = getRect(src[0], src[1]);
          const to = getRect(m.to[0], m.to[1]);
          const ghost = document.createElement('div');
          const val = m.merged ? (m.value / 2) : m.value;
          ghost.className = `tile tile--${val}`;
          ghost.textContent = val;
          ghost.style.position = 'absolute';
          ghost.style.left = from.left + 'px';
          ghost.style.top = from.top + 'px';
          ghost.style.width = from.width + 'px';
          ghost.style.height = from.height + 'px';
          ghost.style.transition = `transform ${SLIDE_MS}ms ease`;
          layer.appendChild(ghost);

          // forzamos reflow y aplicamos translate
          requestAnimationFrame(() => {
            const dx = to.left - from.left;
            const dy = to.top - from.top;
            ghost.style.transform = `translate(${dx}px, ${dy}px)`;
          });

          remaining++;
          setTimeout(done, SLIDE_MS);
        });
      });
    } catch {
      onDone?.();
    }
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
    if (isAnimating) return;
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
      if (isAnimating) return;
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      tracking = true;
    }, { passive: true });

    tileContainer.addEventListener('touchmove', (e) => {
      // evitar el scroll dentro del tablero
      if (tracking) e.preventDefault();
    }, { passive: false });

    tileContainer.addEventListener('touchend', (e) => {
      if (isAnimating) return;
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