# ui_board.py

from PyQt5.QtWidgets import QGraphicsEllipseItem
from PyQt5.QtGui import QBrush, QColor, QPen

class BoardRenderer:
    def __init__(self, scene, tile_size, piece_radius, background_color, line_color):
        self.scene = scene
        self.TILE_SIZE = tile_size
        self.PIECE_RADIUS = piece_radius
        self.BACKGROUND_COLOR = background_color
        self.LINE_COLOR = line_color

    def draw_board(self, board_size, ui_board):
        """Draw the board lines and vertex circles."""
        for row in range(board_size):
            for col in range(board_size):
                x = col * self.TILE_SIZE + self.TILE_SIZE // 2
                y = row * self.TILE_SIZE + self.TILE_SIZE // 2

                # Vertex circle
                ellipse = QGraphicsEllipseItem(
                    x - (self.PIECE_RADIUS / 2),
                    y - (self.PIECE_RADIUS / 2),
                    self.PIECE_RADIUS,
                    self.PIECE_RADIUS
                )
                ellipse.setBrush(QBrush(QColor("white")))
                ellipse.setPen(QPen(QColor(self.LINE_COLOR)))
                self.scene.addItem(ellipse)
                ui_board[row][col]["vertex"] = ellipse

                # Draw lines (horizontal, vertical, diagonals)
                if col < board_size - 1:  # horizontal
                    self.draw_line(x, y, x + self.TILE_SIZE, y)
                if row < board_size - 1:  # vertical
                    self.draw_line(x, y, x, y + self.TILE_SIZE)
                if col < board_size - 1 and row < board_size - 1:
                    self.draw_line(x, y, x + self.TILE_SIZE, y + self.TILE_SIZE)
                if col > 0 and row < board_size - 1:
                    self.draw_line(x, y, x - self.TILE_SIZE, y + self.TILE_SIZE)

    def draw_line(self, x1, y1, x2, y2):
        """Draw a single board line."""
        line = self.scene.addLine(x1, y1, x2, y2, QPen(QColor(self.LINE_COLOR), 1))
        return line

    def highlight_valid_moves(self, valid_moves, ui_board):
        """Highlight vertices that represent valid moves."""
        self.clear_highlights(ui_board)
        for (r, c) in valid_moves:
            vertex_item = ui_board[r][c]["vertex"]
            vertex_item.setBrush(QBrush(QColor("lime")))
            vertex_item.setZValue(1)
            vertex_item.setPen(QPen(QColor("lime")))

    def clear_highlights(self, ui_board):
        """Reset all vertex highlights."""
        for row in ui_board:
            for cell in row:
                vertex_item = cell.get("vertex")
                if vertex_item:
                    vertex_item.setBrush(QBrush(QColor("white")))