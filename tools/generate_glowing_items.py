#!/usr/bin/env python3
"""
Generate all glowing staff item definitions for both behavior and resource packs.

Run from repo root:
    python3 tools/generate_glowing_items.py
"""
import json
import os

colors = [
    'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime',
    'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue',
    'brown', 'green', 'red', 'black'
]

def create_bp_item(color):
    """Create behavior pack item JSON for glowing staff."""
    return {
        "format_version": "1.20.50",
        "minecraft:item": {
            "description": {
                "identifier": f"smellyblox:smelly_staff_{color}_glow",
                "menu_category": {
                    "category": "equipment"
                }
            },
            "components": {
                "minecraft:icon": {
                    "texture": f"smelly_staff_{color}_glow"
                },
                "minecraft:render_offsets": {
                    "first_person": {
                        "right": {"position": [0.6, -0.5, -0.6], "rotation": [-10, 0, -10], "scale": 0.6},
                        "left": {"position": [-0.6, -0.5, -0.6], "rotation": [-10, 0, 10], "scale": 0.6}
                    },
                    "third_person": {
                        "right": {"position": [0.2, 0.9, -0.2], "rotation": [0, 0, 0], "scale": 0.75},
                        "left": {"position": [-0.2, 0.9, -0.2], "rotation": [0, 0, 0], "scale": 0.75}
                    },
                    "gui": {"position": [0, 0, 0], "scale": 1.0}
                },
                "minecraft:display_name": {
                    "value": f"item.smellyblox:smelly_staff_{color}_glow"
                },
                "minecraft:max_stack_size": 1,
                "minecraft:hand_equipped": True,
                "minecraft:allow_off_hand": True,
                "minecraft:light_emission": 10,
                "minecraft:item_component": True
            }
        }
    }

def create_rp_item(color):
    """Create resource pack item JSON for glowing staff."""
    return {
        "format_version": "1.10",
        "minecraft:item": {
            "description": {
                "identifier": f"smellyblox:smelly_staff_{color}_glow",
                "category": "Equipment"
            },
            "components": {
                "minecraft:icon": f"smelly_staff_{color}_glow",
                "minecraft:render_offsets": "handheld"
            }
        }
    }

def main():
    bp_dir = os.path.join('SmellyBlox_BP', 'items')
    rp_dir = os.path.join('SmellyBlox_RP', 'items')
    
    os.makedirs(bp_dir, exist_ok=True)
    os.makedirs(rp_dir, exist_ok=True)
    
    for color in colors:
        # Behavior Pack item
        bp_path = os.path.join(bp_dir, f'smelly_staff_{color}_glow.json')
        with open(bp_path, 'w') as f:
            json.dump(create_bp_item(color), f, indent=2)
        print(f'✅ Created BP: {bp_path}')
        
        # Resource Pack item
        rp_path = os.path.join(rp_dir, f'smelly_staff_{color}_glow.json')
        with open(rp_path, 'w') as f:
            json.dump(create_rp_item(color), f, indent=2)
        print(f'✅ Created RP: {rp_path}')

if __name__ == '__main__':
    main()
