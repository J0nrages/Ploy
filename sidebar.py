# sidebar.py

from PyQt5.QtWidgets import (QDockWidget, QWidget, QVBoxLayout, QHBoxLayout, 
                           QLabel, QPushButton, QCheckBox, QFrame, QGridLayout,
                           QLineEdit, QColorDialog)
from PyQt5.QtCore import Qt
from PyQt5.QtGui import QColor

class PlayerConfig(QFrame):
    def __init__(self, position, name, color):
        super().__init__()
        self.setFrameShape(QFrame.StyledPanel)
        
        layout = QHBoxLayout(self)
        
        # Name input
        self.name_input = QLineEdit(name)
        self.name_input.setPlaceholderText(f"Player {position}")
        layout.addWidget(self.name_input)
        
        # Color button
        self.color = color
        self.color_btn = QPushButton()
        self.color_btn.setFixedSize(24, 24)
        self.update_color_button()
        self.color_btn.clicked.connect(self.choose_color)
        layout.addWidget(self.color_btn)
        
    def choose_color(self):
        color = QColorDialog.getColor(QColor(self.color))
        if color.isValid():
            self.color = color.name()
            self.update_color_button()
            
    def update_color_button(self):
        self.color_btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {self.color};
                border: 1px solid gray;
                border-radius: 4px;
            }}
        """)
        
    def get_config(self):
        return (self.name_input.text(), self.color)

class GameSidebar(QDockWidget):
    def __init__(self, parent=None):
        super().__init__("Game Controls", parent)
        self.setFeatures(QDockWidget.NoDockWidgetFeatures)
        self.setFixedWidth(200)
        
        # Create main widget and layout
        self.content = QWidget()
        self.main_layout = QVBoxLayout(self.content)
        self.main_layout.setSpacing(20)

        # Turn indicator will be added here by update_turn_indicator
        
        # Add top player's captures
        self.setup_captured_pieces_section("top")
        
        # Add separator
        self.add_separator()
        
        # Add Players Section
        self.setup_player_section()
        
        # Add separator
        self.add_separator()
        
        # Add Settings Section
        self.setup_settings_section()
        
        # Add separator
        self.add_separator()
        
        # Add bottom player's captures
        self.setup_captured_pieces_section("bottom")
        
        # Set the content widget
        self.setWidget(self.content)
        
    def setup_player_section(self):
        """Create the player configuration section"""
        player_frame = QFrame()
        player_frame.setFrameShape(QFrame.StyledPanel)
        player_layout = QVBoxLayout(player_frame)
        
        # Section Title
        title = QLabel("Players")
        title.setStyleSheet("font-weight: bold; font-size: 14px;")
        player_layout.addWidget(title)
        
        # Player configs
        self.player_configs = {
            "bottom": PlayerConfig("Bottom", "Player 1", "#32CD32"),  # Default lime green
            "top": PlayerConfig("Top", "Player 2", "#FFA500")        # Default orange
        }
        
        for config in self.player_configs.values():
            player_layout.addWidget(config)
            
        # Apply Button
        self.apply_btn = QPushButton("Apply Player Settings")
        self.apply_btn.clicked.connect(self.apply_player_settings)
        player_layout.addWidget(self.apply_btn)
        
        self.main_layout.addWidget(player_frame)
        
    def setup_settings_section(self):
        """Create the settings section"""
        settings_frame = QFrame()
        settings_frame.setFrameShape(QFrame.StyledPanel)
        settings_layout = QVBoxLayout(settings_frame)
        
        # Settings Title
        settings_title = QLabel("Settings")
        settings_title.setStyleSheet("font-weight: bold; font-size: 14px;")
        settings_layout.addWidget(settings_title)
        
        # Bottom Position Toggle
        position_layout = QHBoxLayout()
        self.green_top_checkbox = QCheckBox("Flip Bottom Player to Top")
        self.green_top_checkbox.setChecked(False)
        position_layout.addWidget(self.green_top_checkbox)
        settings_layout.addLayout(position_layout)
        
        # Flip Board Button
        self.flip_board_btn = QPushButton("Flip Board")
        settings_layout.addWidget(self.flip_board_btn)
        
        self.main_layout.addWidget(settings_frame)
        
    def setup_captured_pieces_section(self, position):
        """Create a captured pieces section for a single player"""
        if not hasattr(self, 'capture_grids'):
            self.capture_grids = {}
            
        captures_frame = QFrame()
        captures_frame.setFrameShape(QFrame.StyledPanel)
        captures_layout = QVBoxLayout(captures_frame)
        
        # Player Label
        captures_title = QLabel(f"{position.title()} Player's Captured Pieces")
        captures_title.setStyleSheet(f"color: {'orange' if position == 'top' else 'green'};")
        captures_layout.addWidget(captures_title)
        
        # Captures Grid
        grid = QGridLayout()
        self.setup_captures_grid(grid)
        captures_layout.addLayout(grid)
        self.capture_grids[position] = grid
        
        self.main_layout.addWidget(captures_frame)
        
    def setup_captures_grid(self, grid_layout):
        """Initialize an empty captures grid"""
        for row in range(3):
            for col in range(4):
                placeholder = QLabel()
                placeholder.setFixedSize(30, 30)
                placeholder.setStyleSheet("background: transparent;")
                grid_layout.addWidget(placeholder, row, col)
                
    def add_separator(self):
        """Add a horizontal separator line"""
        separator = QFrame()
        separator.setFrameShape(QFrame.HLine)
        separator.setFrameShadow(QFrame.Sunken)
        self.main_layout.addWidget(separator)
                
    def apply_player_settings(self):
        """Apply the current player configuration settings"""
        configs = {pos: config.get_config() 
                  for pos, config in self.player_configs.items()}
        
        # Signal the main UI to update player settings
        if hasattr(self.parent(), "update_player_settings"):
            self.parent().update_player_settings(configs)
                
    def update_captures(self, captured_pieces):
        """Update the captured pieces display"""
        for position, pieces in captured_pieces.items():
            grid = self.capture_grids.get(position)
            if grid:
                self.clear_grid(grid)
                self.update_capture_grid(grid, pieces, self.player_configs[position].color)
        
    def clear_grid(self, grid):
        """Clear all pieces from a capture grid"""
        for i in range(grid.count()):
            widget = grid.itemAt(i).widget()
            if widget:
                widget.setText("")
                widget.setStyleSheet("background: transparent;")
                
    def update_capture_grid(self, grid, pieces, color):
        """Update a single capture grid with pieces"""
        for i, piece in enumerate(pieces):
            if i >= grid.count():
                break
                
            row = i // 4
            col = i % 4
            
            widget = grid.itemAt(row * 4 + col).widget()
            if widget:
                widget.setText(piece['type'][0])  # First letter of piece type
                widget.setStyleSheet(f"""
                    background-color: {color};
                    border-radius: 15px;
                    padding: 5px;
                    border: 1px solid gray;
                    color: white;
                """)
                widget.setAlignment(Qt.AlignCenter)

    def update_turn_indicator(self, current_player):
        """
        Update the turn indicator in the sidebar to display the current player's name and color.
        :param current_player: The current player object.
        """
        # Create or update a label for turn indicator
        if not hasattr(self, 'turn_indicator_label'):
            self.turn_indicator_label = QLabel()
            self.turn_indicator_label.setAlignment(Qt.AlignCenter)
            self.turn_indicator_label.setStyleSheet("font-weight: bold; font-size: 16px;")
            self.main_layout.insertWidget(0, self.turn_indicator_label)
        self.turn_indicator_label.setText(f"It's {current_player.name}'s Turn!")
        self.turn_indicator_label.setStyleSheet(f"""
            font-weight: bold; 
            font-size: 16px; 
            color: {current_player.color};
        """)