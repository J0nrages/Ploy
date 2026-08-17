# main.py

"""
The main entry point for running the Ploy Game. 
It creates the QApplication and launches the PloyGameUI.
"""

import sys
from PyQt5.QtWidgets import QApplication
from ui import PloyGameUI

def main():
    app = QApplication(sys.argv)
    game_ui = PloyGameUI()
    game_ui.show()
    sys.exit(app.exec_())

if __name__ == "__main__":
    main()
