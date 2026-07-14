"""
The registered rulesets for Driftt's demo games.

This is the whole integration surface for a game joining the network. There is no
shared stat schema to conform to, no SDK to implement against - you describe your
game in English and the translation engine reasons about the rest. That is why
Emberfall and Nova Drift can be genuinely different genres and still trade items.
"""

RULESETS: dict[str, str] = {
    "emberfall": (
        "Emberfall is a top-down fantasy dungeon crawler. Combat is melee-focused and "
        "deliberate: you close distance, you commit to a swing, you get punished for it. "
        "Items are described by exactly these stats: "
        "ATK (integer 1-100, raw damage per swing), "
        "DEF (integer 1-100, damage mitigated when struck), "
        "ELEMENT (one of: fire, ice, nature - fire burns over time, ice slows, nature drains), "
        "DURABILITY (integer 1-100, how many strikes the item survives before it must be "
        "reforged; heavy, powerful weapons tend to have lower durability). "
        "Overall power scale is 1-100, where 30 is a starting sword, 60 is a boss drop, "
        "and 90+ is a world-defining artifact fewer than a dozen players hold. "
        "The world is ash, ruin, and slow fire. Names and lore are grim and old."
    ),
    "nova-drift": (
        "Nova Drift is a twin-stick sci-fi space shooter. Combat is continuous and mobile: "
        "you never stop moving, you never stop firing, and heat is the real enemy. "
        "Items are described by exactly these stats: "
        "DAMAGE (integer 1-100, damage per projectile), "
        "SHIELD (integer 1-100, absorbed damage before hull loss), "
        "FIRE_RATE (integer 1-100, projectiles per second, higher is faster), "
        "ENERGY_TYPE (one of: plasma, laser, ion - plasma is heavy and burns, laser is "
        "precise and fast, ion disrupts shields), "
        "OVERHEAT_RISK (integer 1-100, chance the weapon locks out after sustained fire; "
        "high-damage weapons carry high overheat risk - this is the balancing cost). "
        "Overall power scale is 1-100, where 30 is a stock cannon, 60 is a salvaged relic, "
        "and 90+ is a prototype that should not exist. "
        "The world is cold, industrial, and lit by reactor glow. Names and lore are clipped "
        "and technical."
    ),
}
