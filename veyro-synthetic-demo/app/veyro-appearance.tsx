"use client";

import { useEffect, useState } from "react";
import { COMPANY_GROUPS } from "../lib/company-groups";

export function AppearancePicker() {
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function selectTheme(next: "light" | "dark") {
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try { localStorage.setItem("veyro-demo-theme", next); } catch { /* Appearance still works without storage. */ }
  }

  return <div className="appearance-picker" role="group" aria-label="Colour theme">
    <button type="button" aria-pressed={theme === "light"} onClick={() => selectTheme("light")}>Light</button>
    <button type="button" aria-pressed={theme === "dark"} onClick={() => selectTheme("dark")}>Dark</button>
  </div>;
}

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 500);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return visible ? <a className="back-to-top" href="#dashboard-top" aria-label="Back to top">↑<span>Top</span></a> : null;
}

/** Use the same four labels as the company list so the overview stays consistent. */
export function ResearchLandscape() {
  return <div className="research-landscape" role="img" aria-label={`Four parts of the AI landscape: ${COMPANY_GROUPS.map(group => group.label).join(", ")}.`}>
    <div className="graphic-orbit orbit-one" aria-hidden="true" />
    <div className="graphic-orbit orbit-two" aria-hidden="true" />
    <div className="graphic-centre" aria-hidden="true"><span>AI</span><small>LANDSCAPE</small></div>
    {COMPANY_GROUPS.map((group, index) => <div key={group.id} className={`graphic-chip chip-${index + 1}`} aria-hidden="true">
      <span className="chip-number">{String(index + 1).padStart(2, "0")}</span><span>{group.label}</span>
    </div>)}
    <div className="graphic-corner top-left" aria-hidden="true">RESEARCH / 01</div>
    <div className="graphic-corner bottom-right" aria-hidden="true">AI COMPANY PROFILES</div>
  </div>;
}
