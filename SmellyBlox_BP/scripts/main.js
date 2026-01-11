import { world, system, EquipmentSlot, MolangVariableMap, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// --- Configuration ---
const SCAN_INTERVAL_TICKS = 10;
const PARTICLES_PER_FLOW = 100; // How many dots in the line

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
    "red": "smellyblox:beam_red",
    "black": "smellyblox:beam_black"
};

// Map ores to their variants (regular + deepslate)
const ORE_VARIANTS = {
    // Ores with deepslate variants
    "minecraft:coal_ore": ["minecraft:coal_ore", "minecraft:deepslate_coal_ore"],
    "minecraft:iron_ore": ["minecraft:iron_ore", "minecraft:deepslate_iron_ore"],
    "minecraft:gold_ore": ["minecraft:gold_ore", "minecraft:deepslate_gold_ore"],
    "minecraft:diamond_ore": ["minecraft:diamond_ore", "minecraft:deepslate_diamond_ore"],
    "minecraft:lapis_ore": ["minecraft:lapis_ore", "minecraft:deepslate_lapis_ore"],
    "minecraft:redstone_ore": ["minecraft:redstone_ore", "minecraft:deepslate_redstone_ore"],
    "minecraft:emerald_ore": ["minecraft:emerald_ore", "minecraft:deepslate_emerald_ore"],
    "minecraft:copper_ore": ["minecraft:copper_ore", "minecraft:deepslate_copper_ore"],

    // Sand variants
    "minecraft:sand": ["minecraft:sand", "minecraft:red_sand"],

    // Dirt/Grass variants (useful for terraforming/building)
    "minecraft:dirt": ["minecraft:dirt", "minecraft:grass_block", "minecraft:coarse_dirt", "minecraft:rooted_dirt"],
    "minecraft:grass_block": ["minecraft:dirt", "minecraft:grass_block", "minecraft:coarse_dirt"],

    // Ice variants
    "minecraft:ice": ["minecraft:ice", "minecraft:packed_ice", "minecraft:blue_ice"],
    "minecraft:packed_ice": ["minecraft:ice", "minecraft:packed_ice", "minecraft:blue_ice"],
    "minecraft:blue_ice": ["minecraft:ice", "minecraft:packed_ice", "minecraft:blue_ice"],

    // Blackstone variants (Nether ore-like)
    "minecraft:blackstone": ["minecraft:blackstone", "minecraft:gilded_blackstone"],

    // Basalt variants
    "minecraft:basalt": ["minecraft:basalt", "minecraft:polished_basalt", "minecraft:smooth_basalt"]
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

// Track whether blocks were detected last scan (for glow state transitions)
const playerDetectionState = new Map();

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
            // Remove prefix and _glow suffix to get base color
            return item.typeId
                .replace("smellyblox:smelly_staff_", "")
                .replace("_glow", "");
        }
        return null;
    };

    return check(main) || check(off);
}

function updateStaffGlow(player, shouldGlow) {
    // Update staff to glowing or normal variant based on detection state
    const equipment = player.getComponent("equippable");
    const main = equipment.getEquipment(EquipmentSlot.Mainhand);
    const off = equipment.getEquipment(EquipmentSlot.Offhand);

    // Helper to swap item if it's a staff
    const swapStaff = (item, slot) => {
        if (!item?.typeId?.startsWith("smellyblox:smelly_staff_")) return;

        // Extract color from current item (remove both prefix and _glow suffix if present)
        const color = item.typeId
            .replace("smellyblox:smelly_staff_", "")
            .replace("_glow", "");

        // Build new item ID
        const newId = `smellyblox:smelly_staff_${color}${shouldGlow ? "_glow" : ""}`;

        // Only update if different
        if (item.typeId !== newId) {
            const newItem = new ItemStack(newId, 1);
            equipment.setEquipment(slot, newItem);
        }
    };

    // Check and update both hands
    swapStaff(main, EquipmentSlot.Mainhand);
    swapStaff(off, EquipmentSlot.Offhand);
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

    // Format block name for display (remove minecraft: prefix and replace _ with spaces)
    const targetDisplayName = config.target.replace("minecraft:", "").split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    // Title with target displayed
    const title = `Smelly Blox | Target: ${targetDisplayName}`;

    // Build complete form with all controls
    let form = new ModalFormData()
        .title(title)
        .slider("Range", 1, 16, 1, config.radius)
        .toggle("Change Target Block?", false);

    // Swap control and Activate/Deactivate
    form = form.toggle(isOffhandEmpty ? "Move Staff to Offhand" : "Move Staff to Offhand (Offhand Full)", false)
        .toggle(config.active ? "Deactivate" : "Activate", config.active);

    const res = await form.show(player);
    if (res.canceled) return;

    // formValues layout: [0] range, [1] changeTarget, [2] swap, [3] activate
    const values = res.formValues || [];
    const range = values[0] || config.radius;
    const changeTargetToggle = !!values[1];
    const swapToggle = !!values[2];
    const activateToggle = !!values[3];

    // Apply settings
    config.radius = range;
    config.active = activateToggle;

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
        player.sendMessage(`§e[Smelly Blox] Settings Applied. Scanner: ${config.active ? "Active" : "Inactive"}`);
    }
}


async function showFilterSelection(player) {
    const config = getConfig(player);
    const categories = Object.keys(BLOCK_CATEGORIES);

    // Map categories to representative block icons
    const categoryIcons = {
        "Ores": "textures/blocks/diamond_ore",
        "Logs": "textures/blocks/log_oak",
        "Stones": "textures/blocks/stone",
        "Spawners": "textures/blocks/mob_spawner",
        "Chests": "textures/blocks/chest_front",
        "All": "textures/blocks/grass_side_carried"
    };

    const form = new ActionFormData()
        .title("Select Category")
        .body("Choose a block category to filter results.");

    categories.forEach(c => {
        const iconPath = categoryIcons[c] || "textures/blocks/dirt";
        form.button(c, iconPath);
    });

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

    // Map block IDs to texture paths
    const blockIcons = {
        // Ores
        "minecraft:coal_ore": "textures/blocks/coal_ore",
        "minecraft:iron_ore": "textures/blocks/iron_ore",
        "minecraft:gold_ore": "textures/blocks/gold_ore",
        "minecraft:diamond_ore": "textures/blocks/diamond_ore",
        "minecraft:lapis_ore": "textures/blocks/lapis_ore",
        "minecraft:redstone_ore": "textures/blocks/redstone_ore",
        "minecraft:emerald_ore": "textures/blocks/emerald_ore",
        "minecraft:copper_ore": "textures/blocks/copper_ore",
        "minecraft:quartz_ore": "textures/blocks/quartz_ore",
        "minecraft:nether_gold_ore": "textures/blocks/nether_gold_ore",
        "minecraft:ancient_debris": "textures/blocks/ancient_debris_side",
        // Logs
        "minecraft:oak_log": "textures/blocks/log_oak",
        "minecraft:spruce_log": "textures/blocks/log_spruce",
        "minecraft:birch_log": "textures/blocks/log_birch",
        "minecraft:jungle_log": "textures/blocks/log_jungle",
        "minecraft:acacia_log": "textures/blocks/log_acacia",
        "minecraft:dark_oak_log": "textures/blocks/log_big_oak",
        "minecraft:mangrove_log": "textures/blocks/mangrove_log_side",
        "minecraft:cherry_log": "textures/blocks/cherry_log_side",
        // Stones
        "minecraft:stone": "textures/blocks/stone",
        "minecraft:cobblestone": "textures/blocks/cobblestone",
        "minecraft:deepslate": "textures/blocks/deepslate",
        "minecraft:andesite": "textures/blocks/stone_andesite",
        "minecraft:diorite": "textures/blocks/stone_diorite",
        "minecraft:granite": "textures/blocks/stone_granite",
        // Spawners & Chests
        "minecraft:mob_spawner": "textures/blocks/mob_spawner",
        "minecraft:chest": "textures/blocks/chest_front",
        "minecraft:ender_chest": "textures/blocks/ender_chest_front",
        "minecraft:barrel": "textures/blocks/barrel_side",
        "minecraft:shulker_box": "textures/blocks/shulker_top_undyed"
    };

    const form = new ActionFormData()
        .title(`Select ${category}`)
        .body("Choose the block type to scan for:");

    blocks.forEach(blockId => {
        const iconPath = blockIcons[blockId] || "textures/blocks/dirt";
        const displayName = blockId.replace("minecraft:", "").split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        form.button(displayName, iconPath);
    });

    const res = await form.show(player);
    if (res.canceled) return;

    config.target = blocks[res.selection];
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

        // 1. Scan and Collect
        const foundBlocks = [];
        for (let x = -radius; x <= radius; x++) {
            for (let y = -radius; y <= radius; y++) {
                for (let z = -radius; z <= radius; z++) {
                    // Optimization: Euclidean check first
                    if (x * x + y * y + z * z > radius * radius) continue;

                    const bPos = { x: Math.floor(pPos.x + x), y: Math.floor(pPos.y + y), z: Math.floor(pPos.z + z) };

                    try {
                        const block = dim.getBlock(bPos);
                        // Check if block matches target or any of its variants
                        const variants = ORE_VARIANTS[targetType] || [targetType];
                        if (block && variants.includes(block.typeId)) {
                            foundBlocks.push({ x: bPos.x, y: bPos.y, z: bPos.z });
                        }
                    } catch (e) {
                        // ungenerated chunks etc
                    }
                }
            }
        }

        // 2. Update staff glow based on detection
        const hasBlocks = foundBlocks.length > 0;
        const prevState = playerDetectionState.get(player.name) || false;

        // Only update glow if state changed (to reduce unnecessary updates)
        if (hasBlocks !== prevState) {
            updateStaffGlow(player, hasBlocks);
            playerDetectionState.set(player.name, hasBlocks);
        }

        if (foundBlocks.length === 0) continue;

        // 3. Cluster
        // Simple clustering: group blocks within 1.5 blocks distance (diagonals count)
        const clusters = [];
        const visited = new Set();
        const getKey = (b) => `${b.x},${b.y},${b.z}`;

        for (const block of foundBlocks) {
            const key = getKey(block);
            if (visited.has(key)) continue;

            // Start new cluster
            const cluster = [block];
            visited.add(key);

            // Queue for BFS-like expansion within this cluster
            const queue = [block];

            let idx = 0;
            while (idx < queue.length) {
                const current = queue[idx++];

                // Check all unvisited blocks to see if they are neighbors
                for (const potential of foundBlocks) {
                    const pKey = getKey(potential);
                    if (visited.has(pKey)) continue;

                    const dx = current.x - potential.x;
                    const dy = current.y - potential.y;
                    const dz = current.z - potential.z;

                    if (dx * dx + dy * dy + dz * dz <= 3) { // Adjacent
                        visited.add(pKey);
                        cluster.push(potential);
                        queue.push(potential);
                    }
                }
            }
            clusters.push(cluster);
        }

        // 4. Highlight Clusters
        for (const cluster of clusters) {
            let sumX = 0, sumY = 0, sumZ = 0;
            for (const b of cluster) {
                sumX += b.x;
                sumY += b.y;
                sumZ += b.z;
            }
            const center = {
                x: sumX / cluster.length + 0.5,
                y: sumY / cluster.length + 0.5,
                z: sumZ / cluster.length + 0.5
            };

            spawnFlowParticle(dim, headPos, center, particle, player);
        }

    }
}, SCAN_INTERVAL_TICKS);

function spawnFlowParticle(dimension, start, end, particleId, player) {
    // Spawn point: 1 space in front of player
    const viewDir = player.getViewDirection();
    const spawnPos = {
        x: start.x + viewDir.x * 1.0,
        y: start.y + viewDir.y * 1.0 - 0.3,
        z: start.z + viewDir.z * 1.0
    };

    const vec = { x: end.x - spawnPos.x, y: end.y - spawnPos.y, z: end.z - spawnPos.z };

    // With 6s particle lifetime and 1/3 speed, use 3s travel time
    // This gives particles time to fade/travel naturally
    const timeToReach = 2.0;
    const velocity = {
        x: vec.x / timeToReach,
        y: vec.y / timeToReach,
        z: vec.z / timeToReach
    };

    // Molang variables for velocity
    const molangVars = new MolangVariableMap();
    molangVars.setFloat("variable.dx", velocity.x);
    molangVars.setFloat("variable.dy", velocity.y);
    molangVars.setFloat("variable.dz", velocity.z);

    try {
        dimension.spawnParticle(particleId, spawnPos, molangVars);

        if (particleId.endsWith("_yellow") && !confirmedParticles.has(particleId)) {
            confirmedParticles.add(particleId);
            try { player.sendMessage(`§a[SmellyBlox] Particle flow active: ${particleId}`); } catch (_) { }
        }
    } catch (e) {
        if (!failedParticles.has(particleId)) {
            failedParticles.add(particleId);
            console.warn(`[SmellyBlox] Failed to spawn particle ${particleId}: ${e}`);
        }
    }
}
