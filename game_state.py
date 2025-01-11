# game_state.py

"""
This module defines the main game logic and board state tracking.
"""

from pieces import PIECE_TYPES, DIRECTIONS, DIRECTION_VECTORS, PIECE_COLORS, BOARD_SIZE
from debugging_utils import DebugLogger

class GameState:
    def __init__(self, logger=None):
        """
        Initialize the game state.

        :param logger: Optional DebugLogger instance for logging debug messages.
        """
        self.board = [[None for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        self.current_player = "green"
        self.logger = logger or DebugLogger()
        self.last_action = None  # Track if piece was rotated this turn

    def log_debug(self, message):
        """
        Log a debug message using the provided logger.

        :param message: The message to log.
        """
        self.logger.log_debug(message)

    def initialize_board(self):
        """
        Sets up initial positions of pieces for both players.
        """
        self.log_debug("Setting up initial board state...")

        # Commander
        self.place_piece(0, 4, "green", "Commander", "N")
        self.place_piece(8, 4, "orange", "Commander", "S")

        # Shields in front
        for col in range(2, 7, 2):
            self.place_piece(1, col, "green", "Shield", "N")
            self.place_piece(7, col, "orange", "Shield", "S")

        # Probes behind Shields
        for col in range(1, 8, 2):
            self.place_piece(0, col, "green", "Probe", "N")
            self.place_piece(8, col, "orange", "Probe", "S")

        # Lances at corners
        self.place_piece(0, 0, "green", "Lance", "N")
        self.place_piece(0, 8, "green", "Lance", "N")
        self.place_piece(8, 0, "orange", "Lance", "S")
        self.place_piece(8, 8, "orange", "Lance", "S")

    def place_piece(self, row, col, color, piece_type, orientation):
        """
        Place a piece onto the board at (row, col).

        :param row: The row index.
        :param col: The column index.
        :param color: The piece color.
        :param piece_type: The type of piece.
        :param orientation: The initial orientation of the piece.
        """
        self.board[row][col] = {
            "type": piece_type,
            "color": color,
            "orientation": orientation
        }
        self.log_debug(f"Placed {piece_type} at ({row}, {col}) facing {orientation}.")

    def is_valid_cell(self, row, col):
        """
        Check if a cell is within bounds.

        :param row: The row index.
        :param col: The column index.
        :return: True if the cell is within bounds, False otherwise.
        """
        return 0 <= row < BOARD_SIZE and 0 <= col < BOARD_SIZE

    def get_valid_moves(self, row, col):
        """
        Return a list of valid board positions (row, col) to which the piece can move.
        Takes into account the current orientation of the piece and turn restrictions.
        """
        piece = self.board[row][col]
        if piece is None or piece["color"] != self.current_player:
            return []

        # If piece already rotated this turn and isn't a Shield, no movement allowed
        if self.last_action == "rotate" and piece["type"] != "Shield":
            return []

        piece_type = piece["type"]
        orientation = piece["orientation"]
        max_steps = PIECE_TYPES[piece_type]

        # Special handling for Commander's four-direction movement
        if piece_type == "Commander":
            valid_directions = ["N", "E", "S", "W"]
            if orientation not in valid_directions:
                return []

        # Get movement vector based on current orientation
        col_inc, row_inc = DIRECTION_VECTORS[orientation]
        valid_moves = []

        # Check each step in the piece's movement range
        for step in range(1, max_steps + 1):
            new_row = row + step * row_inc
            new_col = col + step * col_inc

            if not self.is_valid_cell(new_row, new_col):
                break

            occupying_piece = self.board[new_row][new_col]
            if occupying_piece is None:
                valid_moves.append((new_row, new_col))
            elif occupying_piece["color"] != piece["color"]:
                valid_moves.append((new_row, new_col))  # Capture move
                break  # Stop after capture opportunity
            else:
                break  # Stop at friendly piece

        return valid_moves

    def rotate_piece(self, row, col, clockwise=True):
        """
        Rotate the piece at (row, col) clockwise or counterclockwise.
        Handles rotation restrictions based on piece type and previous actions.
        """
        piece = self.board[row][col]
        if piece is None or piece["color"] != self.current_player:
            return False

        # Can't rotate if already moved this turn (except Shield)
        if self.last_action == "move" and piece["type"] != "Shield":
            return False

        current_orientation = piece["orientation"]
        current_index = DIRECTIONS.index(current_orientation)
        new_index = (current_index + 1) % len(DIRECTIONS) if clockwise else (current_index - 1) % len(DIRECTIONS)
        
        # Special handling for Commander's four-direction limitation
        if piece["type"] == "Commander":
            valid_directions = ["N", "E", "S", "W"]
            new_orientation = DIRECTIONS[new_index]
            if new_orientation not in valid_directions:
                return False

        piece["orientation"] = DIRECTIONS[new_index]
        self.last_action = "rotate"
        self.log_debug(f"Rotated piece to face {piece['orientation']}.")
        return True

    def move_piece(self, from_row, from_col, to_row, to_col):
        """
        Move a piece, handling capture mechanics and movement restrictions.
        """
        piece = self.board[from_row][from_col]
        if piece is None or piece["color"] != self.current_player:
            return False

        # Validate move is in list of valid moves
        valid_moves = self.get_valid_moves(from_row, from_col)
        if (to_row, to_col) not in valid_moves:
            return False

        # Handle capture
        target_piece = self.board[to_row][to_col]
        if target_piece is not None:
            self.log_debug(f"Capturing {target_piece['type']} at ({to_row}, {to_col})")
            
        # Move piece
        self.board[to_row][to_col] = piece
        self.board[from_row][from_col] = None
        self.last_action = "move"
        
        self.log_debug(f"Moving {piece['type']} from ({from_row}, {from_col}) to ({to_row}, {to_col}).")
        return True

    def end_turn(self):
        """
        Reset turn state and switch current player.
        """
        self.current_player = "orange" if self.current_player == "green" else "green"
        self.last_action = None  # Reset last action for new turn
        self.log_debug(f"It is now {self.current_player}'s turn.")