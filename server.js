import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Routes
import walletRoute from "./routes/walletRoute.js";
import withdrawRoute from "./routes/withdrawRoute.js";

// ---------- PATH SETUP ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- APP SETUP ----------
const app = express();
const PORT = process.env.PORT || 3000;

// ---------- REQUIRED ENV CHECK ----------
if (!process.env.FORWARDED_BANK_SECRET || !process.env.FORWARDED_BANK_URL) {
  console.error("❌ Forwarded Bank environment variables missing");
  process.exit(1);
}

// ---------- MIDDLEWARE ----------
app.use(express.json());

// ---------- PUBLIC FOLDER ----------
app.use(express.static(path.join(__dirname, "public")));

// ---------- SERVE INDEX.HTML ----------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ---------- WALLET FILE ----------
const WALLET_FILE = path.join(__dirname, "wallet.json");

// ---------- WALLET HELPERS ----------
function readWallet() {
  if (!fs.existsSync(WALLET_FILE)) {
    fs.writeFileSync(
      WALLET_FILE,
      JSON.stringify(
        {
          balance: 0, // SKD
          wallet: { ngn: 0, usd: 0 },
          lockedAmount: 0,
          lastMined: Date.now()
        },
        null,
        2
      )
    );
  }
  return JSON.parse(fs.readFileSync(WALLET_FILE, "utf-8"));
}

function writeWallet(wallet) {
  fs.writeFileSync(WALLET_FILE, JSON.stringify(wallet, null, 2));
}

// ---------- CONFIG ----------
const SKD_TO_NGN = Number(process.env.SKD_TO_NGN) || 3000000;
const SKD_TO_USD = 2000;
const MIN_WITHDRAW_SKD = Number(process.env.MIN_WITHDRAW_SKD) || 0;

// ---------- AUTO-MINING ----------
function updateMining() {
  const wallet = readWallet();
  const now = Date.now();
  const last = wallet.lastMined || now;
  const secondsPassed = Math.floor((now - last) / 1000);

  if (secondsPassed > 0) {
    wallet.balance += secondsPassed * 20;
    wallet.lastMined = now;
    writeWallet(wallet);
  }

  return wallet;
}

// ---------- OPTIONAL: INTERNAL FUND CREDIT (FROM FORWARDED BANK) ----------
app.post("/internal/credit", (req, res) => {
  const { amountNGN } = req.body;

  if (!amountNGN) {
    return res.status(400).json({ error: "Amount required" });
  }

  const wallet = readWallet();
  wallet.wallet.ngn += amountNGN;
  writeWallet(wallet);

  res.json({
    success: true,
    message: "Wallet credited internally",
    amount: amountNGN
  });
});

// ---------- SHARE WITH ROUTES ----------
app.locals = {
  readWallet,
  writeWallet,
  updateMining,
  SKD_TO_NGN,
  SKD_TO_USD,
  MIN_WITHDRAW_SKD,
  FORWARDED_BANK_SECRET: process.env.FORWARDED_BANK_SECRET,
  FORWARDED_BANK_URL: process.env.FORWARDED_BANK_URL,
  WALLET_SIGNING_SECRET: process.env.WALLET_SIGNING_SECRET
};

// ---------- ROUTES ----------
app.use("/wallet", walletRoute);
app.use("/withdraw", withdrawRoute);

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`🚀 Mine backend running on http://localhost:${PORT}`);
});
