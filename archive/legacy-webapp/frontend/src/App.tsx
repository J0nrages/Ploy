import React, { useState } from 'react'
import { GameState, Move, CreateGameRequest } from './types/game'
import { gameApi } from './api/game'
import PlainGameBoard3D from './components/PlainGameBoard3D'

function App() {
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [selectedPiece, setSelectedPiece] = useState<{ row: number; col: number } | null>(null)
  const [validMoves, setValidMoves] = useState<Array<{ row: number; col: number }>>([])
  const [gameId] = useState<string>('demo-game')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize game
  const createGame = async (gameMode: '2player' | '4player' = '2player') => {
    setLoading(true)
    setError(null)

    try {
      const request: CreateGameRequest = {
        game_id: gameId,
        game_mode: gameMode,
      }

      const response = await gameApi.createGame(request)
      setGameState(response.data as GameState)
      setSelectedPiece(null)
      setValidMoves([])
    } catch (err) {
      setError('Failed to create game')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Handle cell click
  const handleCellClick = async (row: number, col: number) => {
    if (!gameState || loading) return

    // If no piece is selected, try to select one
    if (!selectedPiece) {
      const piece = gameState.board[row][col]
      if (piece && gameState.current_player_position === piece.position) {
        setSelectedPiece({ row, col })

        // Get valid moves for this piece
        try {
          const response = await gameApi.getValidMoves(gameId, row, col)
          setValidMoves(
            response.data.valid_moves.map((move: [number, number]) => ({
              row: move[0],
              col: move[1],
            }))
          )
        } catch (err) {
          console.error('Failed to get valid moves:', err)
        }
      }
    } else {
      // If a piece is selected, try to move it
      const isValidMove = validMoves.some((move) => move.row === row && move.col === col)

      if (isValidMove) {
        // Execute the move
        try {
          const move: Move & { game_id: string } = {
            game_id: gameId,
            from_row: selectedPiece.row,
            from_col: selectedPiece.col,
            to_row: row,
            to_col: col,
          }

          const response = await gameApi.makeMove(move)
          setGameState(response.data as GameState)
          setSelectedPiece(null)
          setValidMoves([])
        } catch (err) {
          setError('Failed to make move')
          console.error(err)
        }
      } else {
        // Deselect or select a different piece
        const piece = gameState.board[row][col]
        if (piece && gameState.current_player_position === piece.position) {
          setSelectedPiece({ row, col })

          // Get valid moves for this piece
          try {
            const response = await gameApi.getValidMoves(gameId, row, col)
            setValidMoves(
              response.data.valid_moves.map((move: [number, number]) => ({
                row: move[0],
                col: move[1],
              }))
            )
          } catch (err) {
            console.error('Failed to get valid moves:', err)
          }
        } else {
          setSelectedPiece(null)
          setValidMoves([])
        }
      }
    }
  }

  // Rotate piece
  const rotatePiece = async (newOrientation: string) => {
    if (!selectedPiece || !gameState || loading) return

    try {
      const response = await gameApi.rotatePiece({
        game_id: gameId,
        row: selectedPiece.row,
        col: selectedPiece.col,
        new_orientation: newOrientation,
      })

      setGameState(response.data as GameState)
      setSelectedPiece(null)
      setValidMoves([])
    } catch (err) {
      setError('Failed to rotate piece')
      console.error(err)
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '20px', backgroundColor: '#2c3e50', color: 'white' }}>
        <h1>Ploy Game - 2.5D Web Edition</h1>

        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginTop: '10px' }}>
          <button
            onClick={() => createGame('2player')}
            disabled={loading}
            style={{ padding: '10px 20px', fontSize: '16px' }}
          >
            New 2-Player Game
          </button>

          <button
            onClick={() => createGame('4player')}
            disabled={loading}
            style={{ padding: '10px 20px', fontSize: '16px' }}
          >
            New 4-Player Game
          </button>

          {gameState && (
            <div>
              <span style={{ fontSize: '18px', fontWeight: 'bold' }}>
                Current Player: {gameState.current_player} ({gameState.current_player_position})
              </span>
            </div>
          )}

          {error && <div style={{ color: '#e74c3c', fontSize: '16px' }}>Error: {error}</div>}
        </div>
      </div>

      {/* Game Board */}
      <div style={{ flex: 1, position: 'relative' }}>
        {gameState ? (
          <GameBoard3D
            board={gameState.board}
            onCellClick={handleCellClick}
            selectedPiece={selectedPiece}
            validMoves={validMoves}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
              fontSize: '24px',
              color: '#7f8c8d',
            }}
          >
            Click "New Game" to start playing
          </div>
        )}
      </div>

      {/* Game Info Sidebar */}
      {gameState && (
        <div
          style={{
            position: 'absolute',
            right: '20px',
            top: '120px',
            width: '250px',
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            padding: '20px',
            borderRadius: '10px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h3>Game Info</h3>

          <div style={{ marginBottom: '15px' }}>
            <strong>Current Turn:</strong> {gameState.current_player}
          </div>

          {selectedPiece && (
            <div style={{ marginBottom: '15px' }}>
              <strong>Selected Piece:</strong> ({selectedPiece.row}, {selectedPiece.col})
              <div>
                <strong>Rotate:</strong>
                <select
                  onChange={(e) => rotatePiece(e.target.value)}
                  style={{ marginLeft: '10px', padding: '5px' }}
                >
                  <option value="">Select direction</option>
                  <option value="N">North</option>
                  <option value="NE">Northeast</option>
                  <option value="E">East</option>
                  <option value="SE">Southeast</option>
                  <option value="S">South</option>
                  <option value="SW">Southwest</option>
                  <option value="W">West</option>
                  <option value="NW">Northwest</option>
                </select>
              </div>
            </div>
          )}

          <div>
            <strong>Players:</strong>
            {Object.entries(gameState.players).map(([position, player]) => (
              <div key={position} style={{ marginLeft: '10px' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '12px',
                    height: '12px',
                    backgroundColor: player.color,
                    marginRight: '8px',
                    borderRadius: '50%',
                  }}
                ></span>
                {player.name} ({position})
                {player.captured_pieces.length > 0 && (
                  <span style={{ fontSize: '12px', color: '#666' }}>
                    - Captured: {player.captured_pieces.length}
                  </span>
                )}
              </div>
            ))}
          </div>

          {gameState.game_over && (
            <div
              style={{
                marginTop: '20px',
                padding: '10px',
                backgroundColor: '#e74c3c',
                color: 'white',
                textAlign: 'center',
                fontWeight: 'bold',
                borderRadius: '5px',
              }}
            >
              GAME OVER!
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
