"""
debugging_utils.py

This module handles all debugging-related functionality, including logging and diagnostics.
"""

from datetime import datetime

class DebugLogger:
    def __init__(self, log_file=None):
        """
        Initialize the DebugLogger.

        :param log_file: Optional path to a log file to save messages.
        """
        self.log_file = log_file

    def log_debug(self, message):
        """
        Log a debug message with a timestamp.

        :param message: The message to log.
        """
        timestamp = datetime.now().strftime('%H:%M:%S')
        log_message = f"[{timestamp}] {message}"
        print(log_message)
        if self.log_file:
            with open(self.log_file, 'a') as file:
                file.write(log_message + '\n')

# Usage example:
# logger = DebugLogger("debug.log")
# logger.log_debug("This is a debug message.")
