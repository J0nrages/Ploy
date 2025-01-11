# game_state.py

"""
This module defines the main game logic and board state tracking.
"""

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
        """
        Initialize the game state.

        :param logger: Optional DebugLogger instance for logging debug messages.
        :param game_mode: Game mode ("2player" or "4player")
        """
        self.board = [[None for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        self.logger = logger or DebugLogger()
        self.last_action = None
        self.is_bottom_on_top = False
        self.game_mode = game_mode
        
        # Initialize with default players (can be changed with set_players)
        self.players = {
            "bottom": Player("Player 1", "#32CD32"),  # Default lime green
            "top": Player("Player 2", "#FFA500")      # Default orange
        }
        if game_mode == "4player":
            self.players.update({
                "left": Player("Player 3", "#4169E1"),   # Default royal blue
                "right": Player("Player 4", "#DC143C")   # Default crimson
            })
        
        self.current_player_position = "bottom"  # bottom, top, (left, right for 4 player)

    def set_players(self, **player_configs):
        """
        Configure players with custom names and colors.
        
        :param player_configs: Dict with player positions as keys and (name, color, is_ai) tuples as values
        Example: set_players(bottom=("Alice", "#FF0000"), top=("Bob", "#00FF00", True))
        """
        for position, config in player_configs.items():
            if position in self.players:
                name, color, *rest = config
                is_ai = rest[0] if rest else False
                self.players[position] = Player(name, color, is_ai)
                self.log_debug(f"Set {position} player to {name} ({color})")

    def get_current_player(self):
        """Get the current player object."""
        return self.players[self.current_player_position]

    def flip_board_orientation(self):
        """Flips the board orientation and updates piece positions and orientations."""
        self.is_bottom_on_top = not self.is_bottom_on_top
        self.initialize_board()
        bottom_player = self.players["bottom"].name
        self.log_debug(f"Board flipped. {bottom_player} is now {'top' if self.is_bottom_on_top else 'bottom'}.")

    def get_piece_orientation(self, base_orientation, position):
        """
        Gets the correct orientation for a piece based on position and board orientation.
        
        :param base_orientation: The default orientation for the piece
        :param position: The player's position (bottom/top/left/right)
        :return: The adjusted orientation
        """
        orientation_map = {
            "N": "S", "S": "N",
            "E": "W", "W": "E",
            "NE": "SW", "SW": "NE",
            "NW": "SE", "SE": "NW"
        }
        
        # Flip orientations based on board state and position
        needs_flip = (
            (self.is_bottom_on_top and position == "bottom") or
            (not self.is_bottom_on_top and position == "top") or
            (position in ["left", "right"] and self.game_mode == "4player")
        )
        
        return orientation_map[base_orientation] if needs_flip else base_orientation

    def initialize_board(self):
        """Sets up initial positions of pieces for all players."""
        self.board = [[None for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        for player in self.players.values():
            player.captured_pieces = []
        
        self.log_debug("Setting up initial board state...")

        bottom_base = 8 if self.is_bottom_on_top else 0
        top_base = 0 if self.is_bottom_on_top else 8

        # Place bottom player pieces
        self._place_player_pieces("bottom", bottom_base)
        
        # Place top player pieces
        self._place_player_pieces("top", top_base)
        
        # Place side players in 4-player mode
        if self.game_mode == "4player":
            self._place_side_player_pieces()

    def _place_player_pieces(self, position, base_row):
        """Helper method to place pieces for a player."""
        direction = "S" if position == "bottom" else "N"
        row_modifier = 1 if position == "bottom" else -1
        if self.is_bottom_on_top:
            row_modifier *= -1
        
        # Commander
        self.place_piece(base_row, 4, position, "Commander", 
                        self.get_piece_orientation(direction, position))
        
        # Shields
        shield_row = base_row + row_modifier
        for col in range(2, 7, 2):
            self.place_piece(shield_row, col, position, "Shield",
                           self.get_piece_orientation(direction, position))
        
        # Probes
        for col in range(1, 8, 2):
            self.place_piece(base_row, col, position, "Probe",
                           self.get_piece_orientation(direction, position))
        
        # Lances
        self.place_piece(base_row, 0, position, "Lance",
                        self.get_piece_orientation(direction, position))
        self.place_piece(base_row, 8, position, "Lance",
                        self.get_piece_orientation(direction, position))

    def _place_side_player_pieces(self):
        """Place pieces for left and right players in 4-player mode."""
        # Implementation for 4-player mode piece placement
        pass  # TODO: Implement 4-player piece placement

    def place_piece(self, row, col, position, piece_type, orientation):
        """Place a piece onto the board at (row, col)."""
        player = self.players[position]
        self.board[row][col] = {
            "type": piece_type,
            "color": player.color,
            "orientation": orientation,
            "position": position
        }
        self.log_debug(f"Placed {piece_type} at ({row}, {col}) facing {orientation}.")

    # ... [rest of the methods remain similar, but updated to use position instead of color] ...

    def move_piece(self, from_row, from_col, to_row, to_col):
        """Move a piece, handling capture mechanics and movement restrictions."""
        piece = self.board[from_row][from_col]
        if piece is None or piece["position"] != self.current_player_position:
            return False

        if not self.is_valid_move(from_row, from_col, to_row, to_col):
            return False

        # Handle capture
        target_piece = self.board[to_row][to_col]
        if target_piece is not None:
            self.players[piece["position"]].captured_pieces.append(target_piece)
            self.log_debug(f"Capturing {target_piece['type']} at ({to_row}, {to_col})")
            
        # Move piece
        self.board[to_row][to_col] = piece
        self.board[from_row][from_col] = None
        self.last_action = "move"
        
        self.log_debug(f"Moving {piece['type']} from ({from_row}, {from_col}) to ({to_row}, {to_col}).")
        return True

    def end_turn(self):
        """Reset turn state and move to next player."""
        if self.game_mode == "2player":
            self.current_player_position = "top" if self.current_player_position == "bottom" else "bottom"
        else:
            # Implement 4-player turn rotation
            positions = ["bottom", "right", "top", "left"]
            current_idx = positions.index(self.current_player_position)
            self.current_player_position = positions[(current_idx + 1) % 4]
            
        self.last_action = None
        current_player = self.get_current_player()
        self.log_debug(f"It is now {current_player.name}'s turn.")

    def get_captured_pieces(self):
        """Return dictionary of captured pieces for all players."""
        return {pos: player.captured_pieces for pos, player in self.players.items()}