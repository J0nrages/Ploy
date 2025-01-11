# ui_pieces.py

from PyQt5.QtWidgets import QGraphicsEllipseItem
from PyQt5.QtGui import QBrush, QColor, QPen
from pieces import PIECE_COLORS, DIRECTION_VECTORS

class PieceRenderer:
    def __init__(self, scene, tile_size, piece_radius):
        self.scene = scene
        self.TILE_SIZE = tile_size
        self.PIECE_RADIUS = piece_radius

    def create_piece_item(self, row, col, piece_data, ui_board):
        """Create the visual items for a piece at the specified position."""
        if piece_data is None:
            return

        x = col * self.TILE_SIZE + self.TILE_SIZE // 2
        y = row * self.TILE_SIZE + self.TILE_SIZE // 2

        # Main piece circle
        color = PIECE_COLORS[piece_data["color"]]
        piece_item = QGraphicsEllipseItem(
            x - (self.PIECE_RADIUS / 2),
            y - (self.PIECE_RADIUS / 2),
            self.PIECE_RADIUS,
            self.PIECE_RADIUS
        )
        piece_item.setBrush(QBrush(QColor(color)))
        piece_item.setPen(QPen(QColor("black")))
        piece_item.setZValue(2)

        # Direction indicator
        dir_item = self.create_direction_indicator(
            x, y, piece_data["orientation"], piece_data["type"], highlight=False
        )

        self.scene.addItem(piece_item)
        self.scene.addItem(dir_item)
        
        ui_board[row][col]["piece_item"] = piece_item
        ui_board[row][col]["dir_item"] = dir_item

    def create_direction_indicator(self, x, y, orientation, piece_type, highlight=False):
        """Create a line showing the piece's orientation."""
        # Use the orientation string directly to get the vector
        row_inc, col_inc = DIRECTION_VECTORS[orientation]
        
        # Adjust line length based on piece type
        scale = self.PIECE_RADIUS * 0.75  # Default length
        if piece_type == "Commander":
            scale = self.PIECE_RADIUS * 0.9
        elif piece_type == "Lance":
            scale = self.PIECE_RADIUS * 0.8
        elif piece_type == "Probe":
            scale = self.PIECE_RADIUS * 0.7
            
        end_x = x + col_inc * scale
        end_y = y + row_inc * scale
        
        dir_line = self.scene.addLine(x, y, end_x, end_y)
        pen = QPen(QColor("lime" if highlight else "black"), 4 if highlight else 2)
        dir_line.setPen(pen)
        dir_line.setZValue(3)
        return dir_line

    def update_direction_indicator(self, row, col, piece_data, ui_board, highlight=False):
        """Update the direction indicator for a piece."""
        if not piece_data:
            return

        old_dir_item = ui_board[row][col].get("dir_item")
        if old_dir_item and old_dir_item.scene() is self.scene:
            self.scene.removeItem(old_dir_item)

        x = col * self.TILE_SIZE + self.TILE_SIZE // 2
        y = row * self.TILE_SIZE + self.TILE_SIZE // 2
        
        # Adjust orientation based on board flip if needed
        orientation = piece_data["orientation"]
        if piece_data.get("flipped", False):
            # Map orientations to their opposite when board is flipped
            orientation_map = {
                "N": "S", "S": "N",
                "E": "W", "W": "E",
                "NE": "SW", "SW": "NE",
                "NW": "SE", "SE": "NW"
            }
            orientation = orientation_map[orientation]
            
        new_dir_item = self.create_direction_indicator(
            x, y, orientation, piece_data["type"], highlight
        )
        ui_board[row][col]["dir_item"] = new_dir_item

    def highlight_piece(self, row, col, piece_data, ui_board, highlight=True):
        """Update the visual appearance of a selected/deselected piece."""
        if not piece_data:
            return

        piece_item = ui_board[row][col].get("piece_item")
        dir_item = ui_board[row][col].get("dir_item")

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

    def remove_piece_visuals(self, row, col, ui_board):
        """Remove piece graphics from the scene."""
        item_dict = ui_board[row][col]
        piece_item = item_dict.get("piece_item")
        dir_item = item_dict.get("dir_item")

        if piece_item and piece_item.scene() is self.scene:
            self.scene.removeItem(piece_item)
        if dir_item and dir_item.scene() is self.scene:
            self.scene.removeItem(dir_item)

        item_dict.pop("piece_item", None)
        item_dict.pop("dir_item", None)