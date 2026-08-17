from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import json
import asyncio

from game_state import GameState
from pieces import PIECE_TYPES, DIRECTIONS, DIRECTION_VECTORS

app = FastAPI(title="Ploy Game API")

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # React dev server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Game instances storage
games: Dict[str, GameState] = {}
websockets: Dict[str, List[WebSocket]] = {}


# Pydantic models
class CreateGameRequest(BaseModel):
    game_id: str
    game_mode: str = "2player"


class MoveRequest(BaseModel):
    game_id: str
    from_row: int
    from_col: int
    to_row: int
    to_col: int


class RotateRequest(BaseModel):
    game_id: str
    row: int
    col: int
    new_orientation: str


class GameResponse(BaseModel):
    board: List[List[Optional[Dict[str, Any]]]]
    current_player: str
    current_player_position: str
    valid_moves: List[tuple]
    captured_pieces: Dict[str, List[Dict[str, Any]]]
    game_over: bool
    players: Dict[str, Dict[str, Any]]


@app.get("/")
async def root():
    return {"message": "Ploy Game API"}


@app.post("/api/game/create")
async def create_game(request: CreateGameRequest):
    """Create a new game instance."""
    game_id = request.game_id
    game_mode = request.game_mode

    if game_id in games:
        return {"error": "Game already exists"}

    game = GameState(game_mode=game_mode)
    game.initialize_board()
    games[game_id] = game
    websockets[game_id] = []

    return {
        "message": "Game created",
        "game_id": game_id,
        "board": game.board,
        "current_player": game.get_current_player().name,
        "current_player_position": game.current_player_position,
        "players": {
            pos: {
                "name": player.name,
                "color": player.color,
                "captured_pieces": player.captured_pieces,
            }
            for pos, player in game.players.items()
        },
    }


@app.get("/api/game/{game_id}")
async def get_game_state(game_id: str):
    """Get current game state."""
    if game_id not in games:
        return {"error": "Game not found"}

    game = games[game_id]

    return {
        "board": game.board,
        "current_player": game.get_current_player().name,
        "current_player_position": game.current_player_position,
        "players": {
            pos: {
                "name": player.name,
                "color": player.color,
                "captured_pieces": player.captured_pieces,
            }
            for pos, player in game.players.items()
        },
        "game_over": game.check_game_over(),
    }


@app.post("/api/game/move")
async def make_move(request: MoveRequest):
    """Make a move in the game."""
    if request.game_id not in games:
        return {"error": "Game not found"}

    game = games[request.game_id]

    # Validate move
    valid_moves = game.get_valid_moves(request.from_row, request.from_col)
    if (request.to_row, request.to_col) not in valid_moves:
        return {"error": "Invalid move"}

    # Execute move
    success = game.move_piece(
        request.from_row, request.from_col, request.to_row, request.to_col
    )

    if success:
        # Notify all connected clients
        await broadcast_game_update(request.game_id, game)

        return {
            "success": True,
            "board": game.board,
            "current_player": game.get_current_player().name,
            "current_player_position": game.current_player_position,
            "players": {
                pos: {
                    "name": player.name,
                    "color": player.color,
                    "captured_pieces": player.captured_pieces,
                }
                for pos, player in game.players.items()
            },
            "game_over": game.check_game_over(),
        }
    else:
        return {"error": "Move failed"}


@app.post("/api/game/rotate")
async def rotate_piece(request: RotateRequest):
    """Rotate a piece to a new orientation."""
    if request.game_id not in games:
        return {"error": "Game not found"}

    game = games[request.game_id]
    piece = game.board[request.row][request.col]

    if not piece or piece["position"] != game.current_player_position:
        return {"error": "Cannot rotate opponent's piece"}

    if request.new_orientation not in DIRECTIONS:
        return {"error": "Invalid orientation"}

    # Update piece orientation
    piece["orientation"] = request.new_orientation

    # End turn
    game.end_turn()

    # Notify all connected clients
    await broadcast_game_update(request.game_id, game)

    return {
        "success": True,
        "board": game.board,
        "current_player": game.get_current_player().name,
        "current_player_position": game.current_player_position,
        "players": {
            pos: {
                "name": player.name,
                "color": player.color,
                "captured_pieces": player.captured_pieces,
            }
            for pos, player in game.players.items()
        },
        "game_over": game.check_game_over(),
    }


@app.get("/api/game/{game_id}/valid_moves/{row}/{col}")
async def get_valid_moves(game_id: str, row: int, col: int):
    """Get valid moves for a piece at the given position."""
    if game_id not in games:
        return {"error": "Game not found"}

    game = games[game_id]
    valid_moves = game.get_valid_moves(row, col)

    return {"valid_moves": valid_moves}


@app.websocket("/ws/{game_id}")
async def websocket_endpoint(websocket: WebSocket, game_id: str):
    """WebSocket endpoint for real-time game updates."""
    await websocket.accept()

    if game_id not in websockets:
        websockets[game_id] = []

    websockets[game_id].append(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            # Echo back or handle specific messages if needed
            await websocket.send_text(f"Received: {data}")
    except WebSocketDisconnect:
        websockets[game_id].remove(websocket)


async def broadcast_game_update(game_id: str, game: GameState):
    """Broadcast game state update to all connected clients."""
    if game_id in websockets:
        message = {
            "type": "game_update",
            "board": game.board,
            "current_player": game.get_current_player().name,
            "current_player_position": game.current_player_position,
            "players": {
                pos: {
                    "name": player.name,
                    "color": player.color,
                    "captured_pieces": player.captured_pieces,
                }
                for pos, player in game.players.items()
            },
            "game_over": game.check_game_over(),
        }

        for websocket in websockets[game_id]:
            try:
                await websocket.send_text(json.dumps(message))
            except:
                # Connection broken, remove it
                websockets[game_id].remove(websocket)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
