import sys
from PyQt5.QtWidgets import (
    QMainWindow, QGraphicsScene, QGraphicsView, QMessageBox, QHBoxLayout, QWidget, QLabel, QPushButton, QVBoxLayout, QComboBox
)
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
        self.setGeometry(100, 100, 1200, 900)

        # Initialize the game state
        self.game_state = None
        self.ui_board = [[{} for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]

        self.selected_row = None
        self.selected_col = None
        self.valid_moves = []

        self.setup_game_mode_selection()

    def setup_game_mode_selection(self):
        """Show a dialog for selecting the game mode."""
        self.mode_selection_widget = QWidget()
        layout = QVBoxLayout(self.mode_selection_widget)

        layout.addWidget(QLabel("Select Game Mode:"))

        self.mode_selector = QComboBox()
        self.mode_selector.addItems(["1-Player (AI)", "2-Player", "4-Player"])
        layout.addWidget(self.mode_selector)

        start_button = QPushButton("Start Game")
        start_button.clicked.connect(self.start_game)
        layout.addWidget(start_button)

        self.setCentralWidget(self.mode_selection_widget)

    def start_game(self):
        """Initialize the game based on the selected mode."""
        selected_mode = self.mode_selector.currentText()
        game_mode = "2player" if selected_mode == "2-Player" else "4player"
        self.game_state = GameState(game_mode=game_mode)
        if selected_mode == "1-Player (AI)":
            self.game_state.players["top"].is_ai = True

        self.setup_ui()  # Proceed to the main UI

    def setup_ui(self):
        """Initialize all UI components."""
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QHBoxLayout(central_widget)

        # Setup scene and view
        self.scene = QGraphicsScene()
        self.view = QGraphicsView(self.scene)
        self.view.setRenderHint(QPainter.Antialiasing, True)
        self.view.setMinimumSize(1000, 900)
        self.view.setSceneRect(-50, -50, 1000, 1000)
        layout.addWidget(self.view)

        # Initialize renderers
        self.board_renderer = BoardRenderer(
            self.scene, TILE_SIZE, PIECE_RADIUS, BACKGROUND_COLOR, LINE_COLOR
        )
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

    def redraw_board(self):
        """Redraw the entire game board."""
        saved_selection = (self.selected_row, self.selected_col)
        self.scene.clear()
        self.ui_board = [[{} for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]

        # Debugging to check board state
        if not any(any(row) for row in self.game_state.board):
            print("DEBUG: Board is empty. Check GameState initialization.")

        # Draw board and pieces
        self.board_renderer.draw_board(BOARD_SIZE, self.ui_board)
        self.draw_all_pieces()

        if saved_selection[0] is not None:
            self.select_piece(saved_selection[0], saved_selection[1])


    def draw_all_pieces(self):
        """Draw all pieces on the board."""
        for row in range(BOARD_SIZE):
            for col in range(BOARD_SIZE):
                piece_data = self.game_state.board[row][col]
                if piece_data is not None:
                    self.piece_renderer.create_piece_item(row, col, piece_data, self.ui_board)

    def mousePressEvent(self, event):
        """Handle piece selection and movement."""
        clicked_row, clicked_col = self.get_clicked_cell(event)

        if clicked_row is None:
            return

        if self.selected_row is not None:
            if (clicked_row, clicked_col) in self.valid_moves:
                self.execute_move(clicked_row, clicked_col)
            else:
                self.deselect_piece()
            return

        piece = self.game_state.board[clicked_row][clicked_col]
        if piece and piece["position"] == self.game_state.current_player_position:
            self.select_piece(clicked_row, clicked_col)

    def get_clicked_cell(self, event):
        """Identify the clicked cell on the board."""
        for row in range(BOARD_SIZE):
            for col in range(BOARD_SIZE):
                if self.ui_board[row][col]["vertex"].isUnderMouse():
                    return row, col
        return None, None

    def select_piece(self, row, col):
        """Select a piece and show its valid moves."""
        self.deselect_piece()
        self.selected_row = row
        self.selected_col = col
        piece_data = self.game_state.board[row][col]
        self.piece_renderer.highlight_piece(row, col, piece_data, self.ui_board, True)
        self.valid_moves = self.game_state.get_valid_moves(row, col)
        self.board_renderer.highlight_valid_moves(self.valid_moves, self.ui_board)

    def deselect_piece(self):
        """Clear piece selection and highlights."""
        if self.selected_row is not None and self.selected_col is not None:
            piece_data = self.game_state.board[self.selected_row][self.selected_col]
            self.piece_renderer.highlight_piece(
                self.selected_row, self.selected_col, piece_data, self.ui_board, False
            )
        self.selected_row = None
        self.selected_col = None
        self.board_renderer.clear_highlights(self.ui_board)
        self.valid_moves = []

    def execute_move(self, to_row, to_col):
        """Execute a move and update the UI."""
        if self.game_state.move_piece(self.selected_row, self.selected_col, to_row, to_col):
            self.update_ui_after_move(to_row, to_col)

    def update_ui_after_move(self, to_row, to_col):
        """Update the UI after a move is executed."""
        piece_data = self.game_state.board[to_row][to_col]
        self.piece_renderer.remove_piece_visuals(
            self.selected_row, self.selected_col, self.ui_board
        )
        self.piece_renderer.create_piece_item(to_row, to_col, piece_data, self.ui_board)

        self.sidebar.update_captures(self.game_state.get_captured_pieces())
        self.deselect_piece()
        self.game_state.end_turn()
        self.sidebar.update_turn_indicator(self.game_state.get_current_player())

    def handle_orientation_change(self, state):
        """Handle green-on-top checkbox state change."""
        self.game_state.is_bottom_on_top = bool(state)
        self.game_state.initialize_board()
        self.redraw_board()

    def handle_board_flip(self):
        """Handle board flip."""
        self.game_state.flip_board_orientation()
        self.redraw_board()

    def resizeEvent(self, event):
        """Handle window resize."""
        super().resizeEvent(event)
        if hasattr(self, 'view'):
            self.view.setSceneRect(self.scene.itemsBoundingRect())
            self.view.fitInView(self.scene.itemsBoundingRect(), Qt.KeepAspectRatio)

    def show_commander_dialog(self, action_type):
        """Show a confirmation dialog for Commander actions."""
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
        return msg.exec_() == QMessageBox.Ok
