use std::hash::{DefaultHasher, Hash, Hasher};

/// Icons that `tauri::generate_context!()` embeds into the binary. The macro
/// doesn't tell Cargo it reads them, so without this a regenerated icon
/// (`npm run icons`) wouldn't show up until something else forced a rebuild.
const EMBEDDED_ICONS: &[&str] = &[
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.png",
    "icons/icon.icns",
    "icons/icon.ico",
];

fn main() {
    let mut hasher = DefaultHasher::new();
    for path in EMBEDDED_ICONS {
        println!("cargo:rerun-if-changed={path}");
        std::fs::read(path).unwrap_or_default().hash(&mut hasher);
    }
    // A changed env value forces the crate (and the macro) to recompile.
    println!("cargo:rustc-env=GRABBIT_ICONS_HASH={:x}", hasher.finish());

    tauri_build::build()
}
