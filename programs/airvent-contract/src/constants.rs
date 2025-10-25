/// Total supply: 1 billion AIR tokens (with 9 decimals)
pub const TOTAL_SUPPLY: u64 = 1_000_000_000 * 1_000_000_000;

/// Maximum device ID length (32 bytes for hash-like IDs)
pub const MAX_DEVICE_ID_LEN: usize = 32;

/// Halving interval: 4 years in seconds (like Bitcoin)
pub const HALVING_INTERVAL_SECONDS: i64 = 4 * 365 * 24 * 60 * 60; // ~126M seconds
