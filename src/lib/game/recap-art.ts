import { recapAvatarSrc, recapHeadline, recapScoreLabel, type Recap } from "./recap";

const W = 1080;
const H = 1480;
const BG = "#0b0d0c";
const SURFACE = "#151918";
const SURFACE2 = "#1c221f";
const FG = "#e8ebe6";
const MUTED = "#8b948c";
const SUBTLE = "#5c645e";
const TURF = "#6a7d6c";
const GOOD = "#7d9a7a";
const DANGER = "#c45c4a";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function faces(recap: Recap): Promise<[HTMLImageElement | null, HTMLImageElement | null]> {
  const [a, b] = await Promise.all([loadImage(recapAvatarSrc(recap.avatars[0])), loadImage(recapAvatarSrc(recap.avatars[1]))]);
  return [a, b];
}

export async function renderRecapPng(recap: Recap): Promise<Blob> {
  if (typeof document !== "undefined") {
    try {
      await document.fonts.ready;
    } catch {
      /* ignore */
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  const photos = await faces(recap);

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = TURF;
  ctx.font = "600 28px 'Barlow Condensed', Barlow, sans-serif";
  ctx.fillText("DARKNESS", 72, 88);

  ctx.fillStyle = FG;
  ctx.font = "600 72px 'Barlow Condensed', Barlow, sans-serif";
  ctx.fillText(recapHeadline(recap).toUpperCase(), 72, 168);

  const winnerName = recap.winner === null ? "Draw" : recap.names[recap.winner];
  ctx.fillStyle = MUTED;
  ctx.font = "500 28px Barlow, sans-serif";
  ctx.fillText(recap.winner === null ? "The night ended even." : `${winnerName} takes the night.`, 72, 214);

  const cardY = 248;
  const cardH = 220;
  const gap = 24;
  const cardW = (W - 72 * 2 - gap) / 2;
  for (const seat of [0, 1] as const) {
    const x = 72 + seat * (cardW + gap);
    const won = recap.winner === seat;
    ctx.fillStyle = SURFACE;
    roundRect(ctx, x, cardY, cardW, cardH, 18);
    ctx.fill();
    if (won) {
      ctx.strokeStyle = GOOD;
      ctx.lineWidth = 3;
      roundRect(ctx, x, cardY, cardW, cardH, 18);
      ctx.stroke();
    }
    const photo = photos[seat];
    if (photo) {
      ctx.save();
      roundRect(ctx, x + 24, cardY + 28, 88, 88, 12);
      ctx.clip();
      ctx.drawImage(photo, x + 24, cardY + 28, 88, 88);
      ctx.restore();
    } else {
      ctx.fillStyle = SURFACE2;
      roundRect(ctx, x + 24, cardY + 28, 88, 88, 12);
      ctx.fill();
    }
    ctx.fillStyle = SUBTLE;
    ctx.font = "600 20px 'Barlow Condensed', Barlow, sans-serif";
    ctx.fillText(won ? "WINNER" : recap.winner === null ? "GM" : "FIELD", x + 132, cardY + 52);
    ctx.fillStyle = FG;
    ctx.font = "600 36px 'Barlow Condensed', Barlow, sans-serif";
    const name = recap.names[seat];
    ctx.fillText(name.length > 10 ? `${name.slice(0, 10)}…` : name, x + 132, cardY + 96);
    ctx.fillStyle = won ? GOOD : recap.winner === null ? FG : DANGER;
    ctx.font = "600 64px 'Barlow Condensed', Barlow, sans-serif";
    ctx.fillText(recapScoreLabel(recap, seat), x + 24, cardY + 186);
  }

  const boardY = cardY + cardH + 36;
  ctx.fillStyle = SURFACE;
  roundRect(ctx, 72, boardY, W - 144, H - boardY - 88, 18);
  ctx.fill();

  const rows = Math.max(recap.lines[0].length, recap.lines[1].length);
  const rowH = Math.min(64, (H - boardY - 140) / Math.max(1, rows));
  ctx.font = "600 22px 'Barlow Condensed', Barlow, sans-serif";
  ctx.fillStyle = SUBTLE;
  ctx.fillText("HOME", 108, boardY + 44);
  ctx.textAlign = "right";
  ctx.fillText("AWAY", W - 108, boardY + 44);
  ctx.textAlign = "left";

  for (let i = 0; i < rows; i++) {
    const y = boardY + 64 + i * rowH;
    const left = recap.lines[0][i];
    const right = recap.lines[1][i];
    ctx.fillStyle = i % 2 === 0 ? "rgba(232,235,230,0.03)" : "transparent";
    ctx.fillRect(88, y, W - 176, rowH - 4);
    ctx.fillStyle = SUBTLE;
    ctx.font = "600 20px 'Barlow Condensed', Barlow, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(left?.slot || right?.slot || "", W / 2, y + rowH * 0.62);
    ctx.textAlign = "left";
    ctx.fillStyle = FG;
    ctx.font = "500 26px Barlow, sans-serif";
    ctx.fillText(left?.name ?? "—", 108, y + rowH * 0.62);
    ctx.textAlign = "right";
    ctx.fillText(right?.name ?? "—", W - 108, y + rowH * 0.62);
    ctx.textAlign = "left";
  }

  ctx.fillStyle = SUBTLE;
  ctx.font = "500 22px Barlow, sans-serif";
  ctx.fillText("darkness", 72, H - 40);

  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("png failed"));
    }, "image/png");
  });
}
