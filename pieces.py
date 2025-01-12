# pieces.py

"""
This module defines piece-related constants and any piece-specific logic.
You could also define Piece classes if you prefer an OOP approach.
"""

# Board dimensions
BOARD_SIZE = 9

PIECE_COLORS = {
    "#32CD32": "green",       # Lime Green
    "#FFA500": "orange",      # Orange
    "#4169E1": "royalblue",   # Royal Blue
    "#DC143C": "crimson",     # Crimson
}

# Types and the maximum movement steps associated with them
PIECE_TYPES = {
    "Commander": 1,
    "Lance": 3,
    "Probe": 2,
    "Shield": 1
}

# Possible orientations
DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

# Vectors for each orientation: (row_increment, column_increment)
DIRECTION_VECTORS = {
    "N": (-1, 0),   # Move up (decrease row)
    "NE": (-1, 1),  # Move up and right
    "E": (0, 1),    # Move right (increase column)
    "SE": (1, 1),   # Move down and right
    "S": (1, 0),    # Move down (increase row)
    "SW": (1, -1),  # Move down and left
    "W": (0, -1),   # Move left (decrease column)
    "NW": (-1, -1)  # Move up and left
}
