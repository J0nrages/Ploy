# ui.py

"""
This module contains the PyQt-specific code for rendering the board, handling user input,
and interacting with the GameState.
"""

import sys
from PyQt5.QtWidgets import QMainWindow, QGraphicsScene, QGraphicsView, QGraphicsEllipseItem
from PyQt5.QtGui import QBrush, QColor, QPen, QPainter
from PyQt5.QtCore import Qt
from pieces import PIECE_COLORS, DIRECTIONS, DIRECTION_VECTORS, BOARD_SIZE
from game_state import GameState

TILE_SIZE = 80
PIECE_RADIUS = 30
BACKGROUND_COLOR = "#3b3b3b"
LINE_COLOR = "#a0a0a0"

class PloyGameUI(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Ploy Game")
        self.setGeometry(100, 100, 800, 800)
        
        # Initialize game state
        self.game_state = GameState()
        self.game_state.initialize_board()
        
        # Track UI state
        self.ui_board = [[{} for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        self.selected_row = None
        self.selected_col = None
        self.valid_moves = []
        
        # Setup UI
        self.setup_ui()

    def setup_ui(self):
        """Initialize all UI components"""
        self.scene = QGraphicsScene()
        self.view = QGraphicsView(self.scene, self)
        self.view.setRenderHint(QPainter.Antialiasing, True)
        self.setCentralWidget(self.view)
        
        self.scene.setBackgroundBrush(QBrush(QColor(BACKGROUND_COLOR)))
        self.draw_board()
        self.draw_all_pieces()
        
        self.view.setMouseTracking(True)

    def draw_board(self):
        """Draw the board lines and vertex circles."""
        for row in range(BOARD_SIZE):
            for col in range(BOARD_SIZE):
                x = col * TILE_SIZE + TILE_SIZE // 2
                y = row * TILE_SIZE + TILE_SIZE // 2

                # Vertex circle
                ellipse = QGraphicsEllipseItem(
                    x - (PIECE_RADIUS / 2),
                    y - (PIECE_RADIUS / 2),
                    PIECE_RADIUS,
                    PIECE_RADIUS
                )
                ellipse.setBrush(QBrush(QColor("white")))
                ellipse.setPen(QPen(QColor(LINE_COLOR)))
                self.scene.addItem(ellipse)
                self.ui_board[row][col]["vertex"] = ellipse

                # Draw lines (horizontal, vertical, diagonals)
                if col < BOARD_SIZE - 1:  # horizontal
                    self.draw_line(x, y, x + TILE_SIZE, y)
                if row < BOARD_SIZE - 1:  # vertical
                    self.draw_line(x, y, x, y + TILE_SIZE)
                if col < BOARD_SIZE - 1 and row < BOARD_SIZE - 1:
                    self.draw_line(x, y, x + TILE_SIZE, y + TILE_SIZE)
                if col > 0 and row < BOARD_SIZE - 1:
                    self.draw_line(x, y, x - TILE_SIZE, y + TILE_SIZE)

    def draw_line(self, x1, y1, x2, y2):
        """Draw a single board line."""
        line = self.scene.addLine(x1, y1, x2, y2, QPen(QColor(LINE_COLOR), 1))
        return line

    def draw_all_pieces(self):
        """Render all pieces from the GameState onto the board."""
        for row in range(BOARD_SIZE):
            for col in range(BOARD_SIZE):
                piece_data = self.game_state.board[row][col]
                if piece_data is not None:
                    self.create_piece_item(row, col)

    def create_piece_item(self, row, col):
        """Create the visual items for a piece at the specified position."""
        piece_data = self.game_state.board[row][col]
        if piece_data is None:
            return

        x = col * TILE_SIZE + TILE_SIZE // 2
        y = row * TILE_SIZE + TILE_SIZE // 2

        # Main piece circle
        color = PIECE_COLORS[piece_data["color"]]
        piece_item = QGraphicsEllipseItem(
            x - (PIECE_RADIUS / 2),
            y - (PIECE_RADIUS / 2),
            PIECE_RADIUS,
            PIECE_RADIUS
        )
        piece_item.setBrush(QBrush(QColor(color)))
        piece_item.setPen(QPen(QColor("black")))
        piece_item.setZValue(1)  # Draw above the board

        # Direction indicator
        dir_item = self.create_direction_indicator(
            x, y, piece_data["orientation"], highlight=False
        )

        # Add to scene and store references
        self.scene.addItem(piece_item)
        self.scene.addItem(dir_item)
        
        self.ui_board[row][col]["piece_item"] = piece_item
        self.ui_board[row][col]["dir_item"] = dir_item

    def create_direction_indicator(self, x, y, orientation, highlight=False):
        """Create a line showing the piece's orientation."""
        vec_col, vec_row = DIRECTION_VECTORS[orientation]
        end_x = x + vec_col * (PIECE_RADIUS // 2)
        end_y = y + vec_row * (PIECE_RADIUS // 2)
        dir_line = self.scene.addLine(x, y, end_x, end_y)
        pen = QPen(QColor("lime" if highlight else "black"), 4 if highlight else 2)
        dir_line.setPen(pen)
        return dir_line

    def mousePressEvent(self, event):
        """Handle piece selection and movement."""
        scene_pos = self.view.mapToScene(event.pos())
        clicked_row = None
        clicked_col = None

        # Find clicked vertex
        for row in range(BOARD_SIZE):
            for col in range(BOARD_SIZE):
                if self.ui_board[row][col]["vertex"].isUnderMouse():
                    clicked_row = row
                    clicked_col = col
                    break
            if clicked_row is not None:
                break

        if clicked_row is None:
            return

        # Handle move if a piece is selected
        if self.selected_row is not None:
            if (clicked_row, clicked_col) in self.valid_moves:
                self.execute_move(clicked_row, clicked_col)
            else:
                self.deselect_piece()
            return

        # Handle new piece selection
        piece = self.game_state.board[clicked_row][clicked_col]
        if piece and piece["color"] == self.game_state.current_player:
            self.select_piece(clicked_row, clicked_col)

    def select_piece(self, row, col):
        """Select a piece and show its valid moves."""
        self.deselect_piece()
        self.selected_row = row
        self.selected_col = col
        self.highlight_piece_item(row, col, highlight=True)
        self.valid_moves = self.game_state.get_valid_moves(row, col)
        self.highlight_valid_moves()

    def deselect_piece(self):
        """Clear piece selection and highlights."""
        if self.selected_row is not None and self.selected_col is not None:
            self.highlight_piece_item(self.selected_row, self.selected_col, highlight=False)
        self.selected_row = None
        self.selected_col = None
        self.clear_highlights()
        self.valid_moves = []

    def highlight_piece_item(self, row, col, highlight=True):
        """Update the visual appearance of a selected/deselected piece."""
        piece_data = self.game_state.board[row][col]
        if not piece_data:
            return

        piece_item = self.ui_board[row][col].get("piece_item")
        dir_item = self.ui_board[row][col].get("dir_item")

        if not piece_item or not dir_item:
            return

        if highlight:
            piece_item.setBrush(QBrush(QColor("yellow")))
            dir_pen = QPen(QColor("lime"), 4)
        else:
            original_color = PIECE_COLORS[piece_data["color"]]
            piece_item.setBrush(QBrush(QColor(original_color)))
            dir_pen = QPen(QColor("black"), 2)

        dir_item.setPen(dir_pen)

    def execute_move(self, to_row, to_col):
        """Execute a move and update the UI."""
        if self.game_state.move_piece(self.selected_row, self.selected_col, to_row, to_col):
            # Remove captured piece visuals if any
            if self.game_state.board[to_row][to_col] is not None:
                self.remove_piece_visuals(to_row, to_col)
            
            # Update piece visuals
            self.remove_piece_visuals(self.selected_row, self.selected_col)
            self.create_piece_item(to_row, to_col)
            
            self.deselect_piece()
            self.game_state.end_turn()

    def remove_piece_visuals(self, row, col):
        """Remove piece graphics from the scene."""
        item_dict = self.ui_board[row][col]
        piece_item = item_dict.get("piece_item")
        dir_item = item_dict.get("dir_item")

        if piece_item and piece_item.scene() is self.scene:
            self.scene.removeItem(piece_item)
        if dir_item and dir_item.scene() is self.scene:
            self.scene.removeItem(dir_item)

        item_dict.pop("piece_item", None)
        item_dict.pop("dir_item", None)

    def highlight_valid_moves(self):
        """Highlight vertices that represent valid moves."""
        for (r, c) in self.valid_moves:
            vertex_item = self.ui_board[r][c]["vertex"]
            vertex_item.setBrush(QBrush(QColor("lime")))

    def clear_highlights(self):
        """Reset all vertex highlights."""
        for row in range(BOARD_SIZE):
            for col in range(BOARD_SIZE):
                vertex_item = self.ui_board[row][col]["vertex"]
                vertex_item.setBrush(QBrush(QColor("white")))

    def wheelEvent(self, event):
        """Handle piece rotation with mouse wheel."""
        if self.selected_row is None or self.selected_col is None:
            return

        delta = event.angleDelta().y()
        clockwise = delta > 0

        if self.game_state.rotate_piece(self.selected_row, self.selected_col, clockwise):
            self.update_direction_indicator(self.selected_row, self.selected_col, True)
            # Update valid moves after rotation
            self.valid_moves = self.game_state.get_valid_moves(self.selected_row, self.selected_col)
            self.clear_highlights()
            self.highlight_valid_moves()

    def update_direction_indicator(self, row, col, highlight=False):
        """Update the direction indicator for a piece."""
        piece_data = self.game_state.board[row][col]
        if not piece_data:
            return

        old_dir_item = self.ui_board[row][col].get("dir_item")
        if old_dir_item and old_dir_item.scene() is self.scene:
            self.scene.removeItem(old_dir_item)

        x = col * TILE_SIZE + TILE_SIZE // 2
        y = row * TILE_SIZE + TILE_SIZE // 2
        new_dir_item = self.create_direction_indicator(x, y, piece_data["orientation"], highlight)
        self.ui_board[row][col]["dir_item"] = new_dir_item