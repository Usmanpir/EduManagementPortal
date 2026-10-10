import { ImageResponse } from "next/og";

export const alt = "EduAttend — run your whole school from one simple platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Social preview card shown when the site is shared on WhatsApp, Facebook, LinkedIn or X. */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#f5f6fa", color: "#141824" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: "#4f55e6", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>EduAttend</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1, maxWidth: 980 }}>Run your whole school from one simple platform.</div>
          <div style={{ fontSize: 32, color: "#545b6b" }}>Attendance, fees, exams, parents and reports</div>
        </div>
      </div>
    ),
    size,
  );
}
