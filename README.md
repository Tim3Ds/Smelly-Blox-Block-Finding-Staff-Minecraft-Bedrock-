# Smelly Blox Scanner

![Smelly Blox Banner](assets/smelly_blox_banner_1767294530173.png)

**Smelly Blox Scanner** is a powerful Minecraft Bedrock Edition addon that helps players find specific blocks (ores, logs, stones, etc.) using a magical glowing staff. It utilizes particle trails and a sleek custom UI to guide you directly to your target.

---

## 🌟 Features

### 🔍 Precision Scanning
Select any block from a categorized and searchable list. The staff will emit a trail of smelly particles from your head to the nearest target blocks within your selected radius.

### 🎮 Modern UI
Refined **Modal Menu** for quick access to all settings:
- **Target Selection**: Categorized and searchable block browser.
- **Radius Control**: Adjustable scan radius via slider.
- **Hand Swapping**: Toggle the staff between your Main Hand and Off Hand with ease.
- **Active Scanning**: Quickly toggle the scanner on or off.

![Scanner UI Mockup](assets/smelly_blox_ui_mockup_1767294556877.png)

### 🪄 The Smelly Staff
Craftable and dyeable staffs that change particle colors based on their type.
- **Dynamic Particles**: Each staff color has a unique particle effect.
- **Offhand Support**: Use the staff in your offhand while mining!

![Smelly Staff Display](assets/smelly_staff_display_1767294544676.png)

---

## 🛠️ Build & Installation

### Requirements
- Python 3.x

### Generating the `.mcaddon` File
To package the addon for installation, simply run the build script in the root directory:

```bash
./build.py
```

This will generate a file named `SmellyBlox(version).mcaddon` which you can open to import into Minecraft.

---

## 📁 Project Structure

- `BP/`: Behavior Pack (Scripts, Items, etc.)
- `RP/`: Resource Pack (Textures, Models, etc.)
- `build.py`: Automatic build and packaging script.
- `assets/`: Documentation assets and images.

---

## 📝 Configuration
The scanner loop runs every 10 ticks (configurable in `main.js`) and performs a radial scan centered on the player. Particle flow is optimized to provide visual feedback without excessive lag.

Developed for Minecraft Bedrock 1.21.0+.
