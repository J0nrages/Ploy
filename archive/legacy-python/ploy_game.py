import sys
from PyQt5.QtWidgets import QApplication, QMainWindow, QGraphicsScene, QGraphicsView, QGraphicsEllipseItem, QGraphicsLineItem
from PyQt5.QtGui import QBrush, QColor, QPen, QPainter
from PyQt5.QtCore import Qt
from datetime import datetime

# Define constants for the board and pieces
BOARD_SIZE = 9  # 9x9 grid
TILE_SIZE = 80
PIECE_RADIUS = 30
PIECE_COLORS = {"green": "green", "orange": "orange"}
BACKGROUND_COLOR = "#3b3b3b"
LINE_COLOR = "#a0a0a0"
PIECE_TYPES = {"Commander": 1, "Lance": 3, "Probe": 2, "Shield": 1}
DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
DIRECTION_VECTORS = {
    "N": (0, -1), "NE": (1, -1), "E": (1, 0), "SE": (1, 1),
    "S": (0, 1), "SW": (-1, 1), "W": (-1, 0), "NW": (-1, -1)
}

class PloyGame(QMainWindow):
    def __init__(self):
        super().__init__()
        self.selected_piece = None  # To track the selected piece
        self.board_state = [[None for _ in range(BOARD_SIZE)] for _ in range(BOARD_SIZE)]
        self.current_player = "green"  # Green starts the game
        self.valid_moves = []  # Highlight valid moves for the selected piece
        self.init_ui()

    def log_debug(self, message):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {message}")

    def init_ui(self):
        self.setWindowTitle("Ploy Game")
        self.setGeometry(100, 100, 800, 800)

        # Create a graphics scene and view
        self.scene = QGraphicsScene()
        self.view = QGraphicsView(self.scene, self)
        self.view.setRenderHint(QPainter.Antialiasing, True)
        self.setCentralWidget(self.view)

        # Set background color
        self.scene.setBackgroundBrush(QBrush(QColor(BACKGROUND_COLOR)))

        # Draw the game board
        self.draw_board()

        # Add initial pieces
        self.setup_pieces()

        # Enable mouse wheel events for rotation
        self.view.setMouseTracking(True)

    def draw_board(self):
        self.log_debug("Drawing board...")
        for row in range(BOARD_SIZE):
            for col in range(BOARD_SIZE):
                # Calculate the position for each circle
                x = col * TILE_SIZE + TILE_SIZE // 2
                y = row * TILE_SIZE + TILE_SIZE // 2

                # Draw the vertex as a circle
                ellipse = QGraphicsEllipseItem(
                    x - PIECE_RADIUS / 2, y - PIECE_RADIUS / 2, PIECE_RADIUS, PIECE_RADIUS
                )
                ellipse.setBrush(QBrush(QColor("white")))
                ellipse.setPen(QPen(QColor(LINE_COLOR)))
                self.scene.addItem(ellipse)

                # Assign coordinates like A1, B2, etc.
                position_label = f"{chr(65 + col)}{row + 1}"

                # Track the vertex position
                self.board_state[row][col] = {
                    "piece": None,
                    "position": (x, y),
                    "label": position_label,
                    "ellipse": ellipse  # Keep a reference to the ellipse for highlighting
                }

                # Draw paths (horizontal, vertical, diagonal)
                if col < BOARD_SIZE - 1:  # Horizontal
                    self.draw_line(x, y, x + TILE_SIZE, y)
                if row < BOARD_SIZE - 1:  # Vertical
                    self.draw_line(x, y, x, y + TILE_SIZE)
                if col < BOARD_SIZE - 1 and row < BOARD_SIZE - 1:  # Diagonal top-left to bottom-right
                    self.draw_line(x, y, x + TILE_SIZE, y + TILE_SIZE)
                if col > 0 and row < BOARD_SIZE - 1:  # Diagonal top-right to bottom-left
                    self.draw_line(x, y, x - TILE_SIZE, y + TILE_SIZE)

    def draw_line(self, x1, y1, x2, y2):
        line = QGraphicsLineItem(x1, y1, x2, y2)
        line.setPen(QPen(QColor(LINE_COLOR), 1))
        self.scene.addItem(line)

    def setup_pieces(self):
        self.log_debug("Setting up pieces...")
        # Add pieces for both players according to starting positions
        self.add_piece(0, 4, "green", "Commander", "N")  # Green Commander
        self.add_piece(8, 4, "orange", "Commander", "S")  # Orange Commander

        # Shields in front
        for col in range(2, 7, 2):
            self.add_piece(1, col, "green", "Shield", "N")
            self.add_piece(7, col, "orange", "Shield", "S")

        # Probes behind Shields
        for col in range(1, 8, 2):
            self.add_piece(0, col, "green", "Probe", "N")
            self.add_piece(8, col, "orange", "Probe", "S")

        # Lances at the edges
        self.add_piece(0, 0, "green", "Lance", "N")
        self.add_piece(0, 8, "green", "Lance", "N")
        self.add_piece(8, 0, "orange", "Lance", "S")
        self.add_piece(8, 8, "orange", "Lance", "S")

    def add_piece(self, row, col, color, piece_type, orientation):
        x, y = self.board_state[row][col]["position"]
        piece = QGraphicsEllipseItem(
            x - PIECE_RADIUS / 2, y - PIECE_RADIUS / 2, PIECE_RADIUS, PIECE_RADIUS
        )
        piece.setBrush(QBrush(QColor(PIECE_COLORS[color])))
        piece.setPen(QPen(QColor("black")))
        piece.setZValue(1)  # Ensure pieces are drawn above the board
        self.scene.addItem(piece)

        # Add direction indicator
        direction_indicator = self.create_direction_indicator(x, y, orientation, highlight=False)
        self.scene.addItem(direction_indicator)

        self.board_state[row][col]["piece"] = {
            "item": piece,
            "direction_indicator": direction_indicator,
            "type": piece_type,
            "color": color,
            "row": row,
            "col": col,
            "orientation": orientation
        }
        self.log_debug(f"Added {piece_type} at {self.board_state[row][col]['label']} facing {orientation}.")

    def create_direction_indicator(self, x, y, orientation, highlight=False):
        vector = DIRECTION_VECTORS[orientation]
        end_x = x + vector[0] * (PIECE_RADIUS // 2)
        end_y = y + vector[1] * (PIECE_RADIUS // 2)
        line = QGraphicsLineItem(x, y, end_x, end_y)
        pen = QPen(QColor("lime" if highlight else "black"), 4 if highlight else 2)
        line.setPen(pen)
        return line

    def highlight_valid_moves(self):
        self.log_debug("Highlighting valid moves...")
        # Clear previous highlights
        for row, col in self.valid_moves:
            self.board_state[row][col]["ellipse"].setBrush(QBrush(QColor("white")))
        self.valid_moves = []

        if not self.selected_piece:
            return

        piece_type = self.selected_piece["type"]
        orientation = self.selected_piece["orientation"]
        row, col = self.selected_piece["row"], self.selected_piece["col"]
        max_steps = PIECE_TYPES[piece_type]
        vector = DIRECTION_VECTORS[orientation]

        self.log_debug(f"Calculating valid moves for {piece_type} at {self.board_state[row][col]['label']} facing {orientation}...")

        # Calculate valid moves
        for step in range(1, max_steps + 1):
            new_row = row + step * vector[1]
            new_col = col + step * vector[0]

            if not (0 <= new_row < BOARD_SIZE and 0 <= new_col < BOARD_SIZE):
                break

            target_state = self.board_state[new_row][new_col]
            if target_state["piece"]:  # Stop at first occupied position
                if target_state["piece"]["color"] != self.selected_piece["color"]:
                    self.valid_moves.append((new_row, new_col))
                break

            self.valid_moves.append((new_row, new_col))

        # Highlight valid moves
        for row, col in self.valid_moves:
            self.board_state[row][col]["ellipse"].setBrush(QBrush(QColor("lime")))
            self.log_debug(f"Valid move: {self.board_state[row][col]['label']}")

    def mousePressEvent(self, event):
        position = self.view.mapToScene(event.pos())
        self.log_debug(f"Mouse clicked at scene position: {position.x()}, {position.y()}")

        for row in range(BOARD_SIZE):
            for col in range(BOARD_SIZE):
                ellipse = self.board_state[row][col]["ellipse"]
                if ellipse.isUnderMouse():
                    self.log_debug(f"Clicked on board vertex: {self.board_state[row][col]['label']}")
                    if self.selected_piece and (row, col) in self.valid_moves:
                        self.log_debug(f"Moving piece to: {self.board_state[row][col]['label']}")
                        self.move_piece(row, col)
                        return
                    elif self.board_state[row][col]["piece"] and self.board_state[row][col]["piece"]["color"] == self.current_player:
                        self.log_debug(f"Selecting piece at: {self.board_state[row][col]['label']}")
                        self.select_piece(row, col)
                        return

        # Deselect if clicked elsewhere
        self.log_debug("Deselecting piece.")
        self.deselect_piece()

    def select_piece(self, row, col):
        if self.selected_piece:  # Deselect current piece if another is selected
            self.log_debug("Deselecting current piece before selecting another.")
            self.deselect_piece()

        self.selected_piece = self.board_state[row][col]["piece"]
        self.selected_piece["item"].setBrush(QBrush(QColor("yellow")))
        self.scene.removeItem(self.selected_piece["direction_indicator"])
        x, y = self.board_state[row][col]["position"]
        self.selected_piece["direction_indicator"] = self.create_direction_indicator(
            x, y, self.selected_piece["orientation"], highlight=True
        )
        self.scene.addItem(self.selected_piece["direction_indicator"])
        self.highlight_valid_moves()
        self.log_debug(f"Selected {self.selected_piece['type']} at {self.board_state[row][col]['label']}.")

    def deselect_piece(self):
        if not self.selected_piece:
            return

        row, col = self.selected_piece["row"], self.selected_piece["col"]
        self.selected_piece["item"].setBrush(QBrush(QColor(PIECE_COLORS[self.selected_piece["color"]])))
        self.scene.removeItem(self.selected_piece["direction_indicator"])
        x, y = self.board_state[row][col]["position"]
        self.selected_piece["direction_indicator"] = self.create_direction_indicator(
            x, y, self.selected_piece["orientation"], highlight=False
        )
        self.scene.addItem(self.selected_piece["direction_indicator"])
        self.valid_moves = []  # Clear highlights
        self.selected_piece = None
        self.log_debug("Deselected piece.")

    def move_piece(self, target_row, target_col):
        if not self.selected_piece:
            self.log_debug("No piece selected to move.")
            return

        row, col = self.selected_piece["row"], self.selected_piece["col"]
        x, y = self.board_state[target_row][target_col]["position"]

        # Move the piece
        self.log_debug(f"Moving {self.selected_piece['type']} from {self.board_state[row][col]['label']} to {self.board_state[target_row][target_col]['label']}.")
        self.selected_piece["item"].setRect(
            x - PIECE_RADIUS / 2, y - PIECE_RADIUS / 2, PIECE_RADIUS, PIECE_RADIUS
        )
        self.scene.removeItem(self.selected_piece["direction_indicator"])
        self.selected_piece["direction_indicator"] = self.create_direction_indicator(
            x, y, self.selected_piece["orientation"], highlight=False
        )
        self.scene.addItem(self.selected_piece["direction_indicator"])

        # Update board state
        self.board_state[target_row][target_col]["piece"] = self.selected_piece
        self.board_state[row][col]["piece"] = None
        self.selected_piece["row"] = target_row
        self.selected_piece["col"] = target_col

        self.log_debug(f"Moved {self.selected_piece['type']} to {self.board_state[target_row][target_col]['label']}.")
        self.deselect_piece()
        self.end_turn()

    def wheelEvent(self, event):
        if not self.selected_piece:
            self.log_debug("No piece selected to rotate.")
            return

        # Rotate piece clockwise or counterclockwise
        delta = event.angleDelta().y()
        current_orientation = self.selected_piece["orientation"]
        current_index = DIRECTIONS.index(current_orientation)
        if delta > 0:  # Scroll up
            new_index = (current_index + 1) % len(DIRECTIONS)
        else:  # Scroll down
            new_index = (current_index - 1) % len(DIRECTIONS)

        new_orientation = DIRECTIONS[new_index]
        self.selected_piece["orientation"] = new_orientation
        self.log_debug(f"Rotated piece to face {new_orientation}.")

        # Update direction indicator
        row, col = self.selected_piece["row"], self.selected_piece["col"]
        x, y = self.board_state[row][col]["position"]
        self.scene.removeItem(self.selected_piece["direction_indicator"])
        self.selected_piece["direction_indicator"] = self.create_direction_indicator(
            x, y, new_orientation, highlight=True
        )
        self.scene.addItem(self.selected_piece["direction_indicator"])

    def end_turn(self):
        self.current_player = "orange" if self.current_player == "green" else "green"
        self.log_debug(f"It is now {self.current_player}'s turn.")

if __name__ == "__main__":
    app = QApplication(sys.argv)
    game = PloyGame()
    game.show()
    sys.exit(app.exec_())
