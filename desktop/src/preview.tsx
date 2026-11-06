import { createRoot } from "react-dom/client";
import { ShiftRepairApp } from "./App";
import { createFetchRest } from "./api";
import type { SaveFile } from "./types";

const rest = createFetchRest();
const saveFile: SaveFile = async (file) => {
  const blob = new Blob([file.content], { type: file.mime_type || "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "saved";
};

const root = document.getElementById("shiftrepair-root");
if (!root) throw new Error("ShiftRepair mount element was not found.");
createRoot(root).render(<ShiftRepairApp rest={rest} saveFile={saveFile} mode="preview" />);
