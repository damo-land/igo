import React, { useState } from 'react';

const DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

const createBoard = (size) =>
  Array(size).fill(null).map(() => Array(size).fill(null));

const cloneBoard = (board) => board.map((row) => [...row]);

// Detect seki groups by grouping connected stones and comparing their liberties.
const detectSekiGroups = (brd, boardSize) => {
  const groups = [];
  const visited = Array(boardSize)
    .fill(null)
    .map(() => Array(boardSize).fill(false));

  for (let r = 0; r < boardSize; r++) {
    for (let c = 0; c < boardSize; c++) {
      if (brd[r][c] !== null && !visited[r][c]) {
        const color = brd[r][c];
        const group = [];
        const liberties = new Set();
        const stack = [[r, c]];
        while (stack.length) {
          const [i, j] = stack.pop();
          if (visited[i][j]) continue;
          visited[i][j] = true;
          group.push([i, j]);
          DIRECTIONS.forEach(([dr, dc]) => {
            const nr = i + dr,
              nc = j + dc;
            if (nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize) {
              if (brd[nr][nc] === null) liberties.add(`${nr},${nc}`);
              else if (brd[nr][nc] === color && !visited[nr][nc]) stack.push([nr, nc]);
            }
          });
        }
        groups.push({ color, group, liberties });
      }
    }
  }

  const sekiMap = Array(boardSize)
    .fill(null)
    .map(() => Array(boardSize).fill(false));

  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const g1 = groups[i],
        g2 = groups[j];
      if (g1.color === g2.color) continue;
      const shared = new Set([...g1.liberties].filter((x) => g2.liberties.has(x)));
      if (
        shared.size > 0 &&
        shared.size === g1.liberties.size &&
        shared.size === g2.liberties.size
      ) {
        g1.group.forEach(([r, c]) => (sekiMap[r][c] = true));
        g2.group.forEach(([r, c]) => (sekiMap[r][c] = true));
      }
    }
  }
  return sekiMap;
};

// Simplified bent-four-in-the-corner detection (example for top-left corner).
const isBentFourInCorner = (brd, boardSize, row, col, player) => {
  if (row === 0 && col === 0 && boardSize >= 3) {
    if (
      brd[0][0] === player &&
      brd[0][1] === null &&
      brd[0][2] === player &&
      brd[1][0] === null &&
      brd[1][1] === player &&
      brd[2][0] === player
    ) {
      return true;
    }
  }
  return false;
};

const GoGame = () => {
  const [boardSize, setBoardSize] = useState(9);
  const [board, setBoard] = useState(createBoard(9));
  const [currentPlayer, setCurrentPlayer] = useState('black');
  const [lastMove, setLastMove] = useState(null);
  const [captures, setCaptures] = useState({ black: 0, white: 0 });
  const [passCounts, setPassCounts] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [history, setHistory] = useState([]);
  const [score, setScore] = useState(null);

  const findGroup = (brd, row, col, color) => {
    const group = [];
    const visited = Array(boardSize)
      .fill(null)
      .map(() => Array(boardSize).fill(false));
    const dfs = (r, c) => {
      if (
        r < 0 ||
        r >= boardSize ||
        c < 0 ||
        c >= boardSize ||
        visited[r][c] ||
        brd[r][c] !== color
      )
        return;
      visited[r][c] = true;
      group.push([r, c]);
      DIRECTIONS.forEach(([dr, dc]) => dfs(r + dr, c + dc));
    };
    dfs(row, col);
    return group;
  };

  const hasLiberties = (brd, group) =>
    group.some(([r, c]) =>
      DIRECTIONS.some(([dr, dc]) => {
        const nr = r + dr,
          nc = c + dc;
        return nr >= 0 && nr < boardSize && nc >= 0 && nc < boardSize && brd[nr][nc] === null;
      })
    );

  const placeStone = (row, col) => {
    if (gameOver || board[row][col] !== null) return;
    const newBoard = cloneBoard(board);
    newBoard[row][col] = currentPlayer;

    // Check special case: bent-four-in-the-corner.
    if (isBentFourInCorner(newBoard, boardSize, row, col, currentPlayer)) return;

    const sekiMap = detectSekiGroups(newBoard, boardSize);
    const opponent = currentPlayer === 'black' ? 'white' : 'black';
    let capturedStones = 0;

    DIRECTIONS.forEach(([dr, dc]) => {
      const newRow = row + dr,
        newCol = col + dc;
      if (
        newRow >= 0 &&
        newRow < boardSize &&
        newCol >= 0 &&
        newCol < boardSize &&
        newBoard[newRow][newCol] === opponent
      ) {
        if (sekiMap[newRow][newCol]) return; // Skip capture if group is in seki.
        const group = findGroup(newBoard, newRow, newCol, opponent);
        if (group.length && !hasLiberties(newBoard, group)) {
          capturedStones += group.length;
          group.forEach(([r, c]) => (newBoard[r][c] = null));
        }
      }
    });

    const placedGroup = findGroup(newBoard, row, col, currentPlayer);
    if (!hasLiberties(newBoard, placedGroup)) return;

    const newCaptures = {
      ...captures,
      [currentPlayer]: captures[currentPlayer] + capturedStones,
    };
    const newHistory = [
      ...history,
      { board: cloneBoard(board), player: currentPlayer, move: [row, col], captures },
    ];

    setBoard(newBoard);
    setLastMove([row, col]);
    setCaptures(newCaptures);
    setCurrentPlayer(opponent);
    setPassCounts(0);
    setHistory(newHistory);
  };

  const passTurn = () => {
    if (gameOver) return;
    const newPassCounts = passCounts + 1;
    if (newPassCounts >= 2) {
      setGameOver(true);
      calculateScore();
    } else {
      setPassCounts(newPassCounts);
      setCurrentPlayer(currentPlayer === 'black' ? 'white' : 'black');
    }
  };

  const calculateScore = () => {
    const territory = { black: 0, white: 0 };
    const territoryMap = createBoard(boardSize);
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        if (board[r][c]) territoryMap[r][c] = board[r][c];
      }
    }
    const floodFillTerritory = () => {
      for (let r = 0; r < boardSize; r++) {
        for (let c = 0; c < boardSize; c++) {
          if (board[r][c] === null && territoryMap[r][c] === null) {
            const emptyPoints = [];
            let blackBorder = false,
              whiteBorder = false;
            const queue = [[r, c]];
            const visited = new Set();
            const key = (i, j) => `${i},${j}`;
            visited.add(key(r, c));
            while (queue.length) {
              const [i, j] = queue.shift();
              emptyPoints.push([i, j]);
              DIRECTIONS.forEach(([dr, dc]) => {
                const nr = i + dr,
                  nc = j + dc;
                if (nr < 0 || nr >= boardSize || nc < 0 || nc >= boardSize) return;
                if (board[nr][nc] === 'black') blackBorder = true;
                else if (board[nr][nc] === 'white') whiteBorder = true;
                else if (!visited.has(key(nr, nc))) {
                  queue.push([nr, nc]);
                  visited.add(key(nr, nc));
                }
              });
            }
            if (blackBorder !== whiteBorder) {
              const owner = blackBorder ? 'black' : 'white';
              territory[owner] += emptyPoints.length;
              emptyPoints.forEach(([i, j]) => (territoryMap[i][j] = owner));
            }
          }
        }
      }
    };
    floodFillTerritory();
    const finalScore = {
      black: territory.black + captures.black,
      white: territory.white + captures.white + 6.5,
    };
    setScore({
      territory,
      territoryMap,
      finalScore,
      winner: finalScore.black > finalScore.white ? 'black' : 'white',
      margin: Math.abs(finalScore.black - finalScore.white),
    });
  };

  const undoMove = () => {
    if (!history.length || gameOver) return;
    const previousState = history[history.length - 1];
    setBoard(previousState.board);
    setCurrentPlayer(previousState.player);
    setCaptures(previousState.captures);
    setLastMove(history.length > 1 ? previousState.move : null);
    setPassCounts(0);
    setHistory(history.slice(0, -1));
  };

  const resetGame = () => {
    setBoard(createBoard(boardSize));
    setCurrentPlayer('black');
    setLastMove(null);
    setCaptures({ black: 0, white: 0 });
    setPassCounts(0);
    setGameOver(false);
    setHistory([]);
    setScore(null);
  };

  const changeBoardSize = (size) => {
    setBoardSize(size);
    resetGame();
  };

  const getStarPoints = () => {
    switch (boardSize) {
      case 9:
        return [
          [2, 2],
          [2, 6],
          [6, 2],
          [6, 6],
          [4, 4],
        ];
      case 13:
        return [
          [3, 3],
          [3, 9],
          [9, 3],
          [9, 9],
          [6, 6],
        ];
      case 19:
        return [
          [3, 3],
          [3, 9],
          [3, 15],
          [9, 3],
          [9, 9],
          [9, 15],
          [15, 3],
          [15, 9],
          [15, 15],
        ];
      default:
        return [];
    }
  };

  return (
    <div
      className="flex flex-col items-center p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-sm"
      style={{
        fontFamily:
          'Circular, -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif',
      }}
    >
      <div className="mb-6 flex flex-col items-center">
        <h1
          className="text-6xl font-medium mb-4 text-gray-900"
          style={{ fontFamily: '"Noto Serif JP", serif' }}
        >
          囲碁
        </h1>
      </div>

      <div className="mb-4 flex justify-center space-x-3">
        <button
          onClick={() => changeBoardSize(9)}
          className={`px-3 py-1 text-sm rounded-full ${
            boardSize === 9 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'
          }`}
        >
          9×9
        </button>
        <button
          onClick={() => changeBoardSize(13)}
          className={`px-3 py-1 text-sm rounded-full ${
            boardSize === 13 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'
          }`}
        >
          13×13
        </button>
        <button
          onClick={() => changeBoardSize(19)}
          className={`px-3 py-1 text-sm rounded-full ${
            boardSize === 19 ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'
          }`}
        >
          19×19
        </button>
      </div>

      <div className="flex justify-center items-center space-x-2 mb-6">
        <div className="text-sm text-gray-500 flex items-center">
          <span className="w-3 h-3 bg-gray-900 rounded-full mr-1"></span>
          <span className="mr-1 font-medium text-gray-700">黒</span>
          <span className="text-gray-500">Captures: {captures.black}</span>
          {currentPlayer === 'black' && !gameOver && (
            <span className="text-gray-900 ml-1">●</span>
          )}
        </div>
        <span className="mx-3 text-gray-300">|</span>
        <div className="text-sm text-gray-500 flex items-center">
          <span className="w-3 h-3 bg-white border border-gray-300 rounded-full mr-1"></span>
          <span className="mr-1 font-medium text-gray-700">白</span>
          <span className="text-gray-500">Captures: {captures.white}</span>
          {currentPlayer === 'white' && !gameOver && (
            <span className="text-gray-900 ml-1">●</span>
          )}
        </div>
      </div>

      <div
        className="relative bg-amber-100 rounded-3xl shadow-sm overflow-hidden"
        style={{
          backgroundColor: '#fbefd6',
          width: boardSize === 19 ? '640px' : boardSize === 13 ? '520px' : '430px',
          height: boardSize === 19 ? '640px' : boardSize === 13 ? '520px' : '430px',
        }}
      >
        <div
          className="absolute"
          style={{
            top: '40px',
            left: '40px',
            right: '40px',
            bottom: '40px',
          }}
        >
          <div className="absolute inset-0">
            {Array(boardSize)
              .fill(null)
              .map((_, i) => (
                <div
                  key={`row-${i}`}
                  className="absolute border-t border-amber-800"
                  style={{
                    top: `${(i * 100) / (boardSize - 1)}%`,
                    left: '0',
                    right: '0',
                    borderColor: 'rgba(146, 100, 27, 0.5)',
                  }}
                />
              ))}
            {Array(boardSize)
              .fill(null)
              .map((_, i) => (
                <div
                  key={`col-${i}`}
                  className="absolute border-l border-amber-800"
                  style={{
                    left: `${(i * 100) / (boardSize - 1)}%`,
                    top: '0',
                    bottom: '0',
                    borderColor: 'rgba(146, 100, 27, 0.5)',
                  }}
                />
              ))}
            {getStarPoints().map(([r, c], i) => (
              <div
                key={`star-${i}`}
                className="absolute w-2 h-2 bg-amber-800 rounded-full"
                style={{
                  top: `${(r * 100) / (boardSize - 1)}%`,
                  left: `${(c * 100) / (boardSize - 1)}%`,
                  backgroundColor: 'rgba(146, 100, 27, 0.8)',
                  transform: 'translate(-50%, -50%)',
                }}
              />
            ))}
          </div>
          {board.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const stoneSize = boardSize === 19 ? 26 : boardSize === 13 ? 30 : 36;
              return (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  className="absolute flex items-center justify-center cursor-pointer hover:opacity-95 transition-opacity"
                  style={{
                    width: `${stoneSize}px`,
                    height: `${stoneSize}px`,
                    top: `${(rowIndex * 100) / (boardSize - 1)}%`,
                    left: `${(colIndex * 100) / (boardSize - 1)}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                  onClick={() => placeStone(rowIndex, colIndex)}
                >
                  {cell && (
                    <div
                      className={`rounded-full ${
                        cell === 'black' ? 'bg-gray-900' : 'bg-white'
                      }`}
                      style={{
                        width: '100%',
                        height: '100%',
                        boxShadow:
                          cell === 'black'
                            ? '0 2px 4px rgba(0, 0, 0, 0.3)'
                            : '0 2px 4px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
                      }}
                    />
                  )}
                  {lastMove &&
                    lastMove[0] === rowIndex &&
                    lastMove[1] === colIndex && (
                      <div
                        className={`absolute w-2 h-2 rounded-full ${
                          board[rowIndex][colIndex] === 'black'
                            ? 'bg-white'
                            : 'bg-black'
                        }`}
                      />
                    )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-6 flex space-x-3">
        <button
          onClick={passTurn}
          disabled={gameOver}
          className="px-4 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg shadow-sm disabled:opacity-50 transition-colors duration-200 font-medium"
        >
          パス
        </button>
        <button
          onClick={undoMove}
          disabled={history.length === 0 || gameOver}
          className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg shadow-sm disabled:opacity-50 transition-colors duration-200 font-medium"
        >
          戻る
        </button>
        <button
          onClick={resetGame}
          className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg shadow-sm transition-colors duration-200 font-medium"
        >
          リセット
        </button>
      </div>

      {gameOver && (
        <div className="mt-6 p-6 bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="font-medium text-xl mb-4 text-gray-800">対局結果</div>
          {score && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <div className="font-medium text-gray-800 pb-2 mb-2">黒</div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Territory:</span>{' '}
                    <span>{score.territory.black}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Captures:</span>{' '}
                    <span>{captures.black}</span>
                  </div>
                  <div className="flex justify-between font-medium pt-2 mt-2">
                    <span>Total:</span>{' '}
                    <span>{score.finalScore.black.toFixed(1)}</span>
                  </div>
                </div>
                <div>
                  <div className="font-medium text-gray-800 pb-2 mb-2">白</div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Territory:</span>{' '}
                    <span>{score.territory.white}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Captures:</span>{' '}
                    <span>{captures.white}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-gray-600">Komi:</span> <span>+6.5</span>
                  </div>
                  <div className="flex justify-between font-medium pt-2 mt-2">
                    <span>Total:</span>{' '}
                    <span>{score.finalScore.white.toFixed(1)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4 text-center bg-gray-100 text-gray-800 py-3 px-4 rounded-lg font-medium">
                {score.winner === 'black' ? '黒' : '白'} wins by{' '}
                {score.margin.toFixed(1)} points
              </div>
              <div className="mt-6">
                <div className="font-medium text-gray-700 mb-3">Territory Map</div>
                <div
                  className="relative mx-auto rounded-3xl overflow-hidden shadow-sm"
                  style={{
                    width: '260px',
                    height: '260px',
                    backgroundColor: '#fbefd6',
                  }}
                >
                  <div
                    className="absolute"
                    style={{
                      top: '20px',
                      left: '20px',
                      right: '20px',
                      bottom: '20px',
                    }}
                  >
                    <div className="absolute inset-0">
                      {Array(boardSize)
                        .fill(null)
                        .map((_, i) => (
                          <div
                            key={`mini-row-${i}`}
                            className="absolute border-t opacity-40"
                            style={{
                              top: `${(i * 100) / (boardSize - 1)}%`,
                              left: '0',
                              right: '0',
                              borderColor: 'rgba(146, 100, 27, 0.5)',
                            }}
                          />
                        ))}
                      {Array(boardSize)
                        .fill(null)
                        .map((_, i) => (
                          <div
                            key={`mini-col-${i}`}
                            className="absolute border-l opacity-40"
                            style={{
                              left: `${(i * 100) / (boardSize - 1)}%`,
                              top: '0',
                              bottom: '0',
                              borderColor: 'rgba(146, 100, 27, 0.5)',
                            }}
                          />
                        ))}
                    </div>
                    {score.territoryMap.map((row, rowIndex) =>
                      row.map((cell, colIndex) => (
                        <div
                          key={`territory-${rowIndex}-${colIndex}`}
                          className="absolute"
                          style={{
                            width: '16px',
                            height: '16px',
                            top: `${(rowIndex * 100) / (boardSize - 1)}%`,
                            left: `${(colIndex * 100) / (boardSize - 1)}%`,
                            transform: 'translate(-50%, -50%)',
                          }}
                        >
                          {cell === 'black' &&
                            board[rowIndex][colIndex] === null && (
                              <div className="w-4 h-4 bg-black bg-opacity-15 rounded-full" />
                            )}
                          {cell === 'white' &&
                            board[rowIndex][colIndex] === null && (
                              <div className="w-4 h-4 bg-rose-100 rounded-full" />
                            )}
                          {board[rowIndex][colIndex] === 'black' && (
                            <div className="w-full h-full bg-gray-900 rounded-full shadow-sm" />
                          )}
                          {board[rowIndex][colIndex] === 'white' && (
                            <div className="w-full h-full bg-white rounded-full shadow-sm" />
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="text-xs mt-3 text-gray-500 flex justify-center space-x-6">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-black bg-opacity-15 rounded-full mr-1"></div>
                    <span>黒 territory</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-gray-200 rounded-full mr-1"></div>
                    <span>白 territory</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 text-sm text-gray-500 text-center max-w-md">
        <p>
          Place stones on intersections. Capture opponent stones by surrounding them.
        </p>
      </div>
    </div>
  );
};

export default GoGame;
