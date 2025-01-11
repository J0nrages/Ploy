# debugging_utils.py

"""
This module handles all debugging-related functionality, including logging and diagnostics.
"""

from datetime import datetime

class DebugLogger:
    def __init__(self, log_file=None):
        """
        Initialize the DebugLogger.

        :param log_file: Optional path to a log file to save messages.
        :param suppress_qt: Whether to suppress Qt-related messages
        """
        self.log_file = log_file
        self.last_message = None  # Track last message to avoid duplicates

    def log_debug(self, message):
        """
        Log a debug message with a timestamp.
        Filters out QGraphicsScene messages unless they're errors.
        
        :param message: The message to log.
        """
        # Skip QGraphicsScene messages unless they contain 'error' or 'failed'
        if "QGraphicsScene" in message and not any(x in message.lower() for x in ['error', 'failed', 'failure']):
            return

        # Avoid duplicate messages
        if message == self.last_message:
            return
            
        timestamp = datetime.now().strftime('%H:%M:%S')
        log_message = f"[{timestamp}] {message}"
        print(log_message)
        
        if self.log_file:
            with open(self.log_file, 'a') as file:
                file.write(log_message + '\n')
                
        self.last_message = message

    def log_piece_selection(self, piece_data, row, col):
        """
        Log piece selection with detailed information.
        
        :param piece_data: Dictionary containing piece information
        :param row: Row position
        :param col: Column position
        """
        if not piece_data:
            return
            
        message = (f"Selected {piece_data['type']} at ({row},{col}) - "
                  f"{piece_data['color']} piece facing {piece_data['orientation']}")
        self.log_debug(message)

    def log_piece_move(self, piece_data, from_row, from_col, to_row, to_col):
        """
        Log piece movement with detailed information.
        
        :param piece_data: Dictionary containing piece information
        :param from_row: Starting row
        :param from_col: Starting column
        :param to_row: Destination row
        :param to_col: Destination column
        """
        if not piece_data:
            return
            
        message = (f"Moving {piece_data['type']} from ({from_row},{from_col}) "
                  f"to ({to_row},{to_col})")
        self.log_debug(message)

    def log_piece_rotation(self, piece_data, row, col, new_orientation):
        """
        Log piece rotation with detailed information.
        
        :param piece_data: Dictionary containing piece information
        :param row: Row position
        :param col: Column position
        :param new_orientation: New orientation after rotation
        """
        if not piece_data:
            return
            
        message = (f"Rotated {piece_data['type']} at ({row},{col}) "
                  f"to face {new_orientation}")
        self.log_debug(message)
        
# Usage example:
# logger = DebugLogger("debug.log")
# logger.log_debug("This is a debug message.")
