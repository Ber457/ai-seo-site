import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baseDir = path.join(__dirname, "../content");

const today = new Date();
const cutoffDate = new Date(today.getFullYear(), today.getMonth(), today.getDate()); // today at 00:00

function wordCount(str) {
  return str.trim().split(/\s+/).length;
}

function shouldDelete(filePath, stats, content) {
  const words = wordCount(content);
  const modified = stats.mtime < cutoffDate;

  return words < 600 || modified;
}

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath);
    } else if (file.endsWith(".md")) {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (shouldDelete(fullPath, stat, content)) {
        console.log("🗑️ Deleting:", fullPath);
        fs.unlinkSync(fullPath);
      }
    }
  }
}

console.log("🧹 Cleaning markdown files in:", baseDir);
walk(baseDir);
console.log("✅ Cleanup done.");
