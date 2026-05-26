import { ImageResponse } from "next/og";

import { SITE_DESCRIPTION } from "@/lib/site/metadata";

export const runtime = "edge";
export const alt = "FYB Studio - final-year design templates";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#070707",
          color: "#f8f3df",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "#070707",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: -120,
            top: -160,
            width: 520,
            height: 520,
            borderRadius: 9999,
            background: "rgba(255,215,0,0.18)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: -140,
            top: -120,
            width: 440,
            height: 440,
            borderRadius: 9999,
            background: "rgba(78,205,196,0.16)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 42,
            border: "1px solid rgba(255,215,0,0.24)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 82,
            top: 72,
            width: 82,
            height: 82,
            borderRadius: 18,
            background: "#ffd700",
            boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#111",
            fontSize: 32,
            fontWeight: 900,
            letterSpacing: "-0.02em",
          }}
        >
          FYB
        </div>
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            padding: "72px 82px",
            gap: 54,
            position: "relative",
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: "#ffd700",
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: "0.02em",
              }}
            >
              FYB Studio
            </div>
            <div
              style={{
                marginTop: 34,
                fontSize: 76,
                lineHeight: 0.92,
                fontWeight: 900,
                letterSpacing: "-0.02em",
                maxWidth: 660,
              }}
            >
              Final-year designs,
              <br />
              built to ship.
            </div>
            <div
              style={{
                marginTop: 28,
                fontSize: 28,
                lineHeight: 1.35,
                color: "rgba(248,243,223,0.76)",
                maxWidth: 620,
              }}
            >
              {SITE_DESCRIPTION}
            </div>
            <div
              style={{
                marginTop: 26,
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                borderRadius: 999,
                border: "1px solid rgba(255,215,0,0.35)",
                background: "rgba(255,215,0,0.08)",
                color: "#ffd700",
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Templates • Live Preview • Export
            </div>
          </div>

          <div
            style={{
              width: 360,
              height: 486,
              display: "flex",
              alignSelf: "center",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 34,
                top: 20,
                width: 250,
                height: 390,
                background: "#f8f3df",
                opacity: 0.16,
                transform: "rotate(-8deg)",
              }}
            />
            <div
              style={{
                position: "absolute",
                right: 4,
                top: 66,
                width: 250,
                height: 390,
                background: "#4ecdc4",
                opacity: 0.2,
                transform: "rotate(7deg)",
              }}
            />
            <div
              style={{
                width: 292,
                height: 440,
                margin: "18px auto 0",
                display: "flex",
                flexDirection: "column",
                background: "#161616",
                border: "1px solid rgba(255,215,0,0.34)",
                boxShadow: "0 28px 80px rgba(0,0,0,0.38)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: 260,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background:
                    "linear-gradient(160deg, #ffd700 0%, #f8f3df 55%, #4ecdc4 100%)",
                  color: "#090909",
                  fontSize: 80,
                  fontWeight: 900,
                  letterSpacing: "-0.02em",
                }}
              >
                GRAD
              </div>
              <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ width: 170, height: 16, background: "rgba(248,243,223,0.88)" }} />
                <div style={{ width: 220, height: 12, background: "rgba(248,243,223,0.34)" }} />
                <div style={{ width: 140, height: 12, background: "rgba(255,215,0,0.42)" }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    size
  );
}
