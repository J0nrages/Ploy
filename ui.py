# ui.py

"""
This module coordinates between the board renderer, piece renderer, and game state,
handling user input and game flow.
"""

import sys
from PyQt5.QtWidgets import (QMainWindow, QGraphicsScene, QGraphicsView, 
                           QMessageBox, QHBoxLayout, QWidget)
from PyQt5.QtGui import QBrush, QColor, QPainter
from PyQt5.QtCore import Qt
from pieces import BOARD_SIZE
from game_state import GameState
from sidebar import GameSidebar
from ui_board import BoardRenderer
from ui_pieces import PieceRenderer

TILE_SIZE = 80
PIECE_RADIUS = 30
BACKGROUND_COLOR = "#3b3b3b"
LINE_COLOR = "#a0a0a0"

class PloyGameUI(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Ploy Game")
        self.setGeometry(100, 100, 1000, 800)
        
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
        # Create central widget and layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QHBoxLayout(central_widget)
        
        # Setup scene and view
        self.scene = QGraphicsScene()
        self.view = QGraphicsView(self.scene)
        self.view.setRenderHint(QPainter.Antialiasing, True)
        self.view.setMinimumSize(800, 800)
        self.view.setSceneRect(-50, -50, 900, 900)
        layout.addWidget(self.view)
        
        # Initialize renderers
        self.board_renderer = BoardRenderer(self.scene, TILE_SIZE, PIECE_RADIUS, 
                                          BACKGROUND_COLOR, LINE_COLOR)
        self.piece_renderer = PieceRenderer(self.scene, TILE_SIZE, PIECE_RADIUS)
        
        # Create and add sidebar
        self.sidebar = GameSidebar(self)
        self.addDockWidget(Qt.RightDockWidgetArea, self.sidebar)
        self.sidebar.green_top_checkbox.stateChanged.connect(self.handle_orientation_change)
        self.sidebar.flip_board_btn.clicked.connect(self.handle_board_flip)
        
        # Initialize board
        self.scene.setBackgroundBrush(QBrush(QColor(BACKGROUND_COLOR)))
        self.redraw_board()
        
        self.view.setMouseTracking(True)

    def show_commander_dialog(self, action_type):
        """Show confirmation dialog for Commander actions"""
        msg = QMessageBox(self)
        msg.setWindowTitle("Commander Action")
        
        if action_type == "move":
            msg.setText("Confirm Commander Movement")
            msg.setInformativeText(
                "Moving your Commander will use your action for this turn. "
                "You won't be able to rotate after moving."
            )
        else:  # rotate
            msg.setText("Confirm Commander Rotation")
            msg.setInformativeText(
                "Rotating your Commander will use your action for this turn. "
                "You won't be able to move after rotating."
            )
        
        msg.setStandardButtons(QMessageBox.Ok | QMessageBox.Cancel)
        msg.setDefaultButton(QMessageBox.Cancel)
        
        return msg.exec_() == QMessageBox.Ok

    def handle_orientation_change(self, state):
        """Handle green-on-top checkbox state change"""
        self.game_state.is_green_on_top = bool(state)
        self.game_state.initialize_board()
        self.redraw_board()

    def handle_board_flip(self):
        """Handle the flip board button click"""
        self.game_state.flip_board_orientation()
        self.redraw_board()

    def redraw_board(self):
        """Redraw the entire game board"""
        saved_selection = (self.selected_row, self.selected_col)
        self.scene.clear()
        self.ui_board = [[{} for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        
        # Draw board and pieces
        self.board_renderer.draw_board(BOARD_SIZE, self.ui_board)
        self.draw_all_pieces()
        
        # Restore selection if there was one
        if saved_selection[0] is not None:
            self.select_piece(saved_selection[0], saved_selection[1])

    def draw_all_pieces(self):
        """Draw all pieces on the board"""
        for row in range(BOARD_SIZE):
            for col in range(BOARD_SIZE):
                piece_data = self.game_state.board[row][col]
                if piece_data is not None:
                    self.piece_renderer.create_piece_item(row, col, piece_data, self.ui_board)

    def mousePressEvent(self, event):
        """Handle piece selection and movement"""
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
            self.game_state.logger.log_piece_selection(piece, clicked_row, clicked_col)
            self.select_piece(clicked_row, clicked_col)

    def select_piece(self, row, col):
        """Select a piece and show its valid moves"""
        self.deselect_piece()
        self.selected_row = row
        self.selected_col = col
        piece_data = self.game_state.board[row][col]
        self.piece_renderer.highlight_piece(row, col, piece_data, self.ui_board, True)
        self.valid_moves = self.game_state.get_valid_moves(row, col)
        self.board_renderer.highlight_valid_moves(self.valid_moves, self.ui_board)

    def deselect_piece(self):
        """Clear piece selection and highlights"""
        if self.selected_row is not None and self.selected_col is not None:
            piece_data = self.game_state.board[self.selected_row][self.selected_col]
            self.piece_renderer.highlight_piece(
                self.selected_row, self.selected_col, 
                piece_data, self.ui_board, False
            )
        self.selected_row = None
        self.selected_col = None
        self.board_renderer.clear_highlights(self.ui_board)
        self.valid_moves = []

    def execute_move(self, to_row, to_col):
        """Execute a move and update the UI"""
        piece_data = self.game_state.board[self.selected_row][self.selected_col]
        if not piece_data:
            return

        # Handle Commander movement differently
        if piece_data["type"] == "Commander":
            if not self.show_commander_dialog("move"):
                self.deselect_piece()
                return

        if self.game_state.move_piece(self.selected_row, self.selected_col, to_row, to_col):
            # Log the move
            self.game_state.logger.log_piece_move(
                piece_data, 
                self.selected_row, 
                self.selected_col, 
                to_row, 
                to_col
            )

            # Update visual elements
            old_piece_data = self.game_state.board[to_row][to_col]
            if old_piece_data is not None:
                self.piece_renderer.remove_piece_visuals(to_row, to_col, self.ui_board)
            
            self.piece_renderer.remove_piece_visuals(self.selected_row, self.selected_col, self.ui_board)
            self.piece_renderer.create_piece_item(to_row, to_col, piece_data, self.ui_board)
            
            # Update captured pieces display
            self.sidebar.update_captures(self.game_state.get_captured_pieces())
            
            self.deselect_piece()
            self.game_state.end_turn()
            self.sidebar.update_turn_indicator(self.game_state.current_player)

    def wheelEvent(self, event):
        """Handle piece rotation with mouse wheel"""
        if self.selected_row is None or self.selected_col is None:
            return

        delta = event.angleDelta().y()
        clockwise = delta > 0
        
        piece_data = self.game_state.board[self.selected_row][self.selected_col]
        if not piece_data:
            return

        # Handle Commander rotation differently
        if piece_data["type"] == "Commander":
            if not self.show_commander_dialog("rotate"):
                return

        if self.game_state.rotate_piece(self.selected_row, self.selected_col, clockwise):
            # Log rotation
            self.game_state.logger.log_piece_rotation(
                piece_data,
                self.selected_row,
                self.selected_col,
                piece_data["orientation"]
            )
            
            # Update visuals
            self.piece_renderer.update_direction_indicator(
                self.selected_row, 
                self.selected_col, 
                piece_data,
                self.ui_board,
                True
            )
            
            # Update valid moves
            self.board_renderer.clear_highlights(self.ui_board)
            self.valid_moves = self.game_state.get_valid_moves(
                self.selected_row, 
                self.selected_col
            )
            self.board_renderer.highlight_valid_moves(self.valid_moves, self.ui_board)
            
            # Update turn display if needed
            if piece_data["type"] != "Shield":
                self.sidebar.update_turn_indicator(self.game_state.current_player)

    def resizeEvent(self, event):
        """Handle window resize"""
        super().resizeEvent(event)
        if hasattr(self, 'view'):
            self.view.setSceneRect(self.scene.itemsBoundingRect())
            self.view.fitInView(self.scene.itemsBoundingRect(), Qt.KeepAspectRatio)