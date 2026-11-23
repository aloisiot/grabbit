// Progressive enhancement: every link already works without this script.
// Here we only point the main button at the right installer for this visitor.
(async () => {
  let release;
  try {
    release = JSON.parse(document.getElementById("release-data").textContent);
  } catch {
    return;
  }
  const assets = release.assets || {};

  const ua = navigator.userAgent;
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  let os = null;
  if (/iPhone|iPad|iPod|Android/i.test(ua)) os = null; // Desktop-only app: leave the generic button.
  else if (/Mac/i.test(platform) || /Mac OS X/.test(ua)) os = "mac";
  else if (/Win/i.test(platform) || /Windows/.test(ua)) os = "windows";
  else if (/Linux/i.test(platform) || /Linux/.test(ua)) os = "linux";
  if (!os) return;

  // Browsers hide the CPU type on Macs; Chromium can tell us, others can't.
  // Default to Apple Silicon (every Mac sold since 2023); Intel is one click away.
  let arch = "arm";
  if (os === "mac" && navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
    try {
      const { architecture } = await navigator.userAgentData.getHighEntropyValues(["architecture"]);
      if (architecture === "x86") arch = "x64";
    } catch {
      /* keep default */
    }
  }

  const choice = {
    mac: { key: arch === "x64" ? "mac-x64" : "mac-arm", label: arch === "x64" ? "Download for Mac (Intel)" : "Download for Mac" },
    windows: { key: "win-exe", label: "Download for Windows" },
    linux: { key: "linux-appimage", label: "Download for Linux" },
  }[os];

  const asset = assets[choice.key];
  const primary = document.getElementById("primary-download");
  if (asset && primary) {
    primary.href = asset.url;
    primary.textContent = choice.label;
  }

  const card = document.querySelector(`.platform[data-os="${os}"]`);
  if (card) {
    card.classList.add("is-current");
    card.parentElement.prepend(card);
    const rec = asset && card.querySelector(`a[href="${CSS.escape(asset.url)}"]`);
    if (rec) rec.classList.add("is-recommended");
  }
  const step = document.querySelector(`.steps article[data-os="${os}"]`);
  if (step) step.parentElement.prepend(step);
})();
