import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "大佬陪审团 · Sage Jury";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0A1A30 0%, #1A3553 100%)",
          padding: "60px 80px",
          color: "#F5F0E8",
          position: "relative",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "60px",
              height: "60px",
              borderRadius: "12px",
              border: "2px solid #D4AF37",
              fontSize: "30px",
            }}
          >
            ⚖️
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: "24px", fontWeight: 700 }}>大佬陪审团</div>
            <div style={{ fontSize: "14px", color: "#D4AF37", letterSpacing: "0.3em" }}>SAGE JURY</div>
          </div>
        </div>

        <div style={{ marginTop: "60px", fontSize: "72px", fontWeight: 900, lineHeight: 1.1 }}>
          让 6 位投资大佬
        </div>
        <div style={{ fontSize: "72px", fontWeight: 900, lineHeight: 1.1 }}>
          替你<span style={{ color: "#D4AF37" }}>审判</span>每一笔交易
        </div>

        <div style={{ marginTop: "50px", fontSize: "28px", color: "#C2CCD8", lineHeight: 1.4 }}>
          段永平 · 冯柳 · 但斌 · 林园 · 张坤 · 巴菲特
        </div>
        <div style={{ marginTop: "10px", fontSize: "22px", color: "#8FA0B5" }}>
          一笔交易 → 6 张评分卡 → 1 份判决书
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "60px",
            right: "80px",
            display: "flex",
            gap: "12px",
          }}
        >
          {["#1E3A8A", "#7C2D12", "#831843", "#064E3B", "#0C4A6E", "#451A03"].map((c, i) => (
            <div
              key={i}
              style={{
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.3), ${c} 70%)`,
                border: "2px solid #D4AF37",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#F5F0E8",
                fontSize: "16px",
                fontWeight: 700,
              }}
            >
              {["DYP", "FL", "DB", "LY", "ZK", "WB"][i]}
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "30px",
            left: "80px",
            fontSize: "16px",
            color: "#8FA0B5",
            letterSpacing: "0.2em",
          }}
        >
          THE COURT OF INVESTMENT · 2026
        </div>
      </div>
    ),
    size,
  );
}
