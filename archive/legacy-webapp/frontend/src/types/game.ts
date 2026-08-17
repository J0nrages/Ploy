export interface Piece {
  type: 'Commander' | 'Lance' | 'Probe' | 'Shield'
  color: string
  orientation: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW'
  position: string
}

export interface Player {
  name: string
  color: string
  captured_pieces: Piece[]
}

export interface GameState {
  board: (Piece | null)[][]
  current_player: string
  current_player_position: string
  players: Record<string, Player>
  game_over: boolean
}

export interface Move {
  from_row: number
  from_col: number
  to_row: number
  to_col: number
}

export interface CreateGameRequest {
  game_id: string
  game_mode: '2player' | '4player'
}

export interface RotateRequest {
  game_id: string
  row: number
  col: number
  new_orientation: string
}
