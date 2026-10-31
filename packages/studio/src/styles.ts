import type { CSSProperties } from "react";

export const panel: CSSProperties = { flex: 1, padding: "16px", overflowY: "auto" };
export const emptyPanel: CSSProperties = { flex: 1, padding: "16px", color: "#666" };
export const heading: CSSProperties = { fontSize: "14px", margin: "0 0 8px" };
export const headingTight: CSSProperties = { fontSize: "14px", margin: "0 0 4px" };
export const meta: CSSProperties = { fontSize: "12px", color: "#666", marginBottom: "8px" };
export const metaLoose: CSSProperties = { fontSize: "12px", color: "#666", marginBottom: "12px" };
export const backButton: CSSProperties = {
  marginBottom: "8px",
  fontSize: "12px",
  cursor: "pointer",
};

export const codeBlock: CSSProperties = {
  whiteSpace: "pre-wrap",
  fontSize: "12px",
  background: "#f9f9f9",
  padding: "8px",
  border: "1px solid #ddd",
  borderRadius: "4px",
};

export const codeBlockScroll = (maxHeight: string): CSSProperties => ({
  ...codeBlock,
  maxHeight,
  overflowY: "auto",
});

export const listItemButton: CSSProperties = {
  display: "block",
  width: "100%",
  padding: "6px 8px",
  cursor: "pointer",
  borderRadius: "3px",
  marginBottom: "2px",
  fontSize: "12px",
  textAlign: "left",
  fontFamily: "inherit",
  color: "inherit",
};

export function toolbarButton(active: boolean): CSSProperties {
  return {
    display: "inline-block",
    marginRight: "4px",
    padding: "4px 10px",
    border: "1px solid #aaa",
    borderRadius: "3px",
    background: active ? "#d0e4f5" : "#fff",
    cursor: "pointer",
    fontSize: "12px",
  };
}
