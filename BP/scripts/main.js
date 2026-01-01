import { world, system, EquipmentSlot } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

// --- Configuration ---
const SCAN_INTERVAL_TICKS = 10;
const PARTICLES_PER_FLOW = 5; // How many dots in the line
const STAFF_PREFIX = "smellyblox:smelly_staff_";

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
        if (item && item.typeId.startsWith(STAFF_PREFIX)) {
            return item.typeId.replace(STAFF_PREFIX, "");
        }
        return null;
    };

    return check(main) || check(off);
}

// --- UI System ---

async function showMainMenu(player) {
    const config = getConfig(player);
    const equipment = player.getComponent("equippable");
    const offhandItem = equipment.getEquipment(EquipmentSlot.Offhand);
    const mainhandItem = equipment.getEquipment(EquipmentSlot.Mainhand);

    const isMainStaff = mainhandItem && mainhandItem.typeId.startsWith(STAFF_PREFIX);
    const isOffStaff = offhandItem && offhandItem.typeId.startsWith(STAFF_PREFIX);
    const isOffhandEmpty = !offhandItem || offhandItem.typeId === "minecraft:air";
    const isMainhandEmpty = !mainhandItem || mainhandItem.typeId === "minecraft:air";

    const form = new ModalFormData()
        .title("Smelly Blox Scanner")
        .label(`§6Target: §r${config.target}`)
        .toggle("§eChange Target Block?", false)
        .slider("Scan Radius", 1, 16, 1, config.radius);

    // Swap Switch Logic
    let swapLabel = "Swap to Off Hand";
    let swapDisabled = false;
    let initialSwapValue = !!isOffStaff;

    if (isMainStaff) {
        if (!isOffhandEmpty) {
            swapLabel = "§7Swap to Off Hand\n§cHand is NOT Empty";
            swapDisabled = true;
        }
    } else if (isOffStaff) {
        swapLabel = "Swap to Main Hand";
        if (!isMainhandEmpty) {
            swapLabel = "§7Swap to Main Hand\n§cHand is NOT Empty";
            swapDisabled = true;
        }
    }

    form.toggle(swapLabel, initialSwapValue);

    // Active Status Switch (Bottom)
    form.toggle(config.active ? "§aScanner Active" : "§cScanner Inactive", config.active);

    const res = await form.show(player);
    if (res.canceled) return;

    const [changeTarget, radius, swapVal, active] = res.formValues;

    // Apply Settings
    config.radius = radius;
    config.active = active;

    // Process Swap
    if (!swapDisabled) {
        if (isMainStaff && swapVal === true) {
            equipment.setEquipment(EquipmentSlot.Offhand, mainhandItem);
            equipment.setEquipment(EquipmentSlot.Mainhand, undefined);
            player.sendMessage("§aStaff swapped to off hand.");
        } else if (isOffStaff && swapVal === false) {
            equipment.setEquipment(EquipmentSlot.Mainhand, offhandItem);
            equipment.setEquipment(EquipmentSlot.Offhand, undefined);
            player.sendMessage("§aStaff swapped back to main hand.");
        }
    }

    if (changeTarget) {
        showFilterSelection(player);
    } else {
        player.sendMessage("§e[Smelly Blox] Settings Applied.");
    }
}

async function showRadiusSettings(player) {
    const config = getConfig(player);
    const form = new ModalFormData()
        .title("Radius Settings")
        .slider("Scan Radius", 1, 16, 1, config.radius);

    const res = await form.show(player);
    if (res.canceled) {
        showMainMenu(player);
        return;
    }

    config.radius = res.formValues[0];
    player.sendMessage(`§e[Smelly Blox] Radius set to: ${config.radius}`);
    showMainMenu(player); // Loop back
}

async function showFilterSelection(player) {
    const categories = Object.keys(BLOCK_CATEGORIES);
    const form = new ModalFormData()
        .title("Block Browser")
        .dropdown("Category", categories, 0)
        .textField("Search Block Name", "e.g. diamond");

    const res = await form.show(player);
    if (res.canceled) {
        showMainMenu(player);
        return;
    }

    const category = categories[res.formValues[0]];
    const search = res.formValues[1].toLowerCase();
    showBlockSelection(player, category, search);
}

async function showBlockSelection(player, category, search = "") {
    const config = getConfig(player);
    let blocks = [];

    if (category === "All") {
        // Collect all blocks from all categories
        blocks = Object.values(BLOCK_CATEGORIES).flat();
    } else {
        blocks = BLOCK_CATEGORIES[category] || [];
    }

    // Filter by search string
    if (search) {
        blocks = blocks.filter(b => b.toLowerCase().includes(search));
    }

    // Remove duplicates (especially for "All")
    blocks = [...new Set(blocks)];

    const form = new ActionFormData()
        .title(`Results: ${category}`)
        .body(search ? `Filtering by: "${search}"` : "Showing all blocks in category.");

    form.button("§8< Back to Filter");

    if (blocks.length === 0) {
        form.body("§cNo blocks found matching your criteria.");
    } else {
        blocks.forEach(b => {
            const shortName = b.replace("minecraft:", "").replace(/_/g, " ");
            form.button(shortName);
        });
    }

    const res = await form.show(player);
    if (res.canceled) {
        showMainMenu(player);
        return;
    }

    if (res.selection === 0) {
        showFilterSelection(player);
        return;
    }

    config.target = blocks[res.selection - 1];
    player.sendMessage(`§e[Smelly Blox] Target set to: ${config.target}`);
    showMainMenu(player); // Return to main menu
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
