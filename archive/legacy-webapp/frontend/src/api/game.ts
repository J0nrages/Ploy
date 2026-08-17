import axios from 'axios'
import { CreateGameRequest, Move, RotateRequest } from '../types/game'

const API_BASE_URL = 'http://localhost:8000'

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const gameApi = {
  createGame: (request: CreateGameRequest) => api.post('/api/game/create', request),

  getGameState: (gameId: string) => api.get(`/api/game/${gameId}`),

  makeMove: (move: Move & { game_id: string }) => api.post('/api/game/move', move),

  rotatePiece: (rotation: RotateRequest) => api.post('/api/game/rotate', rotation),

  getValidMoves: (gameId: string, row: number, col: number) =>
    api.get(`/api/game/${gameId}/valid_moves/${row}/${col}`),
}
