from PIL import Image
import os

# Paths
base_image_path = "/home/tim/.gemini/antigravity/brain/8f2616e9-16b3-4887-bb4b-0e714c4019a7/uploaded_image_1767471496973.png"
output_dir = "/mnt/z/Minecraft/SmellyBlox/SmellyBlox_RP/textures/particles"

# Color definitions (RGB values for each Minecraft color)
colors = {
    "beam_white": (255, 255, 255),
    "beam_orange": (255, 165, 0),
    "beam_magenta": (255, 0, 255),
    "beam_light_blue": (173, 216, 230),
    "beam_yellow": (255, 255, 0),
    "beam_lime": (191, 255, 0),
    "beam_pink": (255, 192, 203),
    "beam_gray": (128, 128, 128),
    "beam_light_gray": (211, 211, 211),
    "beam_cyan": (0, 255, 255),
    "beam_purple": (128, 0, 128),
    "beam_blue": (0, 0, 255),
    "beam_brown": (139, 69, 19),
    "beam_green": (0, 128, 0),
    "beam_red": (255, 0, 0),
    "beam_black": (64, 64, 64)
}

# Load base image
base_img = Image.open(base_image_path).convert("RGBA")
width, height = base_img.size

print(f"Loaded base image: {width}x{height}")

# Generate colored versions
for color_name, (r, g, b) in colors.items():
    # Create new image
    new_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    
    # Process each pixel
    for x in range(width):
        for y in range(height):
            pixel = base_img.getpixel((x, y))
            
            if len(pixel) == 4:
                old_r, old_g, old_b, alpha = pixel
            else:
                old_r, old_g, old_b = pixel
                alpha = 255
            
            # If pixel has any visibility, recolor it
            if alpha > 0:
                # Use the target color but maintain the alpha
                new_img.putpixel((x, y), (r, g, b, alpha))
    
    # Save
    output_path = os.path.join(output_dir, f"{color_name}.png")
    new_img.save(output_path)
    print(f"Created {color_name}.png")

print("\nAll particle textures created successfully!")
