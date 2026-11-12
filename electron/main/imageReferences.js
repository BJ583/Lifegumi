const path = require("node:path");

function referenceGroups(selectRows, excludingItemId) {
  const groups = selectRows("SELECT id, cover_path, details_json FROM items")
    .filter((row) => String(row.id) !== String(excludingItemId))
    .map((row) => {
      let details = {};
      try { details = JSON.parse(row.details_json || "{}") || {}; } catch {}
      return { kind: "item", paths: [row.cover_path, ...(Array.isArray(details.gallery_paths) ? details.gallery_paths : [])] };
    });
  for (const row of selectRows("SELECT image_path FROM notebook_note_images")) groups.push({ kind: "notebookImage", paths: [row.image_path] });
  return groups;
}

function collectImageReferences(selectRows) {
  return referenceGroups(selectRows).flatMap((group) => group.paths).filter(Boolean);
}

function imageUsage(selectRows, imagePath, excludingItemId) {
  const result = { otherItems: 0, otherReferences: 0 };
  if (!imagePath) return result;
  const target = path.resolve(String(imagePath)).toLowerCase();
  for (const group of referenceGroups(selectRows, excludingItemId)) {
    if (!group.paths.some((value) => value && path.resolve(String(value)).toLowerCase() === target)) continue;
    result.otherReferences += 1;
    if (group.kind === "item") result.otherItems += 1;
  }
  return result;
}
module.exports = { collectImageReferences, imageUsage };
