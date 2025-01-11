# pieces.py

"""
This module defines piece-related constants and any piece-specific logic.
You could also define Piece classes if you prefer an OOP approach.
"""

# Board dimensions
BOARD_SIZE = 9

PIECE_COLORS = {"green": "green", "orange": "orange"}

# Types and the maximum movement steps associated with them
PIECE_TYPES = {
    "Commander": 1,
    "Lance": 3,
    "Probe": 2,
    "Shield": 1
}

# Possible orientations
DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

# Vectors for each orientation: row increment, column increment
DIRECTION_VECTORS = {
    "N": (0, -1),
    "NE": (1, -1),
    "E": (1, 0),
    "SE": (1, 1),
    "S": (0, 1),
    "SW": (-1, 1),
    "W": (-1, 0),
    "NW": (-1, -1)
}