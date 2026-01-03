import { world, system, EquipmentSlot } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// --- Configuration ---
const SCAN_INTERVAL_TICKS = 10;
const PARTICLES_PER_FLOW = 30; // How many dots in the line

// Map staff color names to vanilla particles
const PARTICLE_MAP = {
    "white": "smellyblox:beam_white",
    "orange": "smellyblox:beam_orange",
    "magenta": "smellyblox:beam_magenta",
    "light_blue": "smellyblox:beam_light_blue",
    "yellow": "smellyblox:beam_yellow",
    "lime": "smellyblox:beam_lime",
    "pink": "smellyblox:beam_pink",
    "gray": "smellyblox:beam_gray",
    "light_gray": "smellyblox:beam_light_gray",
    "cyan": "smellyblox:beam_cyan",
    "purple": "smellyblox:beam_purple",
    "blue": "smellyblox:beam_blue",
    "brown": "smellyblox:beam_brown",
    "green": "smellyblox:beam_green",
    "red": "minecraft:basic_flame_particle",
    "black": "smellyblox:beam_black"
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

// Cache particle availability checks to avoid spamming
const confirmedParticles = new Set();
const failedParticles = new Set();

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

    // Equipment state for swap logic
    const equipment = player.getComponent("equippable");
    const offhandItem = equipment.getEquipment(EquipmentSlot.Offhand);
    const mainhandItem = equipment.getEquipment(EquipmentSlot.Mainhand);
    const isOffhandEmpty = !offhandItem || offhandItem.typeId === "minecraft:air";
    const isHoldingStaff = mainhandItem && mainhandItem.typeId && mainhandItem.typeId.startsWith("smellyblox:smelly_staff_");

    // If holding a staff, check if its custom particle previously failed and reflect in the title
    const staffColor = getHoldingStaffColor(player);
    let titleText = "Smelly Blox Scanner";
    if (staffColor) {
        const pid = `smellyblox:beam_${staffColor}`;
        if (failedParticles.has(pid)) {
            titleText += " (particle missing)";
        }
    }

    // Build a modal form with radius at top-level
    let form = new ModalFormData()
        .title(titleText)
        .slider("Scan Radius", 1, 16, 1, config.radius)
        .toggle(config.active ? "Scanner Active" : "Scanner Inactive", config.active)
        .toggle("Change Target Block?", false);

    // Swap control (show even if not holding staff to make intent clear)
    if (isHoldingStaff) {
        form = form.toggle(isOffhandEmpty ? "Move Staff to Offhand" : "Move Staff to Offhand (Offhand Full)", false);
    } else {
        form = form.toggle("Move Staff to Offhand (Not Holding Staff)", false);
    }

    const res = await form.show(player);
    if (res.canceled) return;

    // formValues layout: [radius, activeToggle, changeTargetToggle, swapToggle]
    const values = res.formValues || [];
    const radius = values[0] || config.radius;
    const activeToggle = !!values[1];
    const changeTargetToggle = !!values[2];
    const swapToggle = !!values[3];

    // Apply settings
    config.radius = radius;
    config.active = !!activeToggle;

    // Process swap if requested
    if (swapToggle) {
        if (isHoldingStaff && isOffhandEmpty) {
            equipment.setEquipment(EquipmentSlot.Offhand, mainhandItem);
            equipment.setEquipment(EquipmentSlot.Mainhand, undefined);
            player.sendMessage("§aStaff moved to offhand.");
        } else if (isHoldingStaff && !isOffhandEmpty) {
            player.sendMessage("§cError: Offhand must be empty to move the staff.");
        } else {
            player.sendMessage("§cError: You must hold the staff in your main hand to move it.");
        }
    }

    if (changeTargetToggle) {
        showFilterSelection(player);
    } else {
        player.sendMessage(`§e[Smelly Blox] Settings Applied. Status: ${config.active ? "Active" : "Inactive"}. Target: ${config.target}`);
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
                            highlightBlock(dim, headPos, block.center(), particle, player);
                        }
                    } catch (e) {
                        // ungenerated chunks etc
                    }
                }
            }
        }
    }
}, SCAN_INTERVAL_TICKS);

function highlightBlock(dimension, start, end, particleId, player) {
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
    try {
        dimension.spawnParticle(particleId, end);
        // If this is the yellow custom particle, notify the player once on success
        if (particleId.endsWith("_yellow") && !confirmedParticles.has(particleId)) {
            confirmedParticles.add(particleId);
            try { player.sendMessage(`§a[SmellyBlox] Custom particle available: ${particleId}`); } catch (_) { }
        }
    } catch (e) {
        // mark failure once to avoid log spam
        if (!failedParticles.has(particleId)) {
            failedParticles.add(particleId);
            console.warn(`[SmellyBlox] spawnParticle failed for ${particleId}: ${e}`);
        }
        // Fallback to a vanilla particle so the player still sees something
        try { dimension.spawnParticle("minecraft:end_rod", end); } catch (_) { }
    }

    // 2. Stream particles (randomized slightly)
    // We spawn 1 particle at a random point along the line each tick, creating a flow effect over time
    // Or just 3 fixed points.
    for (let i = 1; i < dist; i += step) {
        const pos = {
            x: start.x + dir.x * i,
            y: start.y + dir.y * i + 0.5, // slightly lower than head
            z: start.z + dir.z * i
        };
        try {
            dimension.spawnParticle(particleId, pos);
            if (particleId.endsWith("_yellow") && !confirmedParticles.has(particleId)) {
                confirmedParticles.add(particleId);
                try { player.sendMessage(`§a[SmellyBlox] Custom particle available: ${particleId}`); } catch (_) { }
            }
        } catch (e) {
            if (!failedParticles.has(particleId)) {
                failedParticles.add(particleId);
                console.warn(`[SmellyBlox] spawnParticle failed for ${particleId}: ${e}`);
            }
            try { dimension.spawnParticle("minecraft:end_rod", pos); } catch (_) { }
        }
    }
}
