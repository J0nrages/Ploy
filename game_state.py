from pieces import PIECE_TYPES, DIRECTIONS, DIRECTION_VECTORS, BOARD_SIZE
from debugging_utils import DebugLogger

class Player:
    def __init__(self, name, color, is_ai=False):
        self.name = name
        self.color = color
        self.is_ai = is_ai
        self.captured_pieces = []

class GameState:
    def __init__(self, logger=None, game_mode="2player"):
        self.board = [[None for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        self.logger = logger or DebugLogger()
        self.last_action = None
        self.is_bottom_on_top = False
        self.game_mode = game_mode

        self.players = {
            "bottom": Player("Player 1", "#32CD32"),
            "top": Player("Player 2", "#FFA500")
        }
        if game_mode == "4player":
            self.players.update({
                "left": Player("Player 3", "#4169E1"),
                "right": Player("Player 4", "#DC143C")
            })

        self.current_player_position = "bottom"

    def log_debug(self, message):
        self.logger.log(message)

    def flip_board_orientation(self):
        self.is_bottom_on_top = not self.is_bottom_on_top
        new_board = [[None for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        for r in range(BOARD_SIZE):
            for c in range(BOARD_SIZE):
                piece = self.board[r][c]
                if piece:
                    new_r = BOARD_SIZE - 1 - r
                    new_c = BOARD_SIZE - 1 - c
                    piece["orientation"] = self.get_piece_orientation(piece["orientation"], piece["position"])
                    new_board[new_r][new_c] = piece
        self.board = new_board
        self.log_debug("Board flipped without resetting.")

    def get_piece_orientation(self, base_orientation, position):
        orientation_map = {
            "N": "S", "S": "N",
            "E": "W", "W": "E",
            "NE": "SW", "SW": "NE",
            "NW": "SE", "SE": "NW"
        }
        if (self.is_bottom_on_top and position == "bottom") or (not self.is_bottom_on_top and position == "top"):
            return orientation_map.get(base_orientation, base_orientation)
        return base_orientation

    def move_piece(self, from_row, from_col, to_row, to_col):
        piece = self.board[from_row][from_col]
        if piece is None or piece["position"] != self.current_player_position:
            return False

        if not self.is_valid_move(from_row, from_col, to_row, to_col):
            return False

        target_piece = self.board[to_row][to_col]
        if target_piece is not None and target_piece["position"] != piece["position"]:
            self.players[piece["position"]].captured_pieces.append(target_piece)
            self.log_debug(f"Captured {target_piece['type']} at ({to_row}, {to_col}).")

        self.board[to_row][to_col] = piece
        self.board[from_row][from_col] = None
        self.last_action = "move"

        self.log_debug(f"Moved {piece['type']} from ({from_row}, {from_col}) to ({to_row}, {to_col}).")
        self.end_turn()
        return True

    def is_valid_move(self, from_row, from_col, to_row, to_col):
        return (to_row, to_col) in self.get_valid_moves(from_row, from_col)

    def get_valid_moves(self, row, col):
        piece = self.board[row][col]
        if not piece:
            return []

        piece_type = piece["type"]
        orientation = piece["orientation"]
        max_steps = PIECE_TYPES.get(piece_type, 0)

        valid_moves = []
        if orientation in DIRECTION_VECTORS:
            direction = DIRECTION_VECTORS[orientation]
            for step in range(1, max_steps + 1):
                new_row = row + step * direction[0]
                new_col = col + step * direction[1]

                if 0 <= new_row < BOARD_SIZE and 0 <= new_col < BOARD_SIZE:
                    if self.board[new_row][new_col] is None:
                        valid_moves.append((new_row, new_col))
                    elif self.board[new_row][new_col]["position"] != piece["position"]:
                        valid_moves.append((new_row, new_col))
                        break
                    else:
                        break
                else:
                    break

        return valid_moves

    def end_turn(self):
        if self.game_mode == "2player":
            self.current_player_position = "top" if self.current_player_position == "bottom" else "bottom"
        else:
            positions = ["bottom", "right", "top", "left"]
            current_idx = positions.index(self.current_player_position)
            self.current_player_position = positions[(current_idx + 1) % len(positions)]
        self.log_debug(f"It is now {self.get_current_player().name}'s turn.")

    def initialize_board(self):
        """Set up the initial board configuration."""
        self.board = [[None for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        for player in self.players.values():
            player.captured_pieces = []

        if self.game_mode == "2player":
            self._place_player_pieces("bottom", 0)
            self._place_player_pieces("top", BOARD_SIZE - 1)
        elif self.game_mode == "4player":
            self._place_player_pieces("bottom", 0)
            self._place_player_pieces("top", BOARD_SIZE - 1)
            self._place_side_player_pieces()  # Ensure this method exists for side players

    def _place_player_pieces(self, position, base_row):
        direction = "S" if position == "bottom" else "N"
        direction = self.get_piece_orientation(direction, position)

        self.place_piece(base_row, 4, position, "Commander", direction)

        shield_row = base_row + (1 if position == "bottom" else -1)
        for col in range(2, 7, 2):
            self.place_piece(shield_row, col, position, "Shield", direction)

        for col in range(1, 8, 2):
            self.place_piece(base_row, col, position, "Probe", direction)

        self.place_piece(base_row, 0, position, "Lance", direction)
        self.place_piece(base_row, 8, position, "Lance", direction)

    def _place_side_player_pieces(self):
        """Place pieces for left and right players in 4-player mode."""
        side_positions = {
            "left": ("E", 4, 0),
            "right": ("W", 4, 8)
        }
        for position, (direction, base_row, base_col) in side_positions.items():
            direction = self.get_piece_orientation(direction, position)
            self.place_piece(base_row, base_col, position, "Commander", direction)

            probe_col_offset = 1 if position == "left" else -1
            for i in range(3):
                self.place_piece(base_row - 1 + i, base_col + probe_col_offset * i, position, "Probe", direction)

            for i in range(2):
                self.place_piece(base_row + i * 2 - 1, base_col, position, "Lance", direction)
                self.place_piece(base_row + i * 2 - 1, base_col + probe_col_offset * 2, position, "Shield", direction)

    def place_piece(self, row, col, position, piece_type, orientation):
        player = self.players[position]
        self.board[row][col] = {
            "type": piece_type,
            "color": player.color,
            "orientation": orientation,
            "position": position
        }
        self.log_debug(f"Placed {piece_type} at ({row}, {col}) facing {orientation}.")

    def check_game_over(self):
        """Check if the game has ended."""
        for position, player in self.players.items():
            if player.captured_pieces and all(p["type"] != "Commander" for p in player.captured_pieces):
                self.log_debug(f"{position} has no remaining Commander. Game Over.")
                return True
        return False
