import { world, system, EquipmentSlot } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// --- Configuration ---
const SCAN_INTERVAL_TICKS = 10;
const PARTICLES_PER_FLOW = 5; // How many dots in the line

// Map staff color names to vanilla particles
const PARTICLE_MAP = {
    "white": "minecraft:end_rod",
    "orange": "minecraft:lava_drip_particle", // Close enough
    "magenta": "minecraft:heart_particle", // Pinkish
    "light_blue": "minecraft:blue_flame_particle",
    "yellow": "minecraft:totem_particle",
    "lime": "minecraft:villager_happy",
    "pink": "minecraft:heart_particle",
    "gray": "minecraft:campfire_smoke_particle",
    "light_gray": "minecraft:cloud_particle",
    "cyan": "minecraft:soul_particle",
    "purple": "minecraft:dragon_breath_trail",
    "blue": "minecraft:water_splash_particle",
    "brown": "minecraft:mycelium_dust_particle", // Subtle but brown-ish
    "green": "minecraft:villager_happy",
    "red": "minecraft:basic_flame_particle",
    "black": "minecraft:ink_particle"
};

const BLOCK_CATEGORIES = {
    "Ores": ["minecraft:coal_ore", "minecraft:iron_ore", "minecraft:gold_ore", "minecraft:diamond_ore", "minecraft:lapis_ore", "minecraft:redstone_ore", "minecraft:emerald_ore", "minecraft:copper_ore", "minecraft:quartz_ore", "minecraft:nether_gold_ore", "minecraft:ancient_debris"],
    "Logs": ["minecraft:oak_log", "minecraft:spruce_log", "minecraft:birch_log", "minecraft:jungle_log", "minecraft:acacia_log", "minecraft:dark_oak_log", "minecraft:mangrove_log", "minecraft:cherry_log"],
    "Stones": ["minecraft:stone", "minecraft:cobblestone", "minecraft:deepslate", "minecraft:andesite", "minecraft:diorite", "minecraft:granite"],
    "Spawners": ["minecraft:mob_spawner"],
    "Chests": ["minecraft:chest", "minecraft:ender_chest", "minecraft:barrel", "minecraft:shulker_box"],
    "All": [] // Special handling
};

// --- State Management ---
// Map<string (PlayerName), { active: boolean, target: string, radius: number, filter: string }>
const playerConfig = new Map();

function getConfig(player) {
    if (!playerConfig.has(player.name)) {
        playerConfig.set(player.name, {
            active: false,
            target: "minecraft:diamond_ore",
            radius: 5,
            filter: "Ores"
        });
    }
    return playerConfig.get(player.name);
}

// --- Utils ---
function getHoldingStaffColor(player) {
    const equipment = player.getComponent("equippable");
    const main = equipment.getEquipment(EquipmentSlot.Mainhand);
    const off = equipment.getEquipment(EquipmentSlot.Offhand);

    const check = (item) => {
        if (item && item.typeId.startsWith("smellyblox:smelly_staff_")) {
            return item.typeId.replace("smellyblox:smelly_staff_", "");
        }
        return null;
    };

    return check(main) || check(off);
}

// --- UI System ---

async function showMainMenu(player) {
    const config = getConfig(player);
    const form = new ActionFormData()
        .title("Smelly Blox Scanner")
        .body(`Status: ${config.active ? "§aActive" : "§cInactive"}\nTarget: ${config.target}`)
        .button(config.active ? "Stop Scanning" : "Start Scanning")
        .button("Select Target Block")
        .button("Settings");

    // Check Offhand Logic
    const equipment = player.getComponent("equippable");
    const offhandItem = equipment.getEquipment(EquipmentSlot.Offhand);
    const mainhandItem = equipment.getEquipment(EquipmentSlot.Mainhand);
    const isOffhandEmpty = !offhandItem || offhandItem.typeId === "minecraft:air";
    const isHoldingStaff = mainhandItem && mainhandItem.typeId.startsWith("smellyblox:smelly_staff_");

    if (isHoldingStaff) {
        if (isOffhandEmpty) {
            form.button("Move Staff to Offhand");
        } else {
            // "Disabled" button visual hack or just omit/warn
            // ActionFormData doesn't support disabled buttons, so we add a locked icon or warning text
            form.button("§7[Locked] Offhand Full");
        }
    }

    const response = await form.show(player);
    if (response.canceled) return;

    switch (response.selection) {
        case 0: // Toggle
            config.active = !config.active;
            player.sendMessage(`§e[Smelly Blox] Scanner ${config.active ? "enabled" : "disabled"}.`);
            break;
        case 1: // Select Block
            showFilterSelection(player);
            break;
        case 2: // Settings
            showSettings(player);
            break;
        case 3: // Move to Offhand OR Locked
            if (isHoldingStaff && isOffhandEmpty) {
                equipment.setEquipment(EquipmentSlot.Offhand, mainhandItem);
                equipment.setEquipment(EquipmentSlot.Mainhand, undefined);
                player.sendMessage("§aStaff moved to offhand.");
            } else if (isHoldingStaff && !isOffhandEmpty) {
                player.sendMessage("§cError: Offhand must be empty to move the staff.");
            }
            break;
    }
}

async function showFilterSelection(player) {
    const config = getConfig(player);
    const categories = Object.keys(BLOCK_CATEGORIES);

    const form = new ActionFormData()
        .title("Select Category")
        .body("Choose a block category to filter results.");

    categories.forEach(c => form.button(c));

    const res = await form.show(player);
    if (res.canceled) return;

    const selectedCategory = categories[res.selection];
    config.filter = selectedCategory;
    showBlockSelection(player, selectedCategory);
}

async function showBlockSelection(player, category) {
    const config = getConfig(player);
    let blocks = BLOCK_CATEGORIES[category];

    // If 'All' or empty, we basically just show a curated common list because "All blocks" is too big.
    // For this prototype, 'All' will be a fallback list.
    if (category === "All" || !blocks) {
        blocks = [...BLOCK_CATEGORIES["Ores"], ...BLOCK_CATEGORIES["Logs"], ...BLOCK_CATEGORIES["Stones"]];
    }

    const form = new ModalFormData()
        .title(`Select ${category}`)
        .dropdown("Choose Block", blocks, 0);

    const res = await form.show(player);
    if (res.canceled) return;

    config.target = blocks[res.formValues[0]];
    player.sendMessage(`§e[Smelly Blox] Target set to: ${config.target}`);
}

async function showSettings(player) {
    const config = getConfig(player);
    const form = new ModalFormData()
        .title("Scanner Settings")
        .slider("Scan Radius", 1, 16, 1, config.radius);

    const res = await form.show(player);
    if (res.canceled) return;

    config.radius = res.formValues[0];
    player.sendMessage(`§e[Smelly Blox] Radius set to: ${config.radius}`);
}

// --- Event Listeners ---

world.afterEvents.itemUse.subscribe((event) => {
    if (event.itemStack.typeId.startsWith("smellyblox:smelly_staff_")) {
        showMainMenu(event.source);
    }
});

// --- Scanner Loop ---

system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        const config = getConfig(player);
        if (!config.active) continue;

        const staffColor = getHoldingStaffColor(player);
        if (!staffColor) {
            // Paused if not holding staff
            continue;
        }

        const particle = PARTICLE_MAP[staffColor] || "minecraft:basic_flame_particle";
        const radius = config.radius;
        const targetType = config.target;

        // Scan
        const dim = player.dimension;
        const pPos = player.location;
        const headPos = player.getHeadLocation();

        // Naive scan (optimized: checking manhattan distance or simple loop)
        for (let x = -radius; x <= radius; x++) {
            for (let y = -radius; y <= radius; y++) {
                for (let z = -radius; z <= radius; z++) {
                    const bPos = { x: Math.floor(pPos.x + x), y: Math.floor(pPos.y + y), z: Math.floor(pPos.z + z) };

                    // Skip if too far (Euclidean check for circle)
                    if (x * x + y * y + z * z > radius * radius) continue;

                    try {
                        const block = dim.getBlock(bPos);
                        if (block && block.typeId === targetType) {
                            // Found block! Highlight logic.
                            highlightBlock(dim, headPos, block.center(), particle);
                        }
                    } catch (e) {
                        // ungenerated chunks etc
                    }
                }
            }
        }
    }
}, SCAN_INTERVAL_TICKS);

function highlightBlock(dimension, start, end, particleId) {
    // Draw flow line from start (head) to end (block)
    // We only spawn a few particles along the vector
    const vec = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z };
    const dist = Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);

    // Normalize
    const dir = { x: vec.x / dist, y: vec.y / dist, z: vec.z / dist };

    // Spawn points
    let step = Math.max(1, dist / PARTICLES_PER_FLOW);

    // We can animate the flow: use system.currentTick to offset?
    // For now, simpler static stream + end highlight

    // 1. Highlight the block itself (dense)
    dimension.spawnParticle(particleId, end);

    // 2. Stream particles (randomized slightly)
    // We spawn 1 particle at a random point along the line each tick, creating a flow effect over time
    // Or just 3 fixed points.
    for (let i = 1; i < dist; i += step) {
        const pos = {
            x: start.x + dir.x * i,
            y: start.y + dir.y * i + 0.5, // slightly lower than head
            z: start.z + dir.z * i
        };
        dimension.spawnParticle(particleId, pos);
    }
}
